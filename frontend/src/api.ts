import { API_BASE_URL } from '@/config';
import { 
  SegmentResponse, 
  SegmentAllResponse, 
  LayerDecomposeResponse, 
  ObjectEdgeCleanupResponse, 
  RoiSplitResponse, 
  OverlapSplitResponse, 
  DecomposeAreaResponse,
  ExportResponse,
  ImageInfo
} from '@/types';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || `Request failed with status ${res.status}`);
  }
  return res.json() as T;
}

export const api = {
  upload: async (file: Blob | File): Promise<ImageInfo> => {
    const fd = new FormData();
    fd.append('file', file, 'upload.png');
    const res = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      body: fd,
    });
    if (!res.ok) throw new Error('Upload failed');
    return res.json() as Promise<ImageInfo>;
  },

  segment: (req: any) => request<SegmentResponse>('/segment', { method: 'POST', body: JSON.stringify(req) }),
  segmentAll: (req: any) => request<SegmentAllResponse>('/segment-all', { method: 'POST', body: JSON.stringify(req) }),
  samRefine: (req: any) => request<SegmentResponse>('/sam_refine', { method: 'POST', body: JSON.stringify(req) }),
  reloadModels: () => request<any>('/reload_models', { method: 'POST' }),
  layerDecompose: (req: any) => request<LayerDecomposeResponse>('/layer_decompose', { method: 'POST', body: JSON.stringify(req) }),
  qwenWarmup: (req: any) => request<any>('/qwen_warmup', { method: 'POST', body: JSON.stringify(req) }),
  roiSplit: (req: any) => request<RoiSplitResponse>('/roi_split', { method: 'POST', body: JSON.stringify(req) }),
  overlapSplit: (req: any) => request<OverlapSplitResponse>('/overlap_split', { method: 'POST', body: JSON.stringify(req) }),
  decomposeArea: (req: any) => request<DecomposeAreaResponse>('/decompose_area', { method: 'POST', body: JSON.stringify(req) }),
  edgeCleanup: (req: any) => request<ObjectEdgeCleanupResponse>('/object_edge_cleanup', { method: 'POST', body: JSON.stringify(req) }),
  export: (req: any) => request<ExportResponse>('/export', { method: 'POST', body: JSON.stringify(req) }),
};
