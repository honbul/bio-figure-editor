from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image

from backend.app.storage import Storage
from backend.services.restore_common import (
    sha256_image_rgba,
    sha256_mask,
    stable_json_hash,
    timed,
    extract_int,
    extract_float,
)
from backend.services.restore_sdxl import SdxlInpaintService, SdxlParams


@dataclass
class RoiSplitResult:
    bg_asset_id: str
    bg_bbox: tuple[int, int, int, int]
    fg_asset_id: str
    fg_bbox: tuple[int, int, int, int]
    timing_ms: int
    cached: bool


class RoiSplitService:
    def __init__(self, storage: Storage):
        self._storage = storage
        self._sdxl = SdxlInpaintService()
        self._cache = {}

    def reset(self):
        self._cache.clear()

    def split(
        self,
        base_image: Image.Image,
        roi_mask: Image.Image,
        engine: str,
        params: dict[str, object],
        fg_point: tuple[int, int] | None = None,
        bg_point: tuple[int, int] | None = None,
        prompt: str | None = None,
    ) -> RoiSplitResult:
        cache_key = stable_json_hash(
            {
                "base_image": sha256_image_rgba(base_image),
                "roi_mask": sha256_mask(roi_mask),
                "engine": engine,
                "params": params,
                "fg_point": fg_point,
                "bg_point": bg_point,
                "prompt": prompt,
            }
        )

        if cache_key in self._cache:
            res = self._cache[cache_key]
            res.cached = True
            return res

        result, ms = timed(self._run_split)(
            base_image, roi_mask, engine, params, fg_point, bg_point, prompt
        )
        result.cached = False
        result.timing_ms = ms

        self._cache[cache_key] = result
        return result

    def _run_split(
        self,
        base_image: Image.Image,
        roi_mask: Image.Image,
        engine: str,
        params: dict[str, object],
        fg_point: tuple[int, int] | None,
        bg_point: tuple[int, int] | None,
        prompt: str | None,
    ) -> RoiSplitResult:
        roi_arr = np.asarray(roi_mask.convert("L"))
        ys, xs = np.where(roi_arr > 0)
        if len(ys) == 0:
            raise ValueError("ROI mask is empty")

        x0, x1 = int(xs.min()), int(xs.max()) + 1
        y0, y1 = int(ys.min()), int(ys.max()) + 1

        pad = 8
        h, w = roi_arr.shape
        x0 = max(0, x0 - pad)
        y0 = max(0, y0 - pad)
        x1 = min(w, x1 + pad)
        y1 = min(h, y1 + pad)

        bbox = (x0, y0, x1, y1)
        w_patch = x1 - x0
        h_patch = y1 - y0

        patch_rgb = base_image.convert("RGB").crop(bbox)
        patch_roi = roi_mask.convert("L").crop(bbox)

        patch_fg = (fg_point[0] - x0, fg_point[1] - y0) if fg_point else None
        patch_bg = (bg_point[0] - x0, bg_point[1] - y0) if bg_point else None

        fg_mask_u8 = self._estimate_fg_mask(
            np.asarray(patch_rgb), np.asarray(patch_roi), patch_fg, patch_bg
        )

        fg_mask_pil = Image.fromarray(fg_mask_u8)

        sdxl_params = SdxlParams(
            steps=extract_int(params.get("steps"), 20) or 20,
            guidance_scale=extract_float(params.get("guidance_scale"), 5.5) or 5.5,
            strength=extract_float(params.get("strength")),
            seed=extract_int(params.get("seed")),
            resize_long_edge=extract_int(params.get("resize_long_edge"), 1024) or 1024,
        )

        restored_patch_rgb = self._sdxl.run(
            init_rgb=patch_rgb,
            mask_l=fg_mask_pil,
            prompt=prompt,
            params=sdxl_params,
        )

        fg_rgba = patch_rgb.convert("RGBA")
        fg_rgba.putalpha(fg_mask_pil)

        from backend.app.postprocess import clean_rgba_edges, EdgeCleanupParams

        cleaned_fg = clean_rgba_edges(
            np.asarray(fg_rgba),
            fg_mask_u8,
            EdgeCleanupParams(enabled=True, strength=40, feather_px=1),
        )
        fg_rgba_final = Image.fromarray(cleaned_fg)

        bg_rgba = restored_patch_rgb.convert("RGBA")
        bg_rgba.putalpha(patch_roi)

        fg_id = self._storage.new_asset_id()
        fg_rgba_final.save(self._storage.asset_path(fg_id, ".png"), format="PNG")

        bg_id = self._storage.new_asset_id()
        bg_rgba.save(self._storage.asset_path(bg_id, ".png"), format="PNG")

        return RoiSplitResult(
            bg_asset_id=bg_id,
            bg_bbox=(x0, y0, w_patch, h_patch),
            fg_asset_id=fg_id,
            fg_bbox=(x0, y0, w_patch, h_patch),
            timing_ms=0,
            cached=False,
        )

    def _estimate_fg_mask(
        self,
        rgb: np.ndarray,
        roi_u8: np.ndarray,
        fg_pt: tuple[int, int] | None,
        bg_pt: tuple[int, int] | None,
    ) -> np.ndarray:
        mask = np.zeros(rgb.shape[:2], dtype=np.uint8)

        mask[roi_u8 > 0] = cv2.GC_PR_FGD
        mask[roi_u8 == 0] = cv2.GC_BGD

        if fg_pt:
            cv2.circle(mask, fg_pt, 3, (int(cv2.GC_FGD),), -1)

        if bg_pt:
            cv2.circle(mask, bg_pt, 3, (int(cv2.GC_BGD),), -1)

        bgdModel = np.zeros((1, 65), np.float64)
        fgdModel = np.zeros((1, 65), np.float64)

        try:
            cv2.grabCut(
                rgb, mask, (0, 0, 1, 1), bgdModel, fgdModel, 5, cv2.GC_INIT_WITH_MASK
            )
        except Exception:
            return roi_u8

        final_mask = np.where((mask == 2) | (mask == 0), 0, 1).astype(np.uint8)

        final_mask[roi_u8 == 0] = 0

        return (final_mask * 255).astype(np.uint8)
