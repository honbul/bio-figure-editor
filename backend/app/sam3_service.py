from __future__ import annotations

import os
import sys
import threading
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


_root = Path(__file__).resolve().parents[2]
_sam3_repo = _root / "sam3"
if _sam3_repo.exists():
    sys.path.insert(0, str(_sam3_repo))


@dataclass
class _PredictorState:
    features: dict[str, object]
    orig_hw: list[tuple[int, int]]


class Sam3Service:
    def __init__(self) -> None:
        import importlib

        torch = importlib.import_module("torch")
        model_builder = importlib.import_module("sam3.model_builder")
        build_sam3_image_model = getattr(model_builder, "build_sam3_image_model")

        device = os.environ.get(
            "SAM3_DEVICE", "cuda" if torch.cuda.is_available() else "cpu"
        )
        compile_model = os.environ.get("SAM3_COMPILE", "0") in {"1", "true", "True"}

        self._model = build_sam3_image_model(
            device=device,
            eval_mode=True,
            checkpoint_path=None,
            load_from_HF=True,
            enable_inst_interactivity=True,
            compile=compile_model,
        )

        predictor = getattr(self._model, "inst_interactive_predictor", None)
        if predictor is None:
            raise RuntimeError(
                "SAM3 interactive predictor not available. "
                "Ensure build_sam3_image_model(enable_inst_interactivity=True) succeeded."
            )

        # Fix: Inject the backbone into the tracker if it's missing (which it is by default)
        if predictor.model.backbone is None:
            predictor.model.backbone = self._model.backbone

        self._predictor = predictor
        self._lock = threading.Lock()

        self._current_image_id: str | None = None
        self._state_cache: OrderedDict[str, _PredictorState] = OrderedDict()
        self._state_cache_capacity = int(os.environ.get("SAM3_IMAGE_CACHE_SIZE", "2"))

    def _remember_current_state(self) -> None:
        if self._current_image_id is None:
            return
        if not getattr(self._predictor, "_is_image_set", False):
            return
        state = _PredictorState(
            features=self._predictor._features,
            orig_hw=self._predictor._orig_hw,
        )
        self._state_cache[self._current_image_id] = state
        self._state_cache.move_to_end(self._current_image_id)
        while len(self._state_cache) > self._state_cache_capacity:
            self._state_cache.popitem(last=False)

    def _restore_state(self, image_id: str) -> bool:
        state = self._state_cache.get(image_id)
        if state is None:
            return False
        self._predictor._features = state.features
        self._predictor._orig_hw = state.orig_hw
        self._predictor._is_image_set = True
        self._current_image_id = image_id
        self._state_cache.move_to_end(image_id)
        return True

    def ensure_image(self, image_id: str, image: Image.Image) -> None:
        with self._lock:
            if image_id == self._current_image_id and getattr(
                self._predictor, "_is_image_set", False
            ):
                return

            self._remember_current_state()
            if self._restore_state(image_id):
                return

            # CRITICAL FIX for SAM3:
            # SAM3InteractiveImagePredictor expects image as np.ndarray (H, W, 3) 0-255 uint8
            # OR PIL Image.
            # BUT internal transforms might be sensitive.
            # SAM2Transforms resize to `resolution` (1024) and normalize.

            # If we pass PIL image directly, set_image converts to numpy if needed.
            # Let's ensure it's RGB.
            if image.mode != "RGB":
                image = image.convert("RGB")

            self._predictor.set_image(image)
            self._current_image_id = image_id

    def segment(
        self,
        image_id: str,
        image: Image.Image,
        points: list[tuple[float, float, int]],
        box: list[int] | None = None,
        text: str | None = None,
        threshold: float | None = None,
    ):
        import numpy as _np
        import torch

        # Handle TEXT prompt via Sam3Processor logic (since interactive predictor doesn't support it)
        if text:
            # We need to construct a Sam3Processor-like flow or use the model directly.
            # Sam3Processor is a wrapper around the model.
            # We can use our self._model which IS the Sam3Image model.

            # Ensure image is set in the predictor for consistency, but for text we use model directly
            # Actually, let's look at how we can leverage the existing model.
            # The Sam3Processor is cleaner. Let's try to instantiate it or mimic it.
            # But creating a processor every time might be heavy if it copies things.
            # Let's verify Sam3Processor init. It just stores model ref.

            import importlib

            sam3_image_processor = importlib.import_module(
                "sam3.model.sam3_image_processor"
            )
            Sam3Processor = getattr(sam3_image_processor, "Sam3Processor")

            processor = Sam3Processor(
                self._model, resolution=1008, device=self._model.device
            )

            # Set image
            # Note: processor.set_image expects PIL or Tensor and runs backbone.forward_image
            # This might re-compute embeddings if we don't cache them in the processor way.
            # Our self._predictor has its own cache.
            # Ideally we share the cache.

            # Optimization: self._predictor._features contains "image_embed" etc.
            # But processor state structure is different ("backbone_out").
            # For MVP, let's just run processor.set_image. It might be slower (re-encode) but robust.

            # CRITICAL FIX: Sam3Processor expects image in 0-255 range but normalizes it internally.
            # Our `image` is PIL Image. set_image handles it.
            # HOWEVER, Sam3Processor is designed for high-level tasks.
            # Let's ensure resolution matches.

            state = processor.set_image(image)

            # Set text prompt
            state = processor.set_text_prompt(text, state)

            if threshold is not None:
                state = processor.set_confidence_threshold(threshold, state)

            # Get results
            # processor returns multiple masks. We need to pick one or combine.
            # Interactive mode usually expects 1 main object.
            # Let's take the one with highest score.

            masks = state.get("masks")  # (N, 1, H, W)
            scores = state.get("scores")  # (N,)

            if masks is None or len(masks) == 0:
                # Fallback or empty
                return (
                    _np.zeros((image.height, image.width), dtype=_np.uint8),
                    0.0,
                    None,
                )

            # Find best
            best_idx = torch.argmax(scores)
            mask_t = masks[best_idx, 0]  # (H, W)
            score = scores[best_idx].item()

            mask_u8 = (mask_t > 0.5).cpu().numpy().astype(_np.uint8) * 255
            return mask_u8, score, None

        # Handle POINTS / BOX via Interactive Predictor
        self.ensure_image(image_id, image)

        point_coords = None
        point_labels = None

        if points:
            point_coords = _np.array([[p[0], p[1]] for p in points], dtype=_np.float32)
            point_labels = _np.array([p[2] for p in points], dtype=_np.int32)

        box_np = None
        if box:
            # box is [x1, y1, x2, y2]. Predictor expects (1, 4) for a single box in batch mode usually,
            # or it might handle (4,). But (1, 4) is safer to avoid ambiguity.
            # checking _prep_prompts -> transform_boxes usually expects (N, 4) or (B, N, 4).
            # Let's try (1, 4).
            box_np = _np.array([box], dtype=_np.float32)

        with self._lock:
            # If we have a custom threshold, we need logits to apply it manually
            return_logits = threshold is not None

            masks, ious, low_res_logits = self._predictor.predict(
                point_coords=point_coords,
                point_labels=point_labels,
                box=box_np,
                multimask_output=True,
                return_logits=return_logits,
                normalize_coords=True,
            )

        best_idx = int(_np.argmax(ious))

        if return_logits:
            # Apply custom threshold
            # masks are actually logits here
            logit = masks[best_idx]
            mask_u8 = (logit > (threshold if threshold is not None else 0.0)).astype(
                _np.uint8
            ) * 255
        else:
            mask = masks[best_idx]
            mask_u8 = (mask > 0.5).astype(_np.uint8) * 255

        return mask_u8, ious[best_idx], low_res_logits

    def reset(self) -> None:
        with self._lock:
            self._current_image_id = None
            self._state_cache.clear()
            try:
                self._predictor._features = {}  # type: ignore[attr-defined]
                self._predictor._orig_hw = []  # type: ignore[attr-defined]
                self._predictor._is_image_set = False  # type: ignore[attr-defined]
            except Exception:
                pass

        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass

    def segment_all(self, image_id: str, image: Image.Image):
        import numpy as _np
        import torch
        from torchvision.ops import nms

        self.ensure_image(image_id, image)

        # 1. Generate grid of points
        w, h = image.size
        # Grid size: 32x32 = 1024 points
        n_per_side = 32
        xs = _np.linspace(0, w - 1, n_per_side)
        ys = _np.linspace(0, h - 1, n_per_side)
        xv, yv = _np.meshgrid(xs, ys)
        points = _np.stack([xv.flatten(), yv.flatten()], axis=1)  # (1024, 2)

        # Format as BxNx2 where B=1024, N=1
        point_coords = points[:, None, :]
        point_labels = _np.ones((points.shape[0], 1), dtype=_np.int32)

        # Batch processing to prevent OOM
        # 1024 points at once is too much for some GPUs with the large SAM3 model.
        # Process in chunks of 64.
        batch_size = 64
        total_points = point_coords.shape[0]

        all_masks = []
        all_ious = []

        with self._lock:
            for i in range(0, total_points, batch_size):
                end_idx = min(i + batch_size, total_points)
                chunk_coords = point_coords[i:end_idx]
                chunk_labels = point_labels[i:end_idx]

                # Predict for chunk
                masks, ious, _ = self._predictor.predict(
                    point_coords=chunk_coords,
                    point_labels=chunk_labels,
                    multimask_output=True,
                    return_logits=False,
                    normalize_coords=True,
                )

                # Store results on CPU to save GPU memory
                # masks: (B, 3, H, W) -> move to cpu
                # ious: (B, 3) -> move to cpu

                # We need to select best mask for each point HERE to save memory
                # instead of storing all 3 masks per point.

                best_idx = _np.argmax(ious, axis=1)  # (B,)
                chunk_indices = _np.arange(ious.shape[0])

                best_masks_chunk = masks[chunk_indices, best_idx]  # (B, H, W)
                best_ious_chunk = ious[chunk_indices, best_idx]  # (B,)

                all_masks.append(best_masks_chunk)
                all_ious.append(best_ious_chunk)

        # Concatenate all results
        best_masks = _np.concatenate(all_masks, axis=0)  # (Total, H, W)
        best_ious = _np.concatenate(all_ious, axis=0)  # (Total,)

        # 2. Filter and Process
        # Filter by IoU threshold
        iou_thresh = 0.88
        keep_mask = best_ious > iou_thresh

        final_masks = best_masks[keep_mask]
        final_ious = best_ious[keep_mask]

        if len(final_masks) == 0:
            return []

        # 3. NMS (Non-Maximum Suppression) to remove duplicates
        # Convert masks to boxes for NMS (faster) or use mask IoU?
        # Standard SAM "everything" mode uses NMS on boxes first, then maybe mask NMS.
        # Let's use box NMS for simplicity and speed.

        # Compute boxes for each mask
        boxes = []
        for m in final_masks:
            ys_coords, xs_coords = _np.where(m)
            if len(xs_coords) == 0:
                boxes.append([0, 0, 0, 0])
            else:
                boxes.append(
                    [xs_coords.min(), ys_coords.min(), xs_coords.max(), ys_coords.max()]
                )
        boxes_tensor = torch.tensor(boxes, dtype=torch.float32)
        scores_tensor = torch.tensor(final_ious, dtype=torch.float32)

        # NMS threshold
        nms_thresh = 0.7
        keep_indices = nms(boxes_tensor, scores_tensor, nms_thresh)

        filtered_masks = final_masks[keep_indices.numpy()]
        filtered_ious = final_ious[keep_indices.numpy()]

        # Return list of (mask_u8, iou)
        results = []
        for m, iou in zip(filtered_masks, filtered_ious):
            mask_u8 = (m > 0.5).astype(_np.uint8) * 255
            results.append((mask_u8, float(iou)))

        return results
