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
- **Reload Models**: Clear GPU/CPU memory by resetting loaded models (useful for VRAM management).
- **Edge Cleanup (post-process)**: Removes white fringe/halo artifacts on extracted object PNGs.
- **Restore Occluded Parts (inpaint)**: Reconstructs missing/hidden regions of a selected object layer using diffusion models (e.g. SD1.5, SDXL).
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
   pip install fastapi uvicorn python-multipart pydantic pillow numpy torch diffusers transformers
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
# If backend is on a different host/port, set VITE_API_BASE_URL
# export VITE_API_BASE_URL=http://localhost:8005
npm run dev
```
> **Note:** The frontend will likely start on port 5176 (configured in vite.config.ts). If the backend is on a different port than 8005, set `VITE_API_BASE_URL`.

## Qwen Layer Decompose

The UI exposes `Auto Layer Decompose (Qwen)` in the top bar.

This repo ships the endpoint and UI wiring, but the Qwen runtime dependencies are optional.
If your environment does not have them installed, the endpoint returns HTTP 503 with a clear message.

**Offline setup** (recommended):
- Pre-download model weights into your HF cache (so you can run with no network).
- Ensure your env has `diffusers` (with `QwenImageLayeredPipeline`) and `transformers>=4.51.3`.

**System RAM note**
- The diffusers pipeline can spike CPU RAM during model load. On machines with 48GB RAM (especially if other apps already use 15–20GB), start with preset `fast` and consider reducing `num_layers`.
- **Defaults**: Preset: `fast`, Layers: `4`.

Common environment variables:
- `HF_HOME`
- `TRANSFORMERS_CACHE`

## Post-processing

### Object Restoration (Object-Level, Offline)

The Properties panel includes **Object Restoration**, which reconstructs missing/occluded regions of the *selected object layer* (RGBA). This is object-level completion (inpainting/fill) and **never modifies the base image**.

#### Engines
- `sd15_inpaint` (Stable Diffusion v1.5 Inpainting) — Quality: Good / Speed: Fast (~6GB+ VRAM)
- `kandinsky22_inpaint` (Kandinsky 2.2 Inpainting) — Quality: Good / Speed: Medium (~10GB+ VRAM)
- `sdxl_inpaint` (SDXL Inpainting) — Quality: Very good / Speed: Slow (~16GB+ VRAM)

#### Offline model caching & Setup
The backend uses `diffusers` with `local_files_only=True`. To run offline, cache weights once while online.

**Precache Script:**
Run the provided script to download and cache all necessary restoration models:
```bash
python precache_diffusion_restore_models.py
```

Recommended environment variables:
- `HF_HOME`: set Hugging Face cache directory
- `HF_HUB_OFFLINE=1`: force offline mode after caching

If a model isn't cached, `/restore_object` will return HTTP 503 with a message indicating the weights are missing.

#### Troubleshooting
- **Missing weights (503)**: "Weights not available offline". Run the precache script while online.
- **CUDA OOM (500)**: Lower `steps` in Advanced Settings, reduce `resize_long_edge` (e.g. 768), or switch to `sd15_inpaint`.

### Edge Cleanup
- Toggle per layer in the right-side Properties panel.
- **Defaults**:
  - `Strength`: 70% (strong defringe)
  - `Feather`: 1 px (slight alpha softening)
  - `Erode`: 1 px (shrinks mask slightly before cleanup)

### Model Management (VRAM)
- **Reload Models Button** (Top Bar): Clears GPU memory used by SAM, Qwen, and Diffusion models.
- Useful if you encounter OOM errors or want to free up resources for other tasks.
- Models will be lazy-loaded again on the next use.

## Technical Architecture
- **Language**: Python (Backend), TypeScript (Frontend)
- **Backend Framework**: FastAPI
- **Model**: SAM3 (Meta Research)
- **Frontend Core**: React, Vite
- **Canvas Engine**: Konva.js
- **Styling**: Tailwind CSS / Shadcn UI components

### Key API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/upload` | POST | Upload original image, returns `image_id`, dimensions, URL |
| `/segment` | POST | Interactive segmentation (point/box/text prompts) |
| `/segment-all` | POST | Auto-segment all objects in image |
| `/restore_object` | POST | Object-level diffusion restoration (SD/Kandinsky/SDXL) |
| `/object_edge_cleanup` | POST | Apply edge cleaning to an object asset |
| `/layer_decompose` | POST | Qwen-based auto decomposition into RGBA layers |
| `/reload_models` | POST | Clear GPU memory and reset model states |
| `/export` | POST | Compose final image and generate ZIP |

### Key Data Concepts

- **`image_id`**: UUID identifying an uploaded base image, stored as `images/{image_id}.png`
- **`asset_id`**: UUID identifying any processed asset (cropped object, mask, overlay, restored background, exported composition), stored as `assets/{asset_id}.png` or `.zip`
- **`layer`**: Frontend concept representing an extracted object with transform state
