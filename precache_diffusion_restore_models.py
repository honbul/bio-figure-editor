from __future__ import annotations

import os
import sys
import time


def _print_env() -> None:
    keys = [
        "HF_HOME",
        "HF_HUB_OFFLINE",
        "TRANSFORMERS_CACHE",
        "HF_DATASETS_CACHE",
        "DIFFUSERS_CACHE",
    ]
    print("Environment:")
    for k in keys:
        v = os.environ.get(k)
        if v:
            print(f"- {k}={v}")


def _cache_one(name: str, fn) -> None:
    print(f"\n== {name} ==")
    started = time.time()
    try:
        fn()
    except Exception as e:
        dur = time.time() - started
        print(f"FAILED ({dur:.1f}s): {type(e).__name__}: {e}")
        raise
    dur = time.time() - started
    print(f"OK ({dur:.1f}s)")


def main() -> int:
    _print_env()

    try:
        import torch

        print(f"torch={torch.__version__} cuda={torch.cuda.is_available()}")
    except Exception as e:
        print(f"torch import failed: {e}")
        return 1

    try:
        from diffusers import (
            AutoPipelineForInpainting,
            StableDiffusionInpaintPipeline,
            StableDiffusionXLInpaintPipeline,
        )

        print("diffusers import OK")
    except Exception as e:
        print(f"diffusers import failed: {e}")
        return 1

    offline = os.environ.get("HF_HUB_OFFLINE") in {"1", "true", "True"}
    if offline:
        print("\nHF_HUB_OFFLINE is set; caching requires online access.")
        print("Unset HF_HUB_OFFLINE or set it to 0 for this prefetch run.")
        return 2

    _cache_one(
        "SD v1.5 Inpainting (stable-diffusion-v1-5/stable-diffusion-inpainting)",
        lambda: StableDiffusionInpaintPipeline.from_pretrained(
            "stable-diffusion-v1-5/stable-diffusion-inpainting",
        ),
    )

    _cache_one(
        "SDXL Inpainting (diffusers/stable-diffusion-xl-1.0-inpainting-0.1)",
        lambda: StableDiffusionXLInpaintPipeline.from_pretrained(
            "diffusers/stable-diffusion-xl-1.0-inpainting-0.1",
            use_safetensors=True,
            variant="fp16",
        ),
    )

    _cache_one(
        "Kandinsky 2.2 Inpainting (kandinsky-community/kandinsky-2-2-decoder-inpaint)",
        lambda: AutoPipelineForInpainting.from_pretrained(
            "kandinsky-community/kandinsky-2-2-decoder-inpaint",
        ),
    )

    print("\nAll requested diffusion restoration models cached.")
    print("After this, you can run offline with:")
    print("  export HF_HUB_OFFLINE=1")
    if os.environ.get("HF_HOME"):
        print("  (HF_HOME is already set; keep it consistent)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
