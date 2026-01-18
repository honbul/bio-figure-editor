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
class Kandinsky22Params:
    steps: int = 30
    guidance_scale: float = 4.0
    seed: int | None = None
    resize_long_edge: int | None = 1024


class Kandinsky22InpaintService:
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

        if self._device != "cuda":
            raise HTTPException(
                status_code=503,
                detail=(
                    "Kandinsky 2.2 inpaint requires CUDA for practical use in this app. "
                    "Try SD1.5 if you need a lighter engine."
                ),
            )

        try:
            import torch
            from diffusers import AutoPipelineForInpainting
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"diffusers/torch missing: {e}")

        model_id = "kandinsky-community/kandinsky-2-2-decoder-inpaint"

        try:
            pipe = AutoPipelineForInpainting.from_pretrained(
                model_id,
                torch_dtype=torch.float16,
                local_files_only=True,
            )
            pipe = pipe.to("cuda")
        except Exception as e:
            raise HTTPException(
                status_code=503,
                detail=f"Kandinsky 2.2 weights not available offline. {hf_offline_hint()} Error: {e}",
            )

        self._pipe = pipe
        return pipe

    def run(
        self,
        init_rgb: Image.Image,
        mask_l: Image.Image,
        prompt: str | None,
        params: Kandinsky22Params,
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
                num_inference_steps=int(max(1, min(200, params.steps))),
                guidance_scale=float(params.guidance_scale),
                generator=generator,
            ).images[0]
        except RuntimeError as e:
            msg = str(e)
            if "out of memory" in msg.lower():
                raise RestoreEngineError(
                    code="oom",
                    message=f"CUDA OOM while running Kandinsky 2.2 inpaint: {e}",
                    suggestions=[
                        "Lower steps (e.g., 20-30)",
                        "Set resize_long_edge=768",
                        "Switch engine to SD1.5",
                    ],
                )
            raise

        if out.size != orig_size:
            out = out.resize(orig_size, resample=Image.BICUBIC)

        return out
