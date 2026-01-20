from __future__ import annotations

from pydantic import BaseModel, Field


class ImageInfo(BaseModel):
    image_id: str
    width: int
    height: int
    url: str


class PointPrompt(BaseModel):
    x: float
    y: float
    label: int = Field(..., description="1=foreground, 0=background")


class EdgeCleanupSettings(BaseModel):
    enabled: bool = True
    strength: int = Field(60, ge=0, le=100)
    feather_px: int = Field(1, ge=0, le=6)
    erode_px: int = Field(0, ge=0, le=6)


class SegmentRequest(BaseModel):
    image_id: str
    points: list[PointPrompt] = []
    box_xyxy: list[int] | None = None
    text_prompt: str | None = None
    multimask_output: bool = True
    threshold: float | None = None
    edge_cleanup: EdgeCleanupSettings | None = None


class SegmentAllRequest(BaseModel):
    image_id: str
    edge_cleanup: EdgeCleanupSettings | None = None


class SegmentAllResponse(BaseModel):
    objects: list[SegmentResponse]


class SegmentResponse(BaseModel):
    mask_asset_id: str
    mask_url: str
    overlay_asset_id: str
    overlay_url: str
    object_asset_id: str
    object_url: str
    bbox_xyxy: list[int]


class ExportLayer(BaseModel):
    layer_id: str
    asset_id: str
    x: float
    y: float
    scale_x: float = 1.0
    scale_y: float = 1.0
    rotation_deg: float = 0.0
    opacity: float = 1.0
    visible: bool = True
    locked: bool = False
    z_index: int = 0
    mask_asset_id: str | None = None


class RestoreRequest(BaseModel):
    base_image_id: str
    hole_mask_asset_id: str
    protect_mask_asset_ids: list[str] = []
    mode: str = "simple"
    radius: int = Field(5, ge=1, le=50)
    method: str = "telea"


class RestoreResponse(BaseModel):
    restored_asset_id: str
    restored_url: str


class ObjectEdgeCleanupRequest(BaseModel):
    object_asset_id: str
    strength: int = Field(70, ge=0, le=100)
    feather_px: int = Field(1, ge=0, le=6)
    erode_px: int = Field(1, ge=0, le=6)


class ObjectEdgeCleanupResponse(BaseModel):
    object_asset_id: str
    object_url: str


class ExportRequest(BaseModel):
    base_image_id: str
    layers: list[ExportLayer]
    include_base_image: bool = True


class LayerDecomposeRequest(BaseModel):
    image_id: str
    num_layers: int | None = Field(4, ge=1, le=32)
    preset: str = Field("fast", pattern="^(fast|balanced|best)$")
    seed: int | None = None


class DecomposedLayer(BaseModel):
    layer_id: str
    png_rgba_asset_id: str
    png_rgba_url: str
    width: int
    height: int
    suggested_name: str
    confidence: float | None = None


class LayerDecomposeResponse(BaseModel):
    layers: list[DecomposedLayer]
    composite_preview_asset_id: str | None = None
    composite_preview_url: str | None = None
    cached: bool = False
    timing_ms: int | None = None


class QwenWarmupRequest(BaseModel):
    preset: str = Field("fast", pattern="^(fast|balanced|best)$")
    num_layers: int = Field(4, ge=1, le=32)


class QwenWarmupResponse(BaseModel):
    ok: bool
    detail: str
    ram_rss_mb: int | None = None
    cuda: bool = False
    vram_allocated_mb: int | None = None
    vram_reserved_mb: int | None = None


class ReloadModelsResponse(BaseModel):
    ok: bool
    detail: str
    cuda: bool = False
    vram_allocated_mb: int | None = None
    vram_reserved_mb: int | None = None


class SamRefineRequest(BaseModel):
    # mode="base": refine prompts on the base image
    # mode="layer": refine prompts on a transformed layer rendered onto base canvas
    mode: str = Field("base", pattern="^(base|layer)$")

    base_image_id: str

    layer_asset_id: str | None = None
    layer_x: float | None = None
    layer_y: float | None = None
    layer_scale_x: float | None = None
    layer_scale_y: float | None = None
    layer_rotation_deg: float | None = None

    points: list[PointPrompt] = []
    box_xyxy: list[int] | None = None
    text_prompt: str | None = None
    multimask_output: bool = True
    threshold: float | None = None
    edge_cleanup: EdgeCleanupSettings | None = None


class AssetInfo(BaseModel):
    asset_id: str
    url: str


class BaseServiceParams(BaseModel):
    steps: int | None = Field(None, ge=1, le=200)
    guidance_scale: float | None = Field(None, ge=0.0, le=50.0)
    seed: int | None = None


class RoiSplitRequest(BaseServiceParams):
    base_image_id: str
    roi_mask_asset_id: str
    engine: str = Field(
        "sdxl_inpaint",
        pattern="^(sdxl_inpaint)$",
    )
    fg_point: PointPrompt | None = None
    bg_point: PointPrompt | None = None
    prompt: str | None = None
    resize_long_edge: int | None = Field(None, ge=64, le=2048)


class RoiSplitLayer(BaseModel):
    layer_name: str
    rgba_asset_id: str
    rgba_url: str
    bbox: list[int]


class RoiSplitResponse(BaseModel):
    layers: list[RoiSplitLayer]
    cached: bool = False
    timing_ms: int | None = None


class OverlapSplitRequest(BaseServiceParams):
    base_image_id: str
    mask_a_asset_id: str
    mask_b_asset_id: str
    engine: str = Field("sdxl_inpaint", pattern="^(sdxl_inpaint)$")
    prompt_a: str | None = None
    prompt_b: str | None = None
    resize_long_edge: int | None = Field(None, ge=64, le=2048)


class OverlapSplitResponse(BaseModel):
    layers: list[RoiSplitLayer]
    cached: bool = False
    timing_ms: int | None = None


class DecomposeAreaRequest(BaseServiceParams):
    base_image_id: str
    roi_box: list[int] = Field(..., min_length=4, max_length=4)
    num_layers: int | None = Field(5, ge=1, le=20)


class DecomposeAreaResponse(BaseModel):
    layers: list[RoiSplitLayer]
    cached: bool = False
    timing_ms: int | None = None


class ExportResponse(BaseModel):
    composed_asset_id: str
    composed_url: str
    zip_asset_id: str
    zip_url: str
