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
class SdxlParams:
    steps: int = 20
    guidance_scale: float = 5.5
    strength: float | None = None
    seed: int | None = None
    resize_long_edge: int | None = 1024


class SdxlInpaintService:
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
            from diffusers import StableDiffusionXLInpaintPipeline
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"diffusers/torch missing: {e}")

        model_id = "diffusers/stable-diffusion-xl-1.0-inpainting-0.1"

        if self._device != "cuda":
            raise HTTPException(
                status_code=503,
                detail=(
                    "SDXL inpaint requires CUDA for practical use in this app. "
                    "Try SD1.5 if you need a lighter engine."
                ),
            )

        try:
            pipe = StableDiffusionXLInpaintPipeline.from_pretrained(
                model_id,
                torch_dtype=torch.float16,
                variant="fp16",
                use_safetensors=True,
                local_files_only=True,
            ).to("cuda")
        except Exception as e:
            raise HTTPException(
                status_code=503,
                detail=f"SDXL inpaint weights not available offline. {hf_offline_hint()} Error: {e}",
            )

        self._pipe = pipe
        return pipe

    def run(
        self,
        init_rgb: Image.Image,
        mask_l: Image.Image,
        prompt: str | None,
        params: SdxlParams,
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

            call_kwargs = {
                "prompt": p,
                "image": img,
                "mask_image": mask,
                "num_inference_steps": int(max(1, min(100, params.steps))),
                "guidance_scale": float(params.guidance_scale),
                "generator": generator,
            }
            if params.strength is not None:
                call_kwargs["strength"] = float(params.strength)

            out = pipe(**call_kwargs).images[0]
        except RuntimeError as e:
            msg = str(e)
            if "out of memory" in msg.lower():
                raise RestoreEngineError(
                    code="oom",
                    message=f"CUDA OOM while running SDXL inpaint: {e}",
                    suggestions=[
                        "Lower steps (e.g., 15-20)",
                        "Set resize_long_edge=768",
                        "Switch engine to SD1.5",
                    ],
                )
            raise

        if out.size != orig_size:
            out = out.resize(orig_size, resample=Image.BICUBIC)

        return out
