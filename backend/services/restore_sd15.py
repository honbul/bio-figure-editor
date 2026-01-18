from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException
from PIL import Image

from .restore_common import (
    DEFAULT_PROMPT,
    RestoreEngineError,
    hf_offline_hint,
    pick_device,
    resize_long_edge,
)


@dataclass
class Sd15Params:
    steps: int = 20
    guidance_scale: float = 6.0
    seed: int | None = None
    resize_long_edge: int | None = 768


class Sd15InpaintService:
    _pipe: object | None
    _device: str

    def reset(self) -> None:
        self._pipe = None
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass

    def __init__(self):
        self._pipe = None
        self._device = pick_device()

    def _get_pipe(self):
        if self._pipe is not None:
            return self._pipe

        try:
            import torch
            from diffusers.pipelines.stable_diffusion.pipeline_stable_diffusion_inpaint import (
                StableDiffusionInpaintPipeline,
            )
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"diffusers/torch missing: {e}")

        model_id = "stable-diffusion-v1-5/stable-diffusion-inpainting"

        dtype = torch.float16 if self._device == "cuda" else torch.float32
        try:
            pipe = StableDiffusionInpaintPipeline.from_pretrained(
                model_id,
                torch_dtype=dtype,
                local_files_only=True,
            )
        except Exception as e:
            raise HTTPException(
                status_code=503,
                detail=f"SD1.5 inpaint weights not available offline. {hf_offline_hint()} Error: {e}",
            )

        if self._device == "cuda":
            pipe = pipe.to("cuda")
        else:
            raise HTTPException(
                status_code=503,
                detail=(
                    "SD1.5 inpaint requires CUDA for practical use in this app. "
                    "Set SAM3_DEVICE/cuda and ensure a GPU is available."
                ),
            )

        self._pipe = pipe
        return pipe

    def run(
        self,
        init_rgb: Image.Image,
        mask_l: Image.Image,
        prompt: str | None,
        params: Sd15Params,
    ) -> Image.Image:
        pipe = self._get_pipe()

        p = (prompt or "").strip() or DEFAULT_PROMPT

        img = init_rgb.convert("RGB")
        mask = mask_l.convert("L")

        if params.resize_long_edge is not None:
            img, mask, orig_size = resize_long_edge(
                img, mask, int(params.resize_long_edge)
            )
        else:
            orig_size = img.size

        try:
            import torch

            generator = None
            if params.seed is not None:
                generator = torch.Generator(device="cuda").manual_seed(int(params.seed))

            out = pipe(
                prompt=p,
                image=img,
                mask_image=mask,
                num_inference_steps=int(max(1, min(100, params.steps))),
                guidance_scale=float(params.guidance_scale),
                generator=generator,
            ).images[0]
        except RuntimeError as e:
            msg = str(e)
            if "out of memory" in msg.lower():
                raise RestoreEngineError(
                    code="oom",
                    message=f"CUDA OOM while running SD1.5 inpaint: {e}",
                    suggestions=[
                        "Lower steps (e.g., 15)",
                        "Set resize_long_edge=512 or 768",
                        "Try SD1.5 (fastest) if other engines OOM",
                    ],
                )
            raise

        if out.size != orig_size:
            out = out.resize(orig_size, resample=Image.BICUBIC)

        return out
