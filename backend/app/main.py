from __future__ import annotations

import io
from pathlib import Path

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image

from .exporter import build_export_zip, compose_image
from .models import (
    ExportRequest,
    ExportResponse,
    ImageInfo,
    LayerDecomposeRequest,
    LayerDecomposeResponse,
    QwenWarmupRequest,
    QwenWarmupResponse,
    SamRefineRequest,
    SegmentRequest,
    SegmentResponse,
    SegmentAllRequest,
    SegmentAllResponse,
    RestoreRequest,
    RestoreResponse,
)
from .postprocess import (
    EdgeCleanupParams,
    RestoreParams,
    clean_rgba_edges,
    restore_background,
)
from .layer_render import render_layer_to_base_canvas
from .qwen_service import QwenLayeredService
from .sam3_service import Sam3Service
from .storage import Storage, get_api_base_url


ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT_DIR / "backend" / "data"

storage = Storage(DATA_DIR)
sam3_service = Sam3Service()
qwen_service = QwenLayeredService(storage)

from fastapi.staticfiles import StaticFiles

# ... existing code ...

app = FastAPI(title="BioSeg")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _asset_url(asset_id: str) -> str:
    return f"{get_api_base_url().rstrip('/')}/asset/{asset_id}"


@app.post("/upload", response_model=ImageInfo)
async def upload_image(file: UploadFile = File(...)) -> ImageInfo:
    try:
        data = await file.read()
        image = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {e}")

    image_id = storage.new_image_id()
    path = storage.image_path(image_id)
    image.save(path, format="PNG")

    return ImageInfo(
        image_id=image_id,
        width=image.size[0],
        height=image.size[1],
        url=f"{get_api_base_url().rstrip('/')}/image/{image_id}",
    )


@app.post("/layer_decompose", response_model=LayerDecomposeResponse)
def layer_decompose(req: LayerDecomposeRequest) -> LayerDecomposeResponse:
    return qwen_service.decompose(req)


@app.post("/qwen_warmup", response_model=QwenWarmupResponse)
def qwen_warmup(req: QwenWarmupRequest) -> QwenWarmupResponse:
    return qwen_service.warmup(req)


@app.post("/sam_refine", response_model=SegmentResponse)
def sam_refine(req: SamRefineRequest) -> SegmentResponse:
    if req.mode == "base":
        segment_req = SegmentRequest(
            image_id=req.base_image_id,
            points=req.points,
            box_xyxy=req.box_xyxy,
            text_prompt=req.text_prompt,
            multimask_output=req.multimask_output,
            threshold=req.threshold,
            edge_cleanup=req.edge_cleanup,
        )
        return segment(segment_req)

    if req.layer_asset_id is None:
        raise HTTPException(status_code=400, detail="layer_asset_id is required")

    base_path = storage.image_path(req.base_image_id)
    if not base_path.exists():
        raise HTTPException(status_code=404, detail="base image not found")

    layer_path = storage.asset_path(req.layer_asset_id, ".png")
    if not layer_path.exists():
        raise HTTPException(status_code=404, detail="layer asset not found")

    base_rgb = Image.open(base_path).convert("RGB")
    layer_rgba = Image.open(layer_path).convert("RGBA")

    x = float(req.layer_x or 0.0)
    y = float(req.layer_y or 0.0)
    scale_x = float(req.layer_scale_x or 1.0)
    scale_y = float(req.layer_scale_y or 1.0)
    rotation_deg = float(req.layer_rotation_deg or 0.0)

    derived_rgba = render_layer_to_base_canvas(
        base_rgb.size,
        layer_rgba,
        x=x,
        y=y,
        scale_x=scale_x,
        scale_y=scale_y,
        rotation_deg=rotation_deg,
    )

    derived_asset_id = storage.new_asset_id()
    derived_path = storage.image_path(derived_asset_id)
    derived_rgba.convert("RGB").save(derived_path, format="PNG")

    segment_req = SegmentRequest(
        image_id=derived_asset_id,
        points=req.points,
        box_xyxy=req.box_xyxy,
        text_prompt=req.text_prompt,
        multimask_output=req.multimask_output,
        threshold=req.threshold,
        edge_cleanup=req.edge_cleanup,
    )
    return segment(segment_req)


@app.get("/image/{image_id}")
def get_image(image_id: str):
    path = storage.image_path(image_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="image not found")
    return FileResponse(path)


@app.get("/asset/{asset_id}")
def get_asset(asset_id: str):
    png = storage.asset_path(asset_id, ".png")
    if png.exists():
        return FileResponse(png)

    zip_path = storage.asset_path(asset_id, ".zip")
    if zip_path.exists():
        return FileResponse(zip_path, media_type="application/zip")

    raise HTTPException(status_code=404, detail="asset not found")


@app.post("/segment", response_model=SegmentResponse)
def segment(req: SegmentRequest) -> SegmentResponse:
    image_path = storage.image_path(req.image_id)
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="image not found")

    base_rgb = Image.open(image_path).convert("RGB")
    points = [(p.x, p.y, p.label) for p in req.points]

    # Validation: Need at least one prompt type
    if len(points) == 0 and req.box_xyxy is None and req.text_prompt is None:
        raise HTTPException(
            status_code=400,
            detail="at least one prompt (point, box, or text) is required",
        )

    mask_u8, _iou, _low_res = sam3_service.segment(
        req.image_id,
        base_rgb,
        points,
        box=req.box_xyxy,
        text=req.text_prompt,
        threshold=req.threshold,
    )

    ys, xs = np.where(mask_u8 > 0)
    if len(xs) == 0 or len(ys) == 0:
        raise HTTPException(status_code=422, detail="no mask predicted")

    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    bbox_xyxy = [x0, y0, x1, y1]

    alpha = Image.fromarray(mask_u8, mode="L")

    mask_rgba = Image.new("RGBA", base_rgb.size, (255, 255, 255, 0))
    mask_rgba.putalpha(alpha)

    mask_asset_id = storage.new_asset_id()
    mask_path = storage.asset_path(mask_asset_id, ".png")
    mask_rgba.save(mask_path, format="PNG")

    base_rgba = base_rgb.convert("RGBA")
    base_rgba.putalpha(alpha)
    object_rgba = base_rgba.crop((x0, y0, x1, y1))

    if req.edge_cleanup is not None and req.edge_cleanup.enabled:
        cleaned = clean_rgba_edges(
            np.asarray(base_rgba),
            mask_u8,
            EdgeCleanupParams(
                enabled=req.edge_cleanup.enabled,
                strength=req.edge_cleanup.strength,
                feather_px=req.edge_cleanup.feather_px,
                erode_px=req.edge_cleanup.erode_px,
            ),
        )
        object_rgba = Image.fromarray(cleaned, mode="RGBA").crop((x0, y0, x1, y1))

    object_asset_id = storage.new_asset_id()
    object_path = storage.asset_path(object_asset_id, ".png")
    object_rgba.save(object_path, format="PNG")

    overlay_alpha = alpha.point([0] + [90] * 255)
    overlay = Image.new("RGBA", base_rgb.size, (255, 0, 0, 0))
    overlay.putalpha(overlay_alpha)

    overlay_asset_id = storage.new_asset_id()
    overlay_path = storage.asset_path(overlay_asset_id, ".png")
    overlay.save(overlay_path, format="PNG")

    return SegmentResponse(
        mask_asset_id=mask_asset_id,
        mask_url=_asset_url(mask_asset_id),
        overlay_asset_id=overlay_asset_id,
        overlay_url=_asset_url(overlay_asset_id),
        object_asset_id=object_asset_id,
        object_url=_asset_url(object_asset_id),
        bbox_xyxy=bbox_xyxy,
    )


@app.post("/segment-all", response_model=SegmentAllResponse)
def segment_all(req: SegmentAllRequest) -> SegmentAllResponse:
    image_path = storage.image_path(req.image_id)
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="image not found")

    base_rgb = Image.open(image_path).convert("RGB")

    # Run "Segment All"
    results = sam3_service.segment_all(req.image_id, base_rgb)

    segment_responses = []

    for mask_u8, iou in results:
        # Process each object (save assets)
        # This duplicates logic from /segment but applied to many objects.
        # Ideally refactor asset saving, but for MVP inline is fine.

        ys, xs = np.where(mask_u8 > 0)
        if len(xs) == 0 or len(ys) == 0:
            continue

        x0, x1 = int(xs.min()), int(xs.max()) + 1
        y0, y1 = int(ys.min()), int(ys.max()) + 1
        bbox_xyxy = [x0, y0, x1, y1]

        alpha = Image.fromarray(mask_u8, mode="L")

        # Save Mask
        mask_rgba = Image.new("RGBA", base_rgb.size, (255, 255, 255, 0))
        mask_rgba.putalpha(alpha)

        mask_asset_id = storage.new_asset_id()
        mask_path = storage.asset_path(mask_asset_id, ".png")
        mask_rgba.save(mask_path, format="PNG")

        # Save Object Crop
        base_rgba = base_rgb.convert("RGBA")
        base_rgba.putalpha(alpha)
        object_rgba = base_rgba.crop((x0, y0, x1, y1))

        if req.edge_cleanup is not None and req.edge_cleanup.enabled:
            cleaned = clean_rgba_edges(
                np.asarray(base_rgba),
                mask_u8,
                EdgeCleanupParams(
                    enabled=req.edge_cleanup.enabled,
                    strength=req.edge_cleanup.strength,
                    feather_px=req.edge_cleanup.feather_px,
                    erode_px=req.edge_cleanup.erode_px,
                ),
            )
            object_rgba = Image.fromarray(cleaned, mode="RGBA").crop((x0, y0, x1, y1))

        object_asset_id = storage.new_asset_id()
        object_path = storage.asset_path(object_asset_id, ".png")
        object_rgba.save(object_path, format="PNG")

        # Save Overlay (Optional - maybe skip for segment all to save space? But frontend might expect it)
        # We'll generate it to be safe/consistent.
        overlay_alpha = alpha.point([0] + [90] * 255)
        overlay = Image.new("RGBA", base_rgb.size, (255, 0, 0, 0))
        overlay.putalpha(overlay_alpha)

        overlay_asset_id = storage.new_asset_id()
        overlay_path = storage.asset_path(overlay_asset_id, ".png")
        overlay.save(overlay_path, format="PNG")

        segment_responses.append(
            SegmentResponse(
                mask_asset_id=mask_asset_id,
                mask_url=_asset_url(mask_asset_id),
                overlay_asset_id=overlay_asset_id,
                overlay_url=_asset_url(overlay_asset_id),
                object_asset_id=object_asset_id,
                object_url=_asset_url(object_asset_id),
                bbox_xyxy=bbox_xyxy,
            )
        )

    return SegmentAllResponse(objects=segment_responses)


@app.post("/restore", response_model=RestoreResponse)
def restore(req: RestoreRequest) -> RestoreResponse:
    base_image_path = storage.image_path(req.base_image_id)
    if not base_image_path.exists():
        raise HTTPException(status_code=404, detail="base image not found")

    hole_path = storage.asset_path(req.hole_mask_asset_id, ".png")
    if not hole_path.exists():
        raise HTTPException(status_code=404, detail="hole mask not found")

    base_rgb = Image.open(base_image_path).convert("RGB")
    hole_img = Image.open(hole_path).convert("RGBA")
    hole_alpha = np.asarray(hole_img)[:, :, 3].astype(np.uint8)
    hole_mask_u8 = np.where(hole_alpha > 0, 255, 0).astype(np.uint8)

    protect_mask_u8 = None  # type: ignore[reportMissingTypeArgument]
    if req.protect_mask_asset_ids:
        protect = np.zeros_like(hole_mask_u8)
        for asset_id in req.protect_mask_asset_ids:
            p = storage.asset_path(asset_id, ".png")
            if not p.exists():
                raise HTTPException(
                    status_code=404, detail=f"protect mask not found: {asset_id}"
                )
            img = Image.open(p).convert("RGBA")
            a = np.asarray(img)[:, :, 3].astype(np.uint8)
            protect = np.maximum(protect, np.where(a > 0, 255, 0).astype(np.uint8))
        protect_mask_u8 = protect

    restored_rgb = restore_background(
        np.asarray(base_rgb),
        hole_mask_u8,
        protect_mask_u8_in=protect_mask_u8,
        params=RestoreParams(mode=req.mode, radius=req.radius, method=req.method),
    )

    restored_asset_id = storage.new_asset_id()
    restored_path = storage.asset_path(restored_asset_id, ".png")
    Image.fromarray(restored_rgb, mode="RGB").save(restored_path, format="PNG")

    return RestoreResponse(
        restored_asset_id=restored_asset_id, restored_url=_asset_url(restored_asset_id)
    )


@app.post("/export", response_model=ExportResponse)
def export_project(req: ExportRequest) -> ExportResponse:
    base_image_path = storage.image_path(req.base_image_id)
    if not base_image_path.exists():
        raise HTTPException(status_code=404, detail="base image not found")

    def resolve_asset_path(asset_id: str) -> Path:
        path = storage.asset_path(asset_id, ".png")
        if not path.exists():
            raise HTTPException(status_code=404, detail=f"asset not found: {asset_id}")
        return path

    composed = compose_image(
        base_image_path, req.layers, req.include_base_image, resolve_asset_path
    )
    composed_asset_id = storage.new_asset_id()
    composed_path = storage.asset_path(composed_asset_id, ".png")
    composed.save(composed_path, format="PNG")

    zip_bytes = build_export_zip(
        req.base_image_id,
        base_image_path,
        req.layers,
        req.include_base_image,
        resolve_asset_path,
    )
    zip_asset_id = storage.new_asset_id()
    zip_path = storage.asset_path(zip_asset_id, ".zip")
    with open(zip_path, "wb") as f:
        f.write(zip_bytes)

    return ExportResponse(
        composed_asset_id=composed_asset_id,
        composed_url=_asset_url(composed_asset_id),
        zip_asset_id=zip_asset_id,
        zip_url=_asset_url(zip_asset_id),
    )


# Serve frontend build if it exists
frontend_dist = ROOT_DIR / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="static")
