from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageChops

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
class OverlapSplitResult:
    layer_a_asset_id: str
    layer_a_bbox: tuple[int, int, int, int]
    layer_b_asset_id: str
    layer_b_bbox: tuple[int, int, int, int]
    timing_ms: int
    cached: bool


class OverlapSplitService:
    def __init__(self, storage: Storage):
        self._storage = storage
        self._cache = {}
        self._sdxl = SdxlInpaintService()

    def reset(self):
        self._cache.clear()

    def split_overlap(
        self,
        base_image: Image.Image,
        mask_a: Image.Image,
        mask_b: Image.Image,
        engine: str,
        params: dict[str, object],
        prompt_a: str | None = None,
        prompt_b: str | None = None,
    ) -> OverlapSplitResult:
        cache_key = stable_json_hash(
            {
                "base_image": sha256_image_rgba(base_image),
                "mask_a": sha256_mask(mask_a),
                "mask_b": sha256_mask(mask_b),
                "engine": engine,
                "params": params,
                "prompt_a": prompt_a,
                "prompt_b": prompt_b,
            }
        )

        if cache_key in self._cache:
            res = self._cache[cache_key]
            res.cached = True
            return res

        result, ms = timed(self._run_split_overlap)(
            base_image, mask_a, mask_b, engine, params, prompt_a, prompt_b
        )
        result.cached = False
        result.timing_ms = ms

        self._cache[cache_key] = result
        return result

    def _run_split_overlap(
        self,
        base_image: Image.Image,
        mask_a: Image.Image,
        mask_b: Image.Image,
        engine: str,
        params: dict[str, object],
        prompt_a: str | None,
        prompt_b: str | None,
    ) -> OverlapSplitResult:
        arr_a = np.asarray(mask_a.convert("L"))
        arr_b = np.asarray(mask_b.convert("L"))
        union_mask = np.logical_or(arr_a > 0, arr_b > 0)

        ys, xs = np.where(union_mask)
        if len(ys) == 0:
            raise ValueError("Both masks are empty")

        x0, x1 = int(xs.min()), int(xs.max()) + 1
        y0, y1 = int(ys.min()), int(ys.max()) + 1

        pad = 16
        h, w = arr_a.shape
        x0 = max(0, x0 - pad)
        y0 = max(0, y0 - pad)
        x1 = min(w, x1 + pad)
        y1 = min(h, y1 + pad)

        bbox = (x0, y0, x1, y1)
        w_patch = x1 - x0
        h_patch = y1 - y0

        patch_rgb = base_image.convert("RGB").crop(bbox)
        patch_mask_a = mask_a.convert("L").crop(bbox)
        patch_mask_b = mask_b.convert("L").crop(bbox)

        # For A, we want to restore it in the overlap region.
        # But we also want the mask to be clean (foreground extraction).
        # Since we don't have user hints, we use simple GrabCut refinement if the mask is large enough.
        # We refine both masks to ensure transparency.

        def refine_mask(rgb, mask_u8):
            # If mask is empty or full, skip
            if np.sum(mask_u8) == 0 or np.sum(mask_u8) == mask_u8.size * 255:
                return mask_u8

            # Initialize GrabCut mask
            gc_mask = np.zeros(mask_u8.shape, dtype=np.uint8)
            gc_mask[mask_u8 > 0] = cv2.GC_PR_FGD  # Probable foreground
            gc_mask[mask_u8 == 0] = cv2.GC_BGD  # Sure background

            bgdModel = np.zeros((1, 65), np.float64)
            fgdModel = np.zeros((1, 65), np.float64)

            try:
                cv2.grabCut(
                    rgb,
                    gc_mask,
                    (0, 0, 1, 1),
                    bgdModel,
                    fgdModel,
                    5,
                    cv2.GC_INIT_WITH_MASK,
                )
                # Keep FGD and PR_FGD
                final = np.where(
                    (gc_mask == cv2.GC_FGD) | (gc_mask == cv2.GC_PR_FGD), 255, 0
                ).astype(np.uint8)
                # Constrain to original mask (don't grow)
                final[mask_u8 == 0] = 0
                return final
            except Exception:
                return mask_u8

        import cv2

        refined_mask_a = refine_mask(np.asarray(patch_rgb), np.asarray(patch_mask_a))
        refined_mask_b = refine_mask(np.asarray(patch_rgb), np.asarray(patch_mask_b))

        # FIX: Use original mask B for the overlap/hole definition.
        # This ensures we remove ALL of the occluder defined by the user (e.g. loose selection),
        # preventing "ghost" text pixels from remaining on A if GrabCut shrinks B too much.
        arr_pb_original = np.asarray(patch_mask_b) > 0

        # We define the hole on A as:
        # 1. Where the refined A exists (we want to restore A)
        # 2. AND where the user said B is (the occluder)
        arr_pa_refined = refined_mask_a > 0
        overlap_for_a = np.logical_and(arr_pa_refined, arr_pb_original)

        overlap_u8 = (overlap_for_a * 255).astype(np.uint8)

        overlap_pil = Image.fromarray(overlap_u8)

        # Map params to SdxlParams
        sdxl_params = SdxlParams(
            steps=extract_int(params.get("steps"), 20) or 20,
            guidance_scale=extract_float(params.get("guidance_scale"), 5.5) or 5.5,
            strength=extract_float(params.get("strength")),
            seed=extract_int(params.get("seed")),
            resize_long_edge=extract_int(params.get("resize_long_edge"), 1024) or 1024,
        )

        completed_a_rgb = self._sdxl.run(
            init_rgb=patch_rgb,
            mask_l=overlap_pil,
            prompt=prompt_a or "clean scientific diagram object",
            params=sdxl_params,
        )

        # Object B is the OCCLUDER. It is preserved as-is.
        completed_b_rgb = patch_rgb

        from backend.app.postprocess import clean_rgba_edges, EdgeCleanupParams

        def make_layer(rgb_img, mask_arr, name_suffix):
            mask_img = Image.fromarray(mask_arr)
            rgba = rgb_img.convert("RGBA")
            rgba.putalpha(mask_img)

            cleaned = clean_rgba_edges(
                np.asarray(rgba),
                mask_arr,
                EdgeCleanupParams(enabled=True, strength=40, feather_px=1),
            )
            final_rgba = Image.fromarray(cleaned)

            asset_id = self._storage.new_asset_id()
            final_rgba.save(self._storage.asset_path(asset_id, ".png"), format="PNG")
            return asset_id

        id_a = make_layer(completed_a_rgb, refined_mask_a, "A")
        id_b = make_layer(completed_b_rgb, refined_mask_b, "B")

        return OverlapSplitResult(
            layer_a_asset_id=id_a,
            layer_a_bbox=(x0, y0, w_patch, h_patch),
            layer_b_asset_id=id_b,
            layer_b_bbox=(x0, y0, w_patch, h_patch),
            timing_ms=0,
            cached=False,
        )
