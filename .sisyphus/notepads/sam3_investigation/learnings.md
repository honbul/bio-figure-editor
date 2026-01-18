# SAM3 Investigation Findings

## Normalization
- SAM3 requires `mean=[0.5, 0.5, 0.5]` and `std=[0.5, 0.5, 0.5]`.
- The current implementation in `sam3/model/utils/sam1_utils.py` (class `SAM2Transforms`) correctly uses these values.
- `backend/app/sam3_service.py` correctly converts images to RGB before passing them to the predictor.

## Preprocessing Issue (Potential Bug)
- `SAM2Transforms` uses `Resize((1024, 1024))`, which forces the image into a square.
- This distorts the aspect ratio for non-square images.
- Standard SAM preprocessing involves resizing the longest side to 1024 and padding the rest.
- This distortion is likely causing "weird masks" or "low quality masks" because the model sees a stretched/squashed image, and the coordinate transformation logic maps points to this distorted space.

## UI/Canvas Pattern
- `frontend/src/components/Canvas.tsx` renders the base image at `(0,0)` and relies on `stagePos` to pan/center the viewport.
- For “center on import” behavior without breaking layer bbox-offset math, update `stagePos` when `baseImageUrl` changes (not on every `stageScale` change), using `(viewport - image*scale)/2`.
