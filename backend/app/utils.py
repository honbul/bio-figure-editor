from __future__ import annotations

import io
from pathlib import Path

import numpy as np
from PIL import Image

from .storage import Storage, get_api_base_url
from .postprocess import clean_rgba_edges, EdgeCleanupParams
from .models import SegmentResponse


def _asset_url(asset_id: str) -> str:
    return f"{get_api_base_url().rstrip('/')}/asset/{asset_id}"


def clear_gpu_memory():
    import gc
    import torch

    gc.collect()
    if torch.cuda.is_available():
        try:
            torch.cuda.ipc_collect()
        except Exception:
            pass
        torch.cuda.empty_cache()


def save_segmentation_assets(
    storage: Storage,
    base_rgb: Image.Image,
    mask_u8: np.ndarray,
    edge_cleanup: EdgeCleanupParams | None = None,
) -> SegmentResponse:
    ys, xs = np.where(mask_u8 > 0)
    if len(xs) == 0 or len(ys) == 0:
        raise ValueError("no mask predicted")

    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    bbox_xyxy = [x0, y0, x1, y1]

    alpha = Image.fromarray(mask_u8, mode="L")

    mask_rgba = Image.new("RGBA", base_rgb.size, (255, 255, 255, 0))
    mask_rgba.putalpha(alpha)
    mask_asset_id = storage.new_asset_id()
    mask_rgba.save(storage.asset_path(mask_asset_id, ".png"), format="PNG")

    base_rgba = base_rgb.convert("RGBA")
    base_rgba.putalpha(alpha)
    object_rgba = base_rgba.crop((x0, y0, x1, y1))

    if edge_cleanup is not None and edge_cleanup.enabled:
        cleaned = clean_rgba_edges(np.asarray(base_rgba), mask_u8, edge_cleanup)
        object_rgba = Image.fromarray(cleaned, mode="RGBA").crop((x0, y0, x1, y1))

    object_asset_id = storage.new_asset_id()
    object_rgba.save(storage.asset_path(object_asset_id, ".png"), format="PNG")

    overlay_alpha = alpha.point([0] + [90] * 255)
    overlay = Image.new("RGBA", base_rgb.size, (255, 0, 0, 0))
    overlay.putalpha(overlay_alpha)
    overlay_asset_id = storage.new_asset_id()
    overlay.save(storage.asset_path(overlay_asset_id, ".png"), format="PNG")

    return SegmentResponse(
        mask_asset_id=mask_asset_id,
        mask_url=_asset_url(mask_asset_id),
        overlay_asset_id=overlay_asset_id,
        overlay_url=_asset_url(overlay_asset_id),
        object_asset_id=object_asset_id,
        object_url=_asset_url(object_asset_id),
        bbox_xyxy=bbox_xyxy,
    )
