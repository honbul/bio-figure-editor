from __future__ import annotations

import io
from pathlib import Path
from typing import cast

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image

from .exporter import build_export_zip, compose_image
from .layer_render import render_layer_to_base_canvas
from .models import (
    DecomposeAreaRequest,
    DecomposeAreaResponse,
    ExportRequest,
    ExportResponse,
    ImageInfo,
    LayerDecomposeRequest,
    LayerDecomposeResponse,
    ObjectEdgeCleanupRequest,
    ObjectEdgeCleanupResponse,
    OverlapSplitRequest,
    OverlapSplitResponse,
    QwenWarmupRequest,
    QwenWarmupResponse,
    ReloadModelsResponse,
    RestoreRequest,
    RestoreResponse,
    RoiSplitLayer,
    RoiSplitRequest,
    RoiSplitResponse,
    SamRefineRequest,
    SegmentAllRequest,
    SegmentAllResponse,
    SegmentRequest,
    SegmentResponse,
)
from .postprocess import (
    EdgeCleanupParams,
    RestoreParams,
    clean_rgba_edges,
    restore_background,
)
from .qwen_service import QwenLayeredService
from .sam3_service import Sam3Service
from .storage import Storage, get_api_base_url
from .utils import save_segmentation_assets, clear_gpu_memory
from backend.services.decompose_area import DecomposeAreaService
from backend.services.overlap_split import OverlapSplitService
from backend.services.roi_split import RoiSplitService

ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT_DIR / "backend" / "data"

storage = Storage(DATA_DIR)
sam3_service = Sam3Service()
qwen_service = QwenLayeredService(storage)
overlap_split_service = OverlapSplitService(storage)
roi_split_service = RoiSplitService(storage)
decompose_area_service = DecomposeAreaService(storage, sam3_service)

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
    res = qwen_service.decompose(req)
    clear_gpu_memory()
    return res


@app.post("/qwen_warmup", response_model=QwenWarmupResponse)
def qwen_warmup(req: QwenWarmupRequest) -> QwenWarmupResponse:
    return qwen_service.warmup(req)


@app.post("/reload_models", response_model=ReloadModelsResponse)
def reload_models() -> ReloadModelsResponse:
    try:
        sam3_service.reset()
        qwen_service.reset()
        overlap_split_service.reset()
        decompose_area_service.reset()

        clear_gpu_memory()

        import gc
        import torch

        for obj in gc.get_objects():
            try:
                if torch.is_tensor(obj) or (
                    hasattr(obj, "data") and torch.is_tensor(obj.data)
                ):
                    if obj.device.type == "cuda":
                        obj.to("cpu")
                        del obj
            except Exception:
                pass

        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()

        cuda = torch.cuda.is_available()

        cuda = torch.cuda.is_available()
        vram_alloc_mb = None
        vram_res_mb = None
        if cuda:
            vram_alloc_mb = int(torch.cuda.memory_allocated() / 1024 / 1024)
            vram_res_mb = int(torch.cuda.memory_reserved() / 1024 / 1024)

        return ReloadModelsResponse(
            ok=True,
            detail="models cleared; will reload lazily on next use",
            cuda=cuda,
            vram_allocated_mb=vram_alloc_mb,
            vram_reserved_mb=vram_res_mb,
        )
    except Exception as e:
        return ReloadModelsResponse(ok=False, detail=str(e))


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

    edge_params = None
    if req.edge_cleanup is not None and req.edge_cleanup.enabled:
        edge_params = EdgeCleanupParams(
            enabled=req.edge_cleanup.enabled,
            strength=req.edge_cleanup.strength,
            feather_px=req.edge_cleanup.feather_px,
            erode_px=req.edge_cleanup.erode_px,
        )

    try:
        res = save_segmentation_assets(storage, base_rgb, mask_u8, edge_params)
        clear_gpu_memory()
        return res
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/segment-all", response_model=SegmentAllResponse)
def segment_all(req: SegmentAllRequest) -> SegmentAllResponse:
    image_path = storage.image_path(req.image_id)
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="image not found")

    base_rgb = Image.open(image_path).convert("RGB")

    # Run "Segment All"
    results = sam3_service.segment_all(req.image_id, base_rgb)

    segment_responses = []

    edge_params = None
    if req.edge_cleanup is not None and req.edge_cleanup.enabled:
        edge_params = EdgeCleanupParams(
            enabled=req.edge_cleanup.enabled,
            strength=req.edge_cleanup.strength,
            feather_px=req.edge_cleanup.feather_px,
            erode_px=req.edge_cleanup.erode_px,
        )

    for mask_u8, iou in results:
        try:
            resp = save_segmentation_assets(storage, base_rgb, mask_u8, edge_params)
            segment_responses.append(resp)
        except ValueError:
            continue

    clear_gpu_memory()
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


@app.post("/object_edge_cleanup", response_model=ObjectEdgeCleanupResponse)
def object_edge_cleanup(req: ObjectEdgeCleanupRequest) -> ObjectEdgeCleanupResponse:
    object_path = storage.asset_path(req.object_asset_id, ".png")
    if not object_path.exists():
        raise HTTPException(status_code=404, detail="object asset not found")

    object_rgba = Image.open(object_path).convert("RGBA")
    rgba = np.asarray(object_rgba)
    mask_u8 = np.where(rgba[:, :, 3] > 0, 255, 0).astype(np.uint8)

    cleaned = clean_rgba_edges(
        rgba,
        mask_u8,
        EdgeCleanupParams(
            enabled=True,
            strength=req.strength,
            feather_px=req.feather_px,
            erode_px=req.erode_px,
        ),
    )

    out_asset_id = storage.new_asset_id()
    out_path = storage.asset_path(out_asset_id, ".png")
    Image.fromarray(cleaned, mode="RGBA").save(out_path, format="PNG")

    return ObjectEdgeCleanupResponse(
        object_asset_id=out_asset_id, object_url=_asset_url(out_asset_id)
    )


@app.post("/overlap_split", response_model=OverlapSplitResponse)
def overlap_split(req: OverlapSplitRequest) -> OverlapSplitResponse:
    base_image_path = storage.image_path(req.base_image_id)
    if not base_image_path.exists():
        raise HTTPException(status_code=404, detail="base image not found")

    mask_a_path = storage.asset_path(req.mask_a_asset_id, ".png")
    if not mask_a_path.exists():
        mask_a_path = storage.image_path(req.mask_a_asset_id)

    mask_b_path = storage.asset_path(req.mask_b_asset_id, ".png")
    if not mask_b_path.exists():
        mask_b_path = storage.image_path(req.mask_b_asset_id)

    if not mask_a_path.exists():
        raise HTTPException(status_code=404, detail="mask A asset not found")
    if not mask_b_path.exists():
        raise HTTPException(status_code=404, detail="mask B asset not found")

    base_image = Image.open(base_image_path).convert("RGB")
    mask_a = Image.open(mask_a_path).convert("L")
    mask_b = Image.open(mask_b_path).convert("L")

    if mask_a.size != base_image.size:
        mask_a = mask_a.resize(base_image.size, resample=0)
    if mask_b.size != base_image.size:
        mask_b = mask_b.resize(base_image.size, resample=0)

    params_in: dict[str, object] = {
        "steps": req.steps,
        "guidance_scale": req.guidance_scale,
        "seed": req.seed,
        "resize_long_edge": req.resize_long_edge,
    }
    params: dict[str, object] = {k: v for k, v in params_in.items() if v is not None}

    try:
        result = overlap_split_service.split_overlap(
            base_image,
            mask_a,
            mask_b,
            req.engine,
            params,
            req.prompt_a,
            req.prompt_b,
        )
        clear_gpu_memory()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Overlap split failed: {e}")

    layers = [
        RoiSplitLayer(
            layer_name="Object A (Completed)",
            rgba_asset_id=result.layer_a_asset_id,
            rgba_url=_asset_url(result.layer_a_asset_id),
            bbox=list(result.layer_a_bbox),
        ),
        RoiSplitLayer(
            layer_name="Object B (Completed)",
            rgba_asset_id=result.layer_b_asset_id,
            rgba_url=_asset_url(result.layer_b_asset_id),
            bbox=list(result.layer_b_bbox),
        ),
    ]

    return OverlapSplitResponse(
        layers=layers,
        cached=result.cached,
        timing_ms=result.timing_ms,
    )


@app.post("/roi_split", response_model=RoiSplitResponse)
def roi_split(req: RoiSplitRequest) -> RoiSplitResponse:
    base_image_path = storage.image_path(req.base_image_id)
    if not base_image_path.exists():
        raise HTTPException(status_code=404, detail="base image not found")

    roi_mask_path = storage.asset_path(req.roi_mask_asset_id, ".png")
    if not roi_mask_path.exists():
        roi_mask_path = storage.image_path(req.roi_mask_asset_id)

    if not roi_mask_path.exists():
        raise HTTPException(status_code=404, detail="roi mask asset not found")

    base_image = Image.open(base_image_path).convert("RGB")
    roi_mask = Image.open(roi_mask_path).convert("L")

    if roi_mask.size != base_image.size:
        roi_mask = roi_mask.resize(base_image.size, resample=0)

    params_in: dict[str, object] = {
        "steps": req.steps,
        "guidance_scale": req.guidance_scale,
        "seed": req.seed,
        "resize_long_edge": req.resize_long_edge,
    }
    params: dict[str, object] = {k: v for k, v in params_in.items() if v is not None}

    fg_point = (int(req.fg_point.x), int(req.fg_point.y)) if req.fg_point else None
    bg_point = (int(req.bg_point.x), int(req.bg_point.y)) if req.bg_point else None

    try:
        result = roi_split_service.split(
            base_image,
            roi_mask,
            req.engine,
            params,
            fg_point=fg_point,
            bg_point=bg_point,
            prompt=req.prompt,
        )
        clear_gpu_memory()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ROI split failed: {e}")

    layers = [
        RoiSplitLayer(
            layer_name="Background (Restored)",
            rgba_asset_id=result.bg_asset_id,
            rgba_url=_asset_url(result.bg_asset_id),
            bbox=list(result.bg_bbox),
        ),
        RoiSplitLayer(
            layer_name="Foreground (Extracted)",
            rgba_asset_id=result.fg_asset_id,
            rgba_url=_asset_url(result.fg_asset_id),
            bbox=list(result.fg_bbox),
        ),
    ]

    return RoiSplitResponse(
        layers=layers,
        cached=result.cached,
        timing_ms=result.timing_ms,
    )


@app.post("/decompose_area", response_model=DecomposeAreaResponse)
def decompose_area(req: DecomposeAreaRequest) -> DecomposeAreaResponse:
    base_image_path = storage.image_path(req.base_image_id)
    if not base_image_path.exists():
        raise HTTPException(status_code=404, detail="base image not found")

    base_image = Image.open(base_image_path).convert("RGB")

    params_in: dict[str, object] = {
        "num_layers": req.num_layers,
        "steps": req.steps,
        "guidance_scale": req.guidance_scale,
        "seed": req.seed,
    }
    params: dict[str, object] = {k: v for k, v in params_in.items() if v is not None}

    try:
        result = decompose_area_service.decompose_area(
            base_image,
            req.roi_box,
            req.base_image_id,
            params,
        )
        clear_gpu_memory()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Decompose area failed: {e}")

    layers = []
    for l in result.layers:
        layers.append(
            RoiSplitLayer(
                layer_name=str(l["layer_name"]),
                rgba_asset_id=str(l["rgba_asset_id"]),
                rgba_url=_asset_url(str(l["rgba_asset_id"])),
                bbox=[int(x) for x in cast(list[int], l["bbox"])],
            )
        )

    return DecomposeAreaResponse(
        layers=layers,
        cached=result.cached,
        timing_ms=result.timing_ms,
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
