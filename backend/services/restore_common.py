from __future__ import annotations

import hashlib
import json
import os
import time
from dataclasses import dataclass

import numpy as np
from PIL import Image


DEFAULT_PROMPT = (
    "clean flat scientific diagram, solid colors, sharp edges, "
    "no text, no extra symbols"
)


@dataclass(frozen=True)
class RestoreRunMetadata:
    engine: str
    params_used: dict[str, object]
    runtime_ms: int
    cached: bool


def extract_int(v: object | None, default: int | None = None) -> int | None:
    if v is None:
        return default
    try:
        return int(str(v))
    except (ValueError, TypeError):
        return default


def extract_float(v: object | None, default: float | None = None) -> float | None:
    if v is None:
        return default
    try:
        return float(str(v))
    except (ValueError, TypeError):
        return default


def pick_device() -> str:
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def pil_to_rgba(img: Image.Image) -> Image.Image:
    return img.convert("RGBA") if img.mode != "RGBA" else img


def mask_from_rgba_alpha(mask_rgba: Image.Image, size: tuple[int, int]) -> Image.Image:
    m = pil_to_rgba(mask_rgba)
    if m.size != size:
        m = m.resize(size, resample=Image.Resampling.NEAREST)
    alpha = np.asarray(m)[:, :, 3].astype(np.uint8)
    return Image.fromarray(np.where(alpha > 0, 255, 0).astype(np.uint8), mode="L")


def auto_restore_mask(object_rgba: Image.Image) -> Image.Image:
    rgba = np.asarray(pil_to_rgba(object_rgba))
    alpha = rgba[:, :, 3].astype(np.uint8)

    if not np.any(alpha > 0):
        return Image.fromarray(np.zeros_like(alpha, dtype=np.uint8), mode="L")

    try:
        import cv2
    except Exception:
        return Image.fromarray(np.zeros_like(alpha, dtype=np.uint8), mode="L")

    h, w = alpha.shape
    alpha_bin = (alpha > 0).astype(np.uint8) * 255

    close = max(1, int(round(min(h, w) * 0.02)))
    close = int(max(1, min(12, close)))
    grow = int(max(1, min(16, close + 2)))

    k_close = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (2 * close + 1, 2 * close + 1)
    )
    closed = cv2.morphologyEx(alpha_bin, cv2.MORPH_CLOSE, k_close, iterations=1)

    k_grow = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * grow + 1, 2 * grow + 1))
    grown = cv2.dilate(closed, k_grow, iterations=1)

    add_mask = (grown > 0) & (alpha_bin == 0)
    out = (add_mask.astype(np.uint8) * 255).astype(np.uint8)
    return Image.fromarray(out, mode="L")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_image_rgba(img: Image.Image) -> str:
    rgba = np.asarray(pil_to_rgba(img)).astype(np.uint8)
    return sha256_bytes(rgba.tobytes())


def sha256_mask(mask_l: Image.Image) -> str:
    m = mask_l.convert("L")
    arr = np.asarray(m).astype(np.uint8)
    return sha256_bytes(arr.tobytes())


def stable_json_hash(payload: dict[str, object]) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return sha256_bytes(raw)


def resize_long_edge(
    image: Image.Image, mask_l: Image.Image, target_long_edge: int
) -> tuple[Image.Image, Image.Image, tuple[int, int]]:
    if target_long_edge <= 0:
        return image, mask_l, image.size

    w, h = image.size
    long_edge = max(w, h)
    if long_edge <= target_long_edge:
        return image, mask_l, image.size

    scale = float(target_long_edge) / float(long_edge)
    nw = int(round(w * scale))
    nh = int(round(h * scale))

    nw = max(8, (nw // 8) * 8)
    nh = max(8, (nh // 8) * 8)

    resized_img = image.resize((nw, nh), resample=Image.Resampling.BICUBIC)
    resized_mask = mask_l.resize((nw, nh), resample=Image.Resampling.NEAREST)
    return resized_img, resized_mask, (w, h)


def prepare_object_inpaint_inputs(
    object_rgba: Image.Image,
    restore_mask_l: Image.Image,
) -> tuple[Image.Image, Image.Image, Image.Image]:
    rgba = pil_to_rgba(object_rgba)
    mask = restore_mask_l.convert("L")

    arr = np.asarray(rgba).astype(np.uint8)
    rgb = arr[:, :, :3].copy()
    alpha = arr[:, :, 3]

    try:
        import cv2

        k = 9
        blurred = cv2.GaussianBlur(rgb.astype(np.float32), (k, k), sigmaX=0)
        fill = blurred.astype(np.uint8)
        rgb[alpha == 0] = fill[alpha == 0]
    except Exception:
        rgb[alpha == 0] = 255

    init_rgb = Image.fromarray(rgb, mode="RGB")
    return rgba, init_rgb, mask


def merge_inpaint_result(
    original_rgba: Image.Image,
    inpaint_rgb: Image.Image,
    restore_mask_l: Image.Image,
    set_alpha: int = 255,
) -> Image.Image:
    orig = np.asarray(pil_to_rgba(original_rgba)).astype(np.uint8)
    gen = np.asarray(inpaint_rgb.convert("RGB")).astype(np.uint8)
    mask = np.asarray(restore_mask_l.convert("L")).astype(np.uint8)

    out = orig.copy()
    region = mask > 0
    out[region, :3] = gen[region, :]
    out[region, 3] = np.uint8(set_alpha)

    out[out[:, :, 3] == 0, :3] = 0
    return Image.fromarray(out, mode="RGBA")


def hf_offline_hint() -> str:
    home = os.environ.get("HF_HOME")
    return (
        "Cache model weights online once, then run offline. "
        "You can set HF_HUB_OFFLINE=1 and HF_HOME to control the cache directory."
        + (f" (HF_HOME={home})" if home else "")
    )


class RestoreEngineError(RuntimeError):
    code: str
    suggestions: list[str]

    def __init__(self, code: str, message: str, suggestions: list[str] | None = None):
        super().__init__(message)
        self.code = code
        self.suggestions = suggestions or []


def format_engine_error(e: RestoreEngineError) -> dict[str, object]:
    return {
        "code": e.code,
        "message": str(e),
        "suggestions": e.suggestions,
    }


from typing import Any, Callable, TypeVar

T = TypeVar("T")


def timed(fn: Callable[..., T]) -> Callable[..., tuple[T, int]]:
    def _wrap(*args: Any, **kwargs: Any) -> tuple[T, int]:
        started = time.time()
        out = fn(*args, **kwargs)
        runtime_ms = int((time.time() - started) * 1000)
        return out, runtime_ms

    return _wrap
