export type Tool = 'select' | 'pan' | 'zoom' | 'segment' | 'text' | 'box';

export interface ImageInfo {
  image_id: string;
  width: number;
  height: number;
  url: string;
}

export interface PointPrompt {
  x: number;
  y: number;
  label: number;
}

export interface EdgeCleanupSettings {
  enabled: boolean;
  strength: number;
  feather_px?: number;
  erode_px?: number;
}

export interface SegmentRequest {
  image_id: string;
  points?: PointPrompt[];
  box_xyxy?: number[];
  text_prompt?: string;
  multimask_output?: boolean;
  threshold?: number;
  edge_cleanup?: EdgeCleanupSettings;
}

export interface SegmentAllRequest {
  image_id: string;
  edge_cleanup?: EdgeCleanupSettings;
}

export interface SegmentResponse {
  mask_asset_id: string;
  mask_url: string;
  overlay_asset_id: string;
  overlay_url: string;
  object_asset_id: string;
  object_url: string;
  bbox_xyxy: [number, number, number, number];
}

export interface Layer {
  id: string;
  asset_id: string;
  asset_url: string;
  name?: string;
  mask_asset_id?: string;
  edge_cleanup_enabled?: boolean;
  edge_cleanup_strength?: number;
  edge_cleanup_feather_px?: number;
  edge_cleanup_erode_px?: number;
  edge_cleanup_applied_asset_id?: string;
  protect_other_layers?: boolean;
  x: number;
  y: number;
  scale_x: number;
  scale_y: number;
  rotation_deg: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  z_index: number;
}

export interface RestoreRequest {
  base_image_id: string;
  hole_mask_asset_id: string;
  protect_mask_asset_ids?: string[];
}

export interface RestoreResponse {
  restored_asset_id: string;
  restored_url: string;
}

export interface ObjectEdgeCleanupRequest {
  object_asset_id: string;
  strength: number;
  feather_px: number;
  erode_px: number;
}

export interface ObjectEdgeCleanupResponse {
  object_asset_id: string;
  object_url: string;
}

export interface ObjectRestoreRequest {
  layer_id: string;
  engine: string;
  prompt?: string;
  params?: {
    steps?: number;
    guidance_scale?: number;
    seed?: number;
    resize_long_edge?: number;
  };
  restore_mask_asset_id?: string;
}

export interface ObjectRestoreResponse {
  restored_layer_asset_id: string;
  preview_url: string;
  metadata?: any;
}

export interface LayerDecomposeRequest {
  image_id: string;
  preset: 'fast' | 'balanced' | 'best';
  num_layers?: number;
  seed?: number;
}

export interface DecomposedLayer {
  layer_id: string;
  png_rgba_asset_id: string;
  png_rgba_url: string;
  width: number;
  height: number;
  suggested_name?: string;
  confidence?: number;
}

export interface LayerDecomposeResponse {
  layers: DecomposedLayer[];
  cached: boolean;
}
