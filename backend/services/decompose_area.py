from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from PIL import Image

from backend.app.storage import Storage
from backend.services.restore_common import (
    sha256_image_rgba,
    stable_json_hash,
    timed,
)
from backend.services.restore_sdxl import SdxlInpaintService, SdxlParams
from backend.app.sam3_service import Sam3Service


@dataclass
class DecomposeAreaResult:
    layers: list[dict[str, object]]
    timing_ms: int
    cached: bool


class DecomposeAreaService:
    def __init__(
        self,
        storage: Storage,
        sam_service: Sam3Service,
    ):
        self._storage = storage
        self._sam = sam_service
        self._sdxl = SdxlInpaintService()
        self._cache = {}

    def reset(self):
        self._cache.clear()

    def decompose_area(
        self,
        base_image: Image.Image,
        roi_box: list[int],  # [x1, y1, x2, y2]
        image_id: str,  # Need image_id for SAM
        params: dict[str, object],
    ) -> DecomposeAreaResult:
        cache_key = stable_json_hash(
            {
                "base_image": sha256_image_rgba(base_image),
                "roi_box": roi_box,
                "params": params,
            }
        )

        if cache_key in self._cache:
            res = self._cache[cache_key]
            res.cached = True
            return res

        result, ms = timed(self._run_decompose)(base_image, roi_box, image_id, params)
        result.cached = False
        result.timing_ms = ms

        self._cache[cache_key] = result
        return result

    def _run_decompose(
        self,
        base_image: Image.Image,
        roi_box: list[int],
        image_id: str,
        params: dict[str, object],
    ) -> DecomposeAreaResult:
        import cv2
        from backend.app.postprocess import clean_rgba_edges, EdgeCleanupParams

        # 1. Crop Base Image to ROI
        x1, y1, x2, y2 = roi_box
        w_roi, h_roi = x2 - x1, y2 - y1
        if w_roi < 10 or h_roi < 10:
            raise ValueError("ROI too small")

        # 2. Run SAM3 Segment All on the ROI
        # We need to run SAM on the *full* image but filter for points inside the ROI,
        # OR crop the image and run SAM on the crop.
        # Running on crop is faster and safer for "Decompose Area".

        roi_crop = base_image.crop((x1, y1, x2, y2))
        roi_crop_id = f"{image_id}_crop_{x1}_{y1}_{x2}_{y2}"

        # We can't easily register a crop with ID into existing SAM service without full upload flow.
        # But Sam3Service.segment_all takes PIL Image.
        # Let's use that.

        # Note: segment_all returns list of (mask_u8, iou)
        sam_results = self._sam.segment_all(roi_crop_id, roi_crop)

        # 3. Filter Masks
        # Filter by size (ignore tiny specks)
        min_area = (w_roi * h_roi) * 0.01
        valid_masks = []
        for mask_u8, score in sam_results:
            if np.sum(mask_u8 > 0) > min_area:
                valid_masks.append((mask_u8, score))

        # Limit to top N masks to avoid exploding
        valid_masks.sort(key=lambda x: x[1], reverse=True)
        max_layers = 5
        num_layers_raw = params.get("num_layers")
        if isinstance(num_layers_raw, (int, float)):
            max_layers = int(num_layers_raw)
        valid_masks = valid_masks[:max_layers]
        # End of valid masks logic (necessary for state tracking)

        if not valid_masks:
            raise ValueError("No objects found in area")

        # 4. Iterative Layer Extraction
        valid_masks.sort(key=lambda x: np.sum(x[0] > 0))  # Smallest first (Foreground)

        layers = []
        current_bg = roi_crop.convert("RGB")

        for idx, (mask_u8, score) in enumerate(valid_masks):
            mask_pil = Image.fromarray(mask_u8)
            obj_rgba = roi_crop.convert("RGBA")
            obj_rgba.putalpha(mask_pil)

            cleaned = clean_rgba_edges(
                np.asarray(obj_rgba),
                mask_u8,
                EdgeCleanupParams(enabled=True, strength=40, feather_px=1),
            )
            final_obj_rgba = Image.fromarray(cleaned)

            asset_id = self._storage.new_asset_id()
            final_obj_rgba.save(
                self._storage.asset_path(asset_id, ".png"), format="PNG"
            )

            layers.append(
                {
                    "layer_name": f"Object {idx + 1}",
                    "rgba_asset_id": asset_id,
                    "bbox": [x1, y1, w_roi, h_roi],  # Position relative to full image
                }
            )

            # Re-extract from current background to ensure proper layering for subsequent objects
            obj_from_bg = current_bg.convert("RGBA")
            obj_from_bg.putalpha(mask_pil)

            cleaned_iter = clean_rgba_edges(
                np.asarray(obj_from_bg),
                mask_u8,
                EdgeCleanupParams(enabled=True, strength=40, feather_px=1),
            )
            final_obj_iter = Image.fromarray(cleaned_iter)
            final_obj_iter.save(
                self._storage.asset_path(asset_id, ".png"), format="PNG"
            )

            try:
                # Dilate mask slightly for inpainting to avoid edge artifacts
                kernel = np.ones((5, 5), np.uint8)
                dilated_mask = cv2.dilate(mask_u8, kernel, iterations=1)
                dilated_pil = Image.fromarray(dilated_mask)

                sdxl_params = SdxlParams(steps=20, guidance_scale=5.5, strength=1.0)
                new_bg = self._sdxl.run(
                    init_rgb=current_bg,
                    mask_l=dilated_pil,
                    prompt="clean scientific diagram background",
                    params=sdxl_params,
                )
                current_bg = new_bg
            except Exception as e:
                print(f"Inpainting failed for layer {idx}: {e}")
                pass

        # Finally, add the remaining background as the last layer

        bg_asset_id = self._storage.new_asset_id()
        current_bg.convert("RGBA").save(
            self._storage.asset_path(bg_asset_id, ".png"), format="PNG"
        )
        layers.append(
            {
                "layer_name": "Background",
                "rgba_asset_id": bg_asset_id,
                "bbox": [x1, y1, w_roi, h_roi],
            }
        )

        # Reverse layers so Background is first (bottom), Foreground is last (top)
        layers.reverse()

        return DecomposeAreaResult(
            layers=layers,
            timing_ms=0,
            cached=False,
        )
