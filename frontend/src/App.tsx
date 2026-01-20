import { useState, useRef, useCallback, useEffect } from 'react';
import { LeftToolbar } from '@/components/LeftToolbar';
import { TopBar } from '@/components/TopBar';
import { LayerList } from '@/components/LayerList';
import { Properties } from '@/components/Properties';
import { RoiPanel } from '@/components/RoiPanel';
import { DecomposePanel } from '@/components/DecomposePanel';
import { OverlapPanel } from '@/components/OverlapPanel';
import { Canvas } from '@/components/Canvas';
import { api } from '@/api';
import { useHistory } from '@/hooks/useHistory';
import { Layer, ImageInfo, SegmentResponse, LayerDecomposeRequest, LayerDecomposeResponse, Tool, ObjectEdgeCleanupRequest, ObjectEdgeCleanupResponse, RoiSplitResponse, OverlapSplitResponse, DecomposeAreaResponse, SegmentAllResponse, ExportResponse } from '@/types';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Sliders, Upload, Layers, Settings2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import { rasterizeRoiMask } from '@/utils/rasterizeRoiMask';

function App() {
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [baseImage, setBaseImage] = useState<ImageInfo | null>(null);
  const [_baseImageHistory, setBaseImageHistory] = useState<ImageInfo[]>([]);
  const [_baseImageHistoryIndex, setBaseImageHistoryIndex] = useState(-1);
  const { layers, setLayers, updateLayers, undo, redo, canUndo, canRedo } = useHistory([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSegmenting, setIsSegmenting] = useState(false);
  const [isApplyingEdgeCleanup, setIsApplyingEdgeCleanup] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showLayerDecomposeDialog, setShowLayerDecomposeDialog] = useState(false);
  const [isDecomposing, setIsDecomposing] = useState(false);
  const [isReloadingModels, setIsReloadingModels] = useState(false);
  const [decomposePreset, setDecomposePreset] = useState<'fast' | 'balanced' | 'best'>('fast');
  const [decomposeNumLayers, setDecomposeNumLayers] = useState<number | ''>(4);
  const [decomposeSeed, setDecomposeSeed] = useState<number | ''>('');
  const [decomposeProgress, setDecomposeProgress] = useState('');
  const [exportIncludeBase, setExportIncludeBase] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<'layers' | 'properties'>('layers');
  
  // ROI State
  const [roiMode, setRoiMode] = useState<'rect' | 'poly'>('rect');
  const [roiBox, setRoiBox] = useState<[number, number, number, number] | null>(null);
  const [roiPoints, setRoiPoints] = useState<{x: number, y: number}[]>([]);
  const [roiEngine, setRoiEngine] = useState('sdxl_inpaint');
  const [roiParams, setRoiParams] = useState<Record<string, any>>({ steps: 20, guidance_scale: 6.0, strength: 1.0 });
  const [roiHintMode, setRoiHintMode] = useState<'fg' | 'bg' | null>(null);
  const [roiFgPoint, setRoiFgPoint] = useState<{ x: number, y: number } | null>(null);
  const [roiBgPoint, setRoiBgPoint] = useState<{ x: number, y: number } | null>(null);
  const [roiPrompt, setRoiPrompt] = useState<string>('');
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitProgress, setSplitProgress] = useState('');

  // Overlap State
  const [overlapMode, setOverlapMode] = useState<'rect' | 'poly'>('rect');
  const [overlapActiveMask, setOverlapActiveMask] = useState<'A' | 'B'>('A');
  const [overlapMaskA, setOverlapMaskA] = useState<{ box: [number, number, number, number] | null; points: {x: number, y: number}[] }>({ box: null, points: [] });
  const [overlapMaskB, setOverlapMaskB] = useState<{ box: [number, number, number, number] | null; points: {x: number, y: number}[] }>({ box: null, points: [] });
  const [overlapPromptA, setOverlapPromptA] = useState('');
  const [overlapPromptB, setOverlapPromptB] = useState('');
  const [overlapEngine, setOverlapEngine] = useState('sdxl_inpaint');
  const [overlapParams, setOverlapParams] = useState<Record<string, any>>({ steps: 20, guidance_scale: 6.0, strength: 1.0 });
  const [isOverlapSplitting, setIsOverlapSplitting] = useState(false);
  const [overlapSplitProgress, setOverlapSplitProgress] = useState('');

  // Decompose Area State
  const [decomposeBox, setDecomposeBox] = useState<[number, number, number, number] | null>(null);
  const [decomposeParams, setDecomposeParams] = useState<{ steps: number; guidance_scale: number; seed: number | ''; num_layers: number }>({ steps: 20, guidance_scale: 6.0, seed: '', num_layers: 5 });
  const [isDecomposingArea, setIsDecomposingArea] = useState(false);
  const [decomposeAreaProgress, setDecomposeAreaProgress] = useState('');

  const selectedLayer = layers.find(l => l.id === selectedLayerId) || null;

  // Auto-switch to properties when a layer is selected
  useEffect(() => {
    if (selectedLayerId) {
      setRightPanelTab('properties');
    }
  }, [selectedLayerId]);

  const handleRoiHintPoint = useCallback((mode: 'fg' | 'bg', point: { x: number, y: number }) => {
    if (mode === 'fg') {
      setRoiFgPoint(point);
    } else {
      setRoiBgPoint(point);
    }
    setRoiHintMode(null);
  }, []);

  const handleRoiSplit = useCallback(async () => {
    if (!baseImage) {
      alert('No base image loaded');
      return;
    }
    if (!roiBox && (!roiPoints || roiPoints.length < 3)) {
      alert('No ROI defined');
      return;
    }

    setIsSplitting(true);
    setSplitProgress('Rasterizing mask...');

    try {
      const maskBlob = await rasterizeRoiMask(
        roiMode,
        roiBox,
        roiPoints,
        baseImage.width,
        baseImage.height
      );

      setSplitProgress('Uploading mask...');
      const maskInfo = await api.upload(maskBlob);
      const maskAssetId = maskInfo.image_id;

      setSplitProgress('Running ROI Split (this may take a while)...');

      const splitReq: any = {
        base_image_id: baseImage.image_id,
        roi_mask_asset_id: maskAssetId,
        engine: roiEngine,
        steps: roiParams.steps,
        guidance_scale: roiParams.guidance_scale,
        seed: roiParams.seed,
        resize_long_edge: roiParams.resize_long_edge,
        prompt: roiPrompt || null,
      };

      if (roiFgPoint) splitReq.fg_point = { x: roiFgPoint.x, y: roiFgPoint.y, label: 1 };
      if (roiBgPoint) splitReq.bg_point = { x: roiBgPoint.x, y: roiBgPoint.y, label: 0 };

      const data: RoiSplitResponse = await api.roiSplit(splitReq);
      setSplitProgress('Finalizing...');

      const newLayers: Layer[] = data.layers.map((l: any, idx: number) => ({
        id: l.rgba_asset_id,
        asset_id: l.rgba_asset_id,
        asset_url: l.rgba_url,
        name: l.layer_name,
        x: l.bbox[0],
        y: l.bbox[1],
        scale_x: 1,
        scale_y: 1,
        rotation_deg: 0,
        opacity: 1,
        visible: true,
        locked: false,
        z_index: layers.length + 1 + idx,
        edge_cleanup_enabled: false,
        edge_cleanup_strength: 50,
        edge_cleanup_feather_px: 1,
        edge_cleanup_erode_px: 1,
      }));

      const updatedLayers = [...layers, ...newLayers];
      updateLayers(updatedLayers);

      if (newLayers.length > 0) {
        setSelectedLayerId(newLayers[newLayers.length - 1].id);
      }

      setRoiBox(null);
      setRoiPoints([]);
      setRoiFgPoint(null);
      setRoiBgPoint(null);
      setActiveTool('select');

    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Unknown ROI split error');
    } finally {
      setIsSplitting(false);
      setSplitProgress('');
    }
  }, [baseImage, roiMode, roiBox, roiPoints, roiEngine, roiParams, roiFgPoint, roiBgPoint, layers, updateLayers]);

  const handleOverlapSplit = useCallback(async () => {
    if (!baseImage) {
      alert('No base image loaded');
      return;
    }
    
    const hasMaskA = !!(overlapMaskA.box || overlapMaskA.points.length >= 3);
    const hasMaskB = !!(overlapMaskB.box || overlapMaskB.points.length >= 3);
    
    if (!hasMaskA || !hasMaskB) {
      alert('Both Mask A and Mask B must be defined');
      return;
    }

    setIsOverlapSplitting(true);
    setOverlapSplitProgress('Rasterizing masks...');

    try {
      // Rasterize Mask A
      const maskABlob = await rasterizeRoiMask(
        overlapMaskA.box ? 'rect' : 'poly',
        overlapMaskA.box,
        overlapMaskA.points,
        baseImage.width,
        baseImage.height
      );

      // Rasterize Mask B
      const maskBBlob = await rasterizeRoiMask(
        overlapMaskB.box ? 'rect' : 'poly',
        overlapMaskB.box,
        overlapMaskB.points,
        baseImage.width,
        baseImage.height
      );

      setOverlapSplitProgress('Uploading masks...');
      
      const infoA = await api.upload(maskABlob);
      const infoB = await api.upload(maskBBlob);

      setOverlapSplitProgress('Running Overlap Split...');

      const req = {
        base_image_id: baseImage.image_id,
        mask_a_asset_id: infoA.image_id,
        mask_b_asset_id: infoB.image_id,
        prompt_a: overlapPromptA,
        prompt_b: overlapPromptB,
        engine: overlapEngine,
        steps: overlapParams.steps,
        guidance_scale: overlapParams.guidance_scale,
        strength: overlapParams.strength
      };

      const data: OverlapSplitResponse = await api.overlapSplit(req);
      setOverlapSplitProgress('Finalizing...');

      // Add new layers
      const newLayers: Layer[] = data.layers.map((l: any, idx: number) => ({
        id: l.rgba_asset_id,
        asset_id: l.rgba_asset_id,
        asset_url: l.rgba_url,
        name: l.layer_name,
        x: l.bbox[0],
        y: l.bbox[1],
        scale_x: 1,
        scale_y: 1,
        rotation_deg: 0,
        opacity: 1,
        visible: true,
        locked: false,
        z_index: layers.length + 1 + idx,
        edge_cleanup_enabled: false,
        edge_cleanup_strength: 50,
        edge_cleanup_feather_px: 1,
        edge_cleanup_erode_px: 1,
      }));

      const updatedLayers = [...layers, ...newLayers];
      updateLayers(updatedLayers);

      if (newLayers.length > 0) {
        setSelectedLayerId(newLayers[newLayers.length - 1].id);
      }

      // Clear masks
      setOverlapMaskA({ box: null, points: [] });
      setOverlapMaskB({ box: null, points: [] });
      setOverlapPromptA('');
      setOverlapPromptB('');
      setActiveTool('select');

    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Unknown overlap split error');
    } finally {
      setIsOverlapSplitting(false);
      setOverlapSplitProgress('');
    }
  }, [baseImage, overlapMaskA, overlapMaskB, overlapPromptA, overlapPromptB, overlapEngine, overlapParams, layers, updateLayers]);

  const handleDecomposeArea = useCallback(async () => {
    if (!baseImage) {
      alert('No base image loaded');
      return;
    }
    if (!decomposeBox) {
      alert('No area selected');
      return;
    }

    setIsDecomposingArea(true);
    setDecomposeAreaProgress('Decomposing area...');

    try {
      const req = {
        base_image_id: baseImage.image_id,
        roi_box: decomposeBox.map(Math.round),
        steps: decomposeParams.steps,
        guidance_scale: decomposeParams.guidance_scale,
        seed: decomposeParams.seed === '' ? undefined : decomposeParams.seed,
        num_layers: decomposeParams.num_layers,
      };

      const data: DecomposeAreaResponse = await api.decomposeArea(req);
      setDecomposeAreaProgress('Finalizing...');

      const newLayers: Layer[] = data.layers.map((l: any, idx: number) => ({
        id: l.rgba_asset_id,
        asset_id: l.rgba_asset_id,
        asset_url: l.rgba_url,
        name: l.layer_name,
        x: l.bbox[0],
        y: l.bbox[1],
        scale_x: 1,
        scale_y: 1,
        rotation_deg: 0,
        opacity: 1,
        visible: true,
        locked: false,
        z_index: layers.length + 1 + idx,
        edge_cleanup_enabled: false,
        edge_cleanup_strength: 50,
        edge_cleanup_feather_px: 1,
        edge_cleanup_erode_px: 1,
      }));

      const updatedLayers = [...layers, ...newLayers];
      updateLayers(updatedLayers);

      if (newLayers.length > 0) {
        setSelectedLayerId(newLayers[newLayers.length - 1].id);
      }

      setDecomposeBox(null);
      setActiveTool('select');

    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Unknown decompose area error');
    } finally {
      setIsDecomposingArea(false);
      setDecomposeAreaProgress('');
    }
  }, [baseImage, decomposeBox, decomposeParams, layers, updateLayers]);

  const handleLayerUpdate = (id: string, updates: Partial<Layer>) => {
    const newLayers = layers.map(l => l.id === id ? { ...l, ...updates } : l);
    updateLayers(newLayers);
  };

  const handleLayerDelete = useCallback((id: string) => {
    const newLayers = layers.filter(l => l.id !== id);
    updateLayers(newLayers);
    if (selectedLayerId === id) setSelectedLayerId(null);
  }, [layers, selectedLayerId, updateLayers]);

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const data: any = await api.upload(file);
          setBaseImage(data);
          setBaseImageHistory([data]);
          setBaseImageHistoryIndex(0);
          setLayers([]);
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          if (attempt < 2) {
            await sleep(attempt === 0 ? 250 : attempt === 1 ? 900 : 2000);
            continue;
          }
        }
      }

      if (lastErr) {
        throw lastErr;
      }
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert(`Failed to upload image: ${msg}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await uploadFile(e.dataTransfer.files[0]);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'v') setActiveTool('select');
      if (e.key === 'h') setActiveTool('pan');
      if (e.key === 'z') setActiveTool('zoom');
      if (e.key === 's') setActiveTool('segment');
      if (e.key === 't') setActiveTool('text');
      if (e.key === 'o') setActiveTool('overlap');
      if (e.key === 'd') setActiveTool('decompose');
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedLayerId) {
            handleLayerDelete(selectedLayerId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, selectedLayerId, handleLayerDelete]);

  const [textPrompt, setTextPrompt] = useState<string>('');
  const [showTextPromptDialog, setShowTextPromptDialog] = useState(false);
  const [segmentationThreshold, setSegmentationThreshold] = useState(0.5);

  const handleToolChange = (tool: Tool) => {
    setActiveTool(tool);
    if (tool === 'text') {
        setShowTextPromptDialog(true);
    }
    // Clear ROI when switching away from ROI tool
    if (tool !== 'roi') {
        setRoiBox(null);
        setRoiPoints([]);
    }
    // Clear Overlap when switching away from Overlap tool
    if (tool !== 'overlap') {
        setOverlapMaskA({ box: null, points: [] });
        setOverlapMaskB({ box: null, points: [] });
    }
    // Clear Decompose Box when switching away
    if (tool !== 'decompose') {
        setDecomposeBox(null);
    }
  };

  const handleTextPromptSubmit = async () => {
    if (!textPrompt.trim()) return;
    setShowTextPromptDialog(false);

    if (!baseImage) return;

    setIsSegmenting(true);
    try {
        const data: SegmentResponse = await api.segment({
              image_id: baseImage.image_id,
              text_prompt: textPrompt,
              multimask_output: false,
              threshold: segmentationThreshold,
              edge_cleanup: {
                enabled: false,
                strength: 50,
                feather_px: 2,
                erode_px: 1,
              },
            });

        addLayerFromResponse(data);
        setActiveTool('select');
    } catch (err) {
        console.error(err);
        alert('Failed to segment with text');
    } finally {
        setIsSegmenting(false);
        setTextPrompt('');
    }
  };

  const addLayerFromResponse = (data: SegmentResponse) => {
      const newLayer: Layer = {
        id: data.object_asset_id,
        asset_id: data.object_asset_id,
        asset_url: data.object_url,
        mask_asset_id: data.mask_asset_id,
        edge_cleanup_enabled: false,
        edge_cleanup_strength: 50,
        edge_cleanup_feather_px: 2,
        edge_cleanup_erode_px: 1,
        x: data.bbox_xyxy[0],
        y: data.bbox_xyxy[1],
        scale_x: 1,
        scale_y: 1,
        rotation_deg: 0,
        opacity: 1,
        visible: true,
        locked: false,
        z_index: layers.length + 1,
      };

      const newLayers = [...layers, newLayer];
      updateLayers(newLayers);
      setSelectedLayerId(newLayer.id);
  };

  const handleSegment = async (x: number, y: number, box?: number[]) => {
    if (!baseImage || isSegmenting) return;

    const edgeCleanupSettings = selectedLayer ? {
      enabled: selectedLayer.edge_cleanup_enabled || false,
      strength: selectedLayer.edge_cleanup_strength || 50,
      feather_px: selectedLayer.edge_cleanup_feather_px || 2,
      erode_px: selectedLayer.edge_cleanup_erode_px || 1,
    } : {
      enabled: false,
      strength: 50,
      feather_px: 2,
      erode_px: 1,
    };

    setIsSegmenting(true);
    try {
      const data: SegmentResponse = await api.segment({
          image_id: baseImage.image_id,
          points: (!box) ? [{ x: Math.round(x), y: Math.round(y), label: 1 }] : [],
          box_xyxy: box?.map(Math.round),
          multimask_output: true,
          threshold: segmentationThreshold,
          edge_cleanup: edgeCleanupSettings,
        });

      addLayerFromResponse(data);
      setActiveTool('select'); // Auto-switch to select after segmentation
    } catch (err) {
      console.error(err);
      alert('Failed to segment object');
    } finally {
      setIsSegmenting(false);
    }
  };

  const handleSegmentAll = async () => {
    if (!baseImage || isSegmenting) return;

    setIsSegmenting(true);
    try {
      const data: SegmentAllResponse = await api.segmentAll({
          image_id: baseImage.image_id,
          edge_cleanup: {
            enabled: false,
            strength: 50,
            feather_px: 2,
            erode_px: 1,
          },
        });

      const newLayers: Layer[] = data.objects.map((obj: any, idx: number) => ({
        id: obj.object_asset_id,
        asset_id: obj.object_asset_id,
        asset_url: obj.object_url,
        mask_asset_id: obj.mask_asset_id,
        edge_cleanup_enabled: false,
        edge_cleanup_strength: 70,
        edge_cleanup_feather_px: 1,
        edge_cleanup_erode_px: 1,
        x: obj.bbox_xyxy[0],
        y: obj.bbox_xyxy[1],
        scale_x: 1,
        scale_y: 1,
        rotation_deg: 0,
        opacity: 1,
        visible: true,
        locked: false,
        z_index: layers.length + 1 + idx,
      }));

      const updatedLayers = [...layers, ...newLayers];
      updateLayers(updatedLayers);

      if (newLayers.length > 0) {
        alert(`Found ${newLayers.length} objects!`);
      } else {
        alert('No objects found.');
      }

      setActiveTool('select');
    } catch (err) {
      console.error(err);
      alert('Failed to run Segment All');
    } finally {
      setIsSegmenting(false);
    }
  };

  const handleExport = async () => {
    if (!baseImage) return;

    try {
      const exportLayers = layers.map((l) => ({
        layer_id: l.id,
        asset_id: l.asset_id,
        x: l.x,
        y: l.y,
        scale_x: l.scale_x,
        scale_y: l.scale_y,
        rotation_deg: l.rotation_deg,
        opacity: l.opacity,
        visible: l.visible,
        locked: l.locked,
        z_index: l.z_index,
        mask_asset_id: l.mask_asset_id,
      }));

      const data: ExportResponse = await api.export({
          base_image_id: baseImage.image_id,
          layers: exportLayers,
          include_base_image: exportIncludeBase,
        });

      // Trigger download
      window.open(data.zip_url, '_blank');
      setShowExportDialog(false);
    } catch (err) {
      console.error(err);
      alert('Export failed');
    }
  };

  const handleApplyEdgeCleanup = async () => {
    if (!selectedLayer) {
      alert('No layer selected');
      return;
    }

    if (!selectedLayer.edge_cleanup_enabled) {
      alert('Enable Object Edge Cleanup first');
      return;
    }

    setIsApplyingEdgeCleanup(true);
    try {
      const req: ObjectEdgeCleanupRequest = {
        object_asset_id: selectedLayer.asset_id,
        strength: selectedLayer.edge_cleanup_strength ?? 70,
        feather_px: selectedLayer.edge_cleanup_feather_px ?? 1,
        erode_px: selectedLayer.edge_cleanup_erode_px ?? 1,
      };

      const data: ObjectEdgeCleanupResponse = await api.edgeCleanup(req);

      handleLayerUpdate(selectedLayer.id, {
        asset_id: data.object_asset_id,
        asset_url: data.object_url,
        edge_cleanup_applied_asset_id: data.object_asset_id,
      });
    } catch (err) {
      console.error(err);
      alert('Failed to apply edge cleanup');
    } finally {
      setIsApplyingEdgeCleanup(false);
    }
  };

  const handleReloadModels = async () => {
    if (isReloadingModels) return;
    setIsReloadingModels(true);
    
    try {
      const data: any = await api.reloadModels();
      
      let msg = 'Models reloaded successfully.';
      if (data.vram_allocated_mb) {
        msg += ` VRAM: ${data.vram_allocated_mb}MB`;
      }
      alert(msg);
      
    } catch (err) {
      console.error(err);
      alert(`Error reloading models: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsReloadingModels(false);
    }
  };

  const handleLayerDecompose = async () => {
    if (!baseImage) {
      alert('Please load an image first');
      return;
    }

    setIsDecomposing(true);
    setDecomposeProgress('Initializing layer decomposition...');

    try {
      const request: LayerDecomposeRequest = {
        image_id: baseImage.image_id,
        preset: decomposePreset,
        ...(decomposeNumLayers !== '' && { num_layers: decomposeNumLayers }),
        ...(decomposeSeed !== '' && { seed: decomposeSeed }),
      };

      setDecomposeProgress('Analyzing image and decomposing layers...');

      const data: LayerDecomposeResponse = await api.layerDecompose(request);
      setDecomposeProgress('Creating layers from decomposition results...');

      const newLayers: Layer[] = data.layers.map((layer, idx) => ({
        id: layer.layer_id,
        asset_id: layer.png_rgba_asset_id,
        asset_url: layer.png_rgba_url,
        name: layer.suggested_name || `Layer ${idx + 1}`,
        x: 0,
        y: 0,
        scale_x: 1,
        scale_y: 1,
        rotation_deg: 0,
        opacity: 1,
        visible: true,
        locked: false,
        z_index: layers.length + 1 + idx,
        edge_cleanup_enabled: false,
        edge_cleanup_strength: 50,
        edge_cleanup_feather_px: 2,
        edge_cleanup_erode_px: 1,
      }));

      const updatedLayers = [...layers, ...newLayers];
      updateLayers(updatedLayers);

      if (newLayers.length > 0) {
        setSelectedLayerId(newLayers[newLayers.length - 1].id);
      }

      setDecomposeProgress('Completed!');

      setTimeout(() => {
        setShowLayerDecomposeDialog(false);
        setDecomposeProgress('');
      }, 500);
    } catch (err) {
      console.error(err);
      alert('Failed to decompose layers');
      setDecomposeProgress('');
    } finally {
      setIsDecomposing(false);
    }
  };

  return (
    <div 
      className="relative h-screen w-full bg-background text-foreground overflow-hidden selection:bg-primary/30"
      onDragEnter={handleDrag}
    >
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" 
           style={{ 
             backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', 
             backgroundSize: '24px 24px' 
           }} 
      />

      {/* Drag Drop Overlay */}
      {dragActive && (
        <div 
            className="absolute inset-0 z-50 bg-primary/10 backdrop-blur-sm border-4 border-primary/50 border-dashed flex items-center justify-center"
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
        >
            <div className="glass p-8 rounded-2xl text-center pointer-events-none animate-in zoom-in duration-300">
                <Upload className="h-12 w-12 text-primary mx-auto mb-4" />
                <p className="text-2xl font-bold text-primary mb-2">Drop image here</p>
                <p className="text-muted-foreground">to upload and start segmenting</p>
            </div>
        </div>
      )}
      
      {/* Hidden Drag Target */}
      <div 
         className="absolute inset-0 z-40 hidden"
         onDragEnter={handleDrag} 
         onDragLeave={handleDrag} 
         onDragOver={handleDrag} 
         onDrop={handleDrop}
         style={{ display: dragActive ? 'block' : 'none' }}
      />

      {/* Main Canvas Area */}
      <div className="absolute inset-0 z-0">
        <Canvas
            baseImageUrl={baseImage?.url || null}
            layers={layers}
            selectedLayerId={selectedLayerId}
            activeTool={activeTool}
            onLayerSelect={setSelectedLayerId}
            onLayerUpdate={handleLayerUpdate}
            onSegment={handleSegment}
            roiMode={activeTool === 'overlap' ? overlapMode : (activeTool === 'decompose' ? 'rect' : roiMode)}
            roiBox={activeTool === 'overlap' ? (overlapActiveMask === 'A' ? overlapMaskA.box : overlapMaskB.box) : (activeTool === 'decompose' ? decomposeBox : roiBox)}
            roiPoints={activeTool === 'overlap' ? (overlapActiveMask === 'A' ? overlapMaskA.points : overlapMaskB.points) : (activeTool === 'decompose' ? [] : roiPoints)}
            onRoiBoxChange={activeTool === 'overlap' ? (box) => {
                if (overlapActiveMask === 'A') setOverlapMaskA(prev => ({ ...prev, box }));
                else setOverlapMaskB(prev => ({ ...prev, box }));
            } : (activeTool === 'decompose' ? setDecomposeBox : setRoiBox)}
            onRoiPointsChange={activeTool === 'overlap' ? (points) => {
                if (overlapActiveMask === 'A') setOverlapMaskA(prev => ({ ...prev, points }));
                else setOverlapMaskB(prev => ({ ...prev, points }));
            } : (activeTool === 'decompose' ? () => {} : setRoiPoints)}
            roiHintMode={roiHintMode}
            onRoiHintPoint={handleRoiHintPoint}
            roiFgPoint={roiFgPoint}
            roiBgPoint={roiBgPoint}
            overlapMaskA={overlapMaskA}
            overlapMaskB={overlapMaskB}
            overlapActiveMask={overlapActiveMask}
        />
      </div>

      {/* Top Bar - Floating */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 w-full max-w-3xl px-4 pointer-events-none">
        <div className="pointer-events-auto">
            <TopBar
                onOpen={() => fileInputRef.current?.click()}
                onSave={() => {}}
                onExport={() => setShowExportDialog(true)}
                onLayerDecompose={() => setShowLayerDecomposeDialog(true)}
                onReloadModels={handleReloadModels}
                onUndo={undo}
                onRedo={redo}
                canUndo={canUndo}
                canRedo={canRedo}
                fileName={baseImage ? `image-${baseImage.image_id.slice(0,6)}` : undefined}
                isReloadingModels={isReloadingModels}
            />
        </div>
      </div>
      
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
        accept="image/png,image/jpeg"
      />

      {/* Left Toolbar - Floating */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-30 pointer-events-none">
        <div className="pointer-events-auto">
            <LeftToolbar
            activeTool={activeTool}
            onToolChange={handleToolChange}
            onSegmentAll={handleSegmentAll}
            />
        </div>
      </div>

      {/* Right Panel - Floating */}
      <div className="absolute right-4 top-4 bottom-4 w-80 z-30 pointer-events-none flex flex-col gap-4">
        <div className="pointer-events-auto flex-1 glass-panel rounded-xl overflow-hidden flex flex-col">
            {/* Panel Tabs */}
            <div className="flex items-center p-1 m-2 bg-black/20 rounded-lg">
                <button 
                    onClick={() => setRightPanelTab('layers')}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-1.5 text-sm font-medium rounded-md transition-all",
                        rightPanelTab === 'layers' ? "bg-primary/20 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    )}
                >
                    <Layers className="h-4 w-4" /> Layers
                </button>
                <button 
                    onClick={() => setRightPanelTab('properties')}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-1.5 text-sm font-medium rounded-md transition-all",
                        rightPanelTab === 'properties' ? "bg-primary/20 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    )}
                >
                    <Settings2 className="h-4 w-4" /> Properties
                </button>
            </div>

            {/* Panel Content */}
            <div className="flex-1 overflow-hidden relative flex flex-col">
                {activeTool === 'roi' ? (
                    <RoiPanel
                        roiMode={roiMode}
                        setRoiMode={setRoiMode}
                        onSplit={handleRoiSplit}
                        onClear={() => {
                            setRoiBox(null);
                            setRoiPoints([]);
                            setRoiFgPoint(null);
                            setRoiBgPoint(null);
                            setRoiPrompt('');
                        }}
                        isSplitting={isSplitting}
                        splitProgress={splitProgress}
                        engine={roiEngine}
                        setEngine={setRoiEngine}
                        hasRoi={!!(roiMode === 'rect' ? roiBox : roiPoints.length >= 3)}
                        params={roiParams}
                        setParams={setRoiParams}
                        hintMode={roiHintMode}
                        setHintMode={setRoiHintMode}
                        hintPoints={{ fg: roiFgPoint, bg: roiBgPoint }}
                        onClearHint={(type) => type === 'fg' ? setRoiFgPoint(null) : setRoiBgPoint(null)}
                        prompt={roiPrompt}
                        setPrompt={setRoiPrompt}
                    />
                ) : activeTool === 'overlap' ? (
                    <OverlapPanel
                        roiMode={overlapMode}
                        setRoiMode={setOverlapMode}
                        activeMask={overlapActiveMask}
                        setActiveMask={setOverlapActiveMask}
                        maskA={overlapMaskA}
                        maskB={overlapMaskB}
                        onClearMask={(mask) => {
                            if (mask === 'A') setOverlapMaskA({ box: null, points: [] });
                            else setOverlapMaskB({ box: null, points: [] });
                        }}
                        promptA={overlapPromptA}
                        setPromptA={setOverlapPromptA}
                        promptB={overlapPromptB}
                        setPromptB={setOverlapPromptB}
                        onSplit={handleOverlapSplit}
                        isSplitting={isOverlapSplitting}
                        splitProgress={overlapSplitProgress}
                        engine={overlapEngine}
                        setEngine={setOverlapEngine}
                        params={overlapParams}
                        setParams={setOverlapParams}
                    />
                ) : activeTool === 'decompose' ? (
                    <DecomposePanel
                        onDecompose={handleDecomposeArea}
                        onClear={() => setDecomposeBox(null)}
                        isDecomposing={isDecomposingArea}
                        decomposeProgress={decomposeAreaProgress}
                        hasBox={!!decomposeBox}
                        params={decomposeParams}
                        setParams={setDecomposeParams}
                    />
                ) : rightPanelTab === 'layers' ? (
                    <LayerList
                        layers={layers}
                        selectedLayerId={selectedLayerId}
                        onLayerSelect={setSelectedLayerId}
                        onLayerVisibilityToggle={(id) => {
                            const l = layers.find(x => x.id === id);
                            if (l) handleLayerUpdate(id, { visible: !l.visible });
                        }}
                        onLayerLockToggle={(id) => {
                            const l = layers.find(x => x.id === id);
                            if (l) handleLayerUpdate(id, { locked: !l.locked });
                        }}
                        onLayerDelete={handleLayerDelete}
                    />
                ) : (
                    <Properties
                        selectedLayer={selectedLayer}
                        onUpdate={(updates) => selectedLayerId && handleLayerUpdate(selectedLayerId, updates)}
                        onApplyEdgeCleanup={handleApplyEdgeCleanup}
                        isApplyingEdgeCleanup={isApplyingEdgeCleanup}
                    />
                )}
            </div>
        </div>
      </div>

      {/* Loading Indicator */}
      {(isUploading || isSegmenting) && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 glass px-6 py-3 rounded-full flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm font-medium">
                {isUploading ? 'Uploading image...' : 'Running SAM3 segmentation...'}
            </span>
            </div>
      )}
      
      {/* Threshold Control - Floating Panel */}
      {['segment', 'box', 'text'].includes(activeTool) && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 glass p-4 rounded-xl w-72 flex flex-col gap-3 animate-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center text-sm font-medium">
                <span className="flex items-center gap-2 text-muted-foreground"><Sliders className="h-4 w-4"/> Confidence Threshold</span>
                <span className="text-primary">{Math.round(segmentationThreshold * 100)}%</span>
            </div>
            <Slider
                defaultValue={[segmentationThreshold]}
                max={1}
                step={0.01}
                onValueChange={(val) => setSegmentationThreshold(val[0])}
                className="py-2"
            />
            </div>
      )}

      <Dialog open={showTextPromptDialog} onOpenChange={setShowTextPromptDialog}>
        <DialogContent className="glass-panel border-white/10 text-foreground">
          <DialogHeader>
            <DialogTitle>Text Segmentation</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Describe the object you want to segment (e.g., "the blue cell", "nucleus").
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
             <Input 
                placeholder="Enter text prompt..." 
                value={textPrompt}
                onChange={(e) => setTextPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTextPromptSubmit()}
                autoFocus
                className="bg-black/20 border-white/10 focus:border-primary/50"
             />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowTextPromptDialog(false)}>Cancel</Button>
            <Button onClick={handleTextPromptSubmit} className="bg-primary hover:bg-primary/90">Segment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="glass-panel border-white/10 text-foreground">
          <DialogHeader>
            <DialogTitle>Export Project</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Download your composition as a ZIP file containing the full image and individual layers.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 py-4 p-1">
             <input
                type="checkbox"
                id="incBase"
                checked={exportIncludeBase}
                onChange={e => setExportIncludeBase(e.target.checked)}
                className="h-5 w-5 rounded border-white/20 bg-black/20 text-primary focus:ring-primary/50"
             />
             <label htmlFor="incBase" className="text-sm font-medium cursor-pointer">Include base image in composition</label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowExportDialog(false)}>Cancel</Button>
            <Button onClick={handleExport} className="bg-primary hover:bg-primary/90">Download ZIP</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLayerDecomposeDialog} onOpenChange={setShowLayerDecomposeDialog}>
        <DialogContent className="glass-panel border-white/10 text-foreground">
          <DialogHeader>
            <DialogTitle>Auto Layer Decompose (Qwen)</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Automatically decompose the image into layers using AI.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="preset">Preset</Label>
              <select
                id="preset"
                value={decomposePreset}
                onChange={(e) => setDecomposePreset(e.target.value as 'fast' | 'balanced' | 'best')}
                disabled={isDecomposing}
                className="w-full bg-black/20 border border-white/10 focus:border-primary/50 rounded-md px-3 py-2 text-sm text-foreground outline-none"
              >
                <option value="fast">Fast</option>
                <option value="balanced">Balanced</option>
                <option value="best">Best</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="numLayers">Number of Layers (optional)</Label>
              <Input
                id="numLayers"
                type="number"
                min="1"
                placeholder="Auto"
                value={decomposeNumLayers}
                onChange={(e) => setDecomposeNumLayers(e.target.value ? parseInt(e.target.value) : '')}
                disabled={isDecomposing}
                className="bg-black/20 border-white/10 focus:border-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="seed">Seed (optional)</Label>
              <Input
                id="seed"
                type="number"
                min="0"
                placeholder="Random"
                value={decomposeSeed}
                onChange={(e) => setDecomposeSeed(e.target.value ? parseInt(e.target.value) : '')}
                disabled={isDecomposing}
                className="bg-black/20 border-white/10 focus:border-primary/50"
              />
            </div>
            {isDecomposing && (
              <div className="flex items-center gap-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>{decomposeProgress}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowLayerDecomposeDialog(false)} disabled={isDecomposing}>
              Cancel
            </Button>
            <Button onClick={handleLayerDecompose} disabled={isDecomposing} className="bg-primary hover:bg-primary/90">
              {isDecomposing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default App;

