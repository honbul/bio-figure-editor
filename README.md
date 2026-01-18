# BioSeg

An offline-capable web application for segmenting biology pathway figures using SAM3.

## Project Summary

BioSeg is designed to help researchers and educators easily extract and manipulate components from complex biological diagrams (e.g., cell signaling pathways). It combines high-performance interactive segmentation with a flexible drawing-style canvas.

### Current Implementation Status
- **Backend (FastAPI)**: Fully functional API endpoints for image uploads, SAM3-powered interactive segmentation, and project export (PNG/ZIP).
- **Segmentation Engine**: Integrated Meta's **SAM3 (Segment Anything Model 3)**.
  - *Fix Applied*: Patched a critical compatibility issue in the SAM3 interactive predictor where the visual backbone was not properly shared between the video tracker and the image predictor.
  - *Performance*: Supports CPU/GPU inference with per-image embedding caching.
- **Frontend (React/TypeScript)**: A modern, responsive UI built with Vite and Tailwind CSS.
  - **Canvas**: Powered by `react-konva`, supporting drag-and-drop, scaling, rotation, and multi-layer composition.
  - **Dot Segment Tool**: Real-time click-to-segment functionality with progress indicators.
  - **Layer Control**: Visibility/locking/z-index plus per-layer post-processing controls.
  - **Undo/Redo**: History management for canvas state.

## Features
- **Local Inference**: Uses SAM3 running locally for privacy and offline usage.
- **Auto Layer Decompose (Qwen)**: One-click generation of RGBA layers (requires local Qwen dependencies + cached weights).
- **Dot-to-Segment**: Point prompt to extract objects from figures.
- **Box-to-Segment**: Box prompt for selecting regions.
- **Text-to-Segment**: Text prompt to segment by phrase.
- **Edge Cleanup (post-process)**: Removes white fringe/halo artifacts on extracted object PNGs.
- **Restore Underlying Area (inpaint)**: Fills the "hole" left behind after extracting an object.
- **Layer Management**: Move, scale, rotate, and reorder extracted layers as individual assets.
- **Project Export**: Save the final composition as a PNG or download a ZIP containing the composition and all individual high-resolution layers.

## Prerequisites
- **Python**: 3.10+
- **Node.js**: 18+ (for frontend build)
- **Hugging Face Account**: Required for initial model weight download (automatically handled).

## Setup

1. **Clone the repository** (if not already done).

2. **Backend Setup**
   ```bash
   # Ensure dependencies are installed
   pip install fastapi uvicorn python-multipart pydantic pillow numpy torch
   # Ensure the sam3/ folder is in your PYTHONPATH
   ```

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   npm run build
   cd ..
   ```

## Running the App

## Qwen Layer Decompose

The UI exposes `Auto Layer Decompose (Qwen)` in the top bar.

This repo ships the endpoint and UI wiring, but the Qwen runtime dependencies are optional.
If your environment does not have them installed, the endpoint returns HTTP 503 with a clear message.

**Offline setup** (recommended):
- Pre-download model weights into your HF cache (so you can run with no network).
- Ensure your env has `diffusers` (with `QwenImageLayeredPipeline`) and `transformers>=4.51.3`.

**System RAM note**
- The diffusers pipeline can spike CPU RAM during model load. On machines with 48GB RAM (especially if other apps already use 15–20GB), start with preset `fast` and consider reducing `num_layers`.

Common environment variables:
- `HF_HOME`
- `TRANSFORMERS_CACHE`

## Post-processing

### Edge Cleanup
- Toggle per layer in the right-side Properties panel.
- Parameters:
  - `Strength`: 0–100 (higher = stronger defringe)
  - `Feather`: 0–6 px (alpha softening)
  - `Erode`: 0–6 px (shrinks mask slightly before cleanup)

### Restore Underlying Area
- Select a layer, then in Properties click `Restore underlying area`.
- Optional: enable `Protect other layers` to avoid inpainting across other visible objects.
- This updates the base image non-destructively by switching to a newly generated restored base image (undo via existing history).


### Option 1: All-in-One (Recommended)
The start script builds the frontend and serves it through the FastAPI backend on a single port.
```bash
chmod +x start.sh
./start.sh
```
Open [http://localhost:8005](http://localhost:8005).

### Option 2: Developer Mode (Hot Reload)
**Backend:**
```bash
export PYTHONPATH=$PYTHONPATH:$(pwd)/sam3
uvicorn backend.app.main:app --reload --port 8005
```

**Frontend:**
```bash
cd frontend
npm run dev
```
> **Note:** The frontend will likely start on port 5176 (configured in vite.config.ts).

## Technical Architecture
- **Language**: Python (Backend), TypeScript (Frontend)
- **Backend Framework**: FastAPI
- **Model**: SAM3 (Meta Research)
- **Frontend Core**: React, Vite
- **Canvas Engine**: Konva.js
- **Styling**: Tailwind CSS / Shadcn UI components

## Project Summary (for Ongoing Work)

### Core Architecture

**Backend (FastAPI)**
- RESTful API server handling image processing and model inference
- Manages local file storage in `backend/data/` with three directories:
  - `images/` - Original uploaded images (`image_id.png`)
  - `assets/` - Processed assets: cropped objects, masks, overlays, restored backgrounds (`asset_id.png`, `asset_id.zip`)
  - `exports/` - Project exports (composition PNG + ZIP archives)
- Stateless design; all state maintained client-side in React

**Frontend (React/TypeScript)**
- Single-page application with interactive canvas (`react-konva`)
- Layer-based composition system supporting transform (x, y, scale, rotation), visibility, locking, z-index
- Real-time segmentation workflow with undo/redo history
- Post-processing UI for edge cleanup and background restoration

**Assets Storage**
- Files referenced by UUID-based IDs (`image_id`, `asset_id`)
- HTTP endpoints `/image/{image_id}` and `/asset/{asset_id}` serve file contents
- No database - pure filesystem storage

### Key API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/upload` | POST | Upload original image, returns `image_id`, dimensions, URL |
| `/segment` | POST | Interactive segmentation (point/box/text prompts), returns mask/overlay/object assets |
| `/segment-all` | POST | Auto-segment all objects in image, returns list of segmentation results |
| `/sam_refine` | POST | Refine segmentation on base image or transformed layer (handles layer composition) |
| `/restore` | POST | Fill hole left by extracted object via inpainting, optionally protecting other layers |
| `/layer_decompose` | POST | Qwen-based auto decomposition into RGBA layers (optional dependency) |
| `/qwen_warmup` | POST | Preload Qwen pipeline, report RAM/VRAM usage, recommended before first decomposition |
| `/export` | POST | Compose final image and generate ZIP with composition + individual layers |
| `/image/{image_id}` | GET | Retrieve original uploaded image |
| `/asset/{asset_id}` | GET | Retrieve processed asset (PNG or ZIP) |

### Key Data Concepts

- **`image_id`**: UUID identifying an uploaded base image, stored as `images/{image_id}.png`
- **`asset_id`**: UUID identifying any processed asset (cropped object, mask, overlay, restored background, exported composition), stored as `assets/{asset_id}.png` or `.zip`
- **`layer`**: Frontend concept representing an extracted object with transform state (x, y, scale_x, scale_y, rotation_deg, opacity, visible, locked, z_index)
- **`mask_asset_id`**: Optional field on layer models referencing the segmentation mask for that layer

### Known Constraints & Pitfalls

**Qwen Layer Decompose**
- **Resolution**: Fixed to 640px for `fast`/`balanced` presets, 1024px for `best` preset. Images are resized internally.
- **Memory Sensitivity**: The diffusers pipeline can spike CPU RAM during model load. On machines with ~48GB RAM (especially with 15–20GB already used), use `preset="fast"` and reduce `num_layers`.
- **OOM Handling**: Runtime errors return HTTP 500 with message "Qwen decomposition failed (possibly OOM). Try preset='fast' or reduce num_layers."
- **Offline Setup**: Requires `diffusers` (with `QwenImageLayeredPipeline`) and `transformers>=4.51.3`. Model weights must be in local HF cache (run `precache_qwen_image_layered.py` before running offline).
- **Warmup Recommended**: Call `/qwen_warmup` before first decomposition to load the pipeline and verify memory allocation. Response includes RAM RSS and VRAM allocated/reserved (if CUDA available).
- **Device Mapping**: Uses `device_map="balanced"` when CUDA is available. Falls back to CPU mode with `low_cpu_mem_usage=True` otherwise.
- **Caching**: Qwen service caches decomposition results keyed by `(image_id, num_layers, preset, seed)`.

**SAM3 Segmentation**
- **Point Grid**: Segment-all uses 32x32 grid (1024 points) processed in batches to prevent OOM on some GPUs.
- **Transform Handling**: `/sam_refine` can refine segmentation on transformed layers by rendering layer composition to a temporary base image.

## Roadmap (Next Steps)

- [ ] Add batch export mode for processing multiple images
- [ ] Implement mask editing tools (brush, eraser) for manual refinement
- [ ] Add layer grouping/folders for organizing complex compositions
- [ ] Support custom SAM3 model checkpoints
- [ ] Add project save/load (serialize canvas state to JSON)
- [ ] Integrate additional post-processing filters (blur, color adjustment)
- [ ] Add keyboard shortcuts for common actions
- [ ] Improve Qwen decomposition quality with custom prompts
- [ ] Support multi-language text prompts for SAM3
- [ ] Add progress indicators for long-running operations
