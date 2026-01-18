import { useState, useRef, useCallback, useEffect } from 'react';
import { LeftToolbar } from '@/components/LeftToolbar';
import { TopBar } from '@/components/TopBar';
import { LayerList } from '@/components/LayerList';
import { Properties } from '@/components/Properties';
import { Canvas } from '@/components/Canvas';
import { Layer, ImageInfo, SegmentResponse, LayerDecomposeRequest, LayerDecomposeResponse, Tool, ObjectEdgeCleanupRequest, ObjectEdgeCleanupResponse, ObjectRestoreRequest, ObjectRestoreResponse } from '@/types';
import { API_BASE_URL } from '@/config';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Sliders, Upload, Layers, Settings2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

function App() {
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [baseImage, setBaseImage] = useState<ImageInfo | null>(null);
  const [_baseImageHistory, setBaseImageHistory] = useState<ImageInfo[]>([]);
  const [_baseImageHistoryIndex, setBaseImageHistoryIndex] = useState(-1);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [history, setHistory] = useState<Layer[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isUploading, setIsUploading] = useState(false);
  const [isSegmenting, setIsSegmenting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<string>('');
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

  const selectedLayer = layers.find(l => l.id === selectedLayerId) || null;

  // Auto-switch to properties when a layer is selected
  useEffect(() => {
    if (selectedLayerId) {
      setRightPanelTab('properties');
    }
  }, [selectedLayerId]);

  const pushHistory = useCallback((newLayers: Layer[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newLayers);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const updateLayers = (newLayers: Layer[]) => {
    setLayers(newLayers);
    pushHistory(newLayers);
  };

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1);
      setLayers(history[historyIndex - 1]);
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(prev => prev + 1);
      setLayers(history[historyIndex + 1]);
    }
  }, [history, historyIndex]);

  const handleLayerUpdate = (id: string, updates: Partial<Layer>) => {
    const newLayers = layers.map(l => l.id === id ? { ...l, ...updates } : l);
    updateLayers(newLayers);
  };

  const handleLayerDelete = useCallback((id: string) => {
    const newLayers = layers.filter(l => l.id !== id);
    updateLayers(newLayers);
    if (selectedLayerId === id) setSelectedLayerId(null);
  }, [layers, selectedLayerId]);

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const buildFormData = () => {
      const fd = new FormData();
      fd.append('file', file);
      return fd;
    };

    try {
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch(`${API_BASE_URL}/upload`, {
            method: 'POST',
            body: buildFormData(),
          });

          if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`Upload failed (${res.status}): ${body || res.statusText}`);
          }

          const data: ImageInfo = await res.json();
          setBaseImage(data);
          setBaseImageHistory([data]);
          setBaseImageHistoryIndex(0);
          setLayers([]);
          setHistory([[]]);
          setHistoryIndex(0);
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
      const hint = msg.includes('NetworkError') || msg.includes('Failed to fetch')
        ? `\n\nCheck backend is reachable at: ${API_BASE_URL}`
        : '';
      alert(`Failed to upload image: ${msg}${hint}`);
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
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedLayerId) {
            handleLayerDelete(selectedLayerId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, selectedLayerId, handleLayerDelete]);

  const [textPrompt, setTextPrompt] = useState<string>('');
  const [showTextPromptDialog, setShowTextPromptDialog] = useState(false);
  const [segmentationThreshold, setSegmentationThreshold] = useState(0.5);

  const handleToolChange = (tool: Tool) => {
    setActiveTool(tool);
    if (tool === 'text') {
        setShowTextPromptDialog(true);
    }
  };

  const handleTextPromptSubmit = async () => {
    if (!textPrompt.trim()) return;
    setShowTextPromptDialog(false);

    // Trigger segmentation with text
    if (!baseImage) return;

    setIsSegmenting(true);
    try {
        const res = await fetch(`${API_BASE_URL}/segment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image_id: baseImage.image_id,
              text_prompt: textPrompt,
              multimask_output: false, // Text usually returns 1 mask
              threshold: segmentationThreshold,
              edge_cleanup: {
                enabled: false,
                strength: 50,
                feather_px: 2,
                erode_px: 1,
              },
            }),
        });

        if (!res.ok) throw new Error('Segmentation failed');
        const data: SegmentResponse = await res.json();

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
      const res = await fetch(`${API_BASE_URL}/segment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_id: baseImage.image_id,
          points: (!box) ? [{ x, y, label: 1 }] : [],
          box_xyxy: box,
          multimask_output: true,
          threshold: segmentationThreshold,
          edge_cleanup: edgeCleanupSettings,
        }),
      });

      if (!res.ok) throw new Error('Segmentation failed');
      const data: SegmentResponse = await res.json();

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
      const res = await fetch(`${API_BASE_URL}/segment-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_id: baseImage.image_id,
          edge_cleanup: {
            enabled: false,
            strength: 50,
            feather_px: 2,
            erode_px: 1,
          },
        }),
      });

      if (!res.ok) throw new Error('Segment All failed');
      const data = await res.json();

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

      const res = await fetch(`${API_BASE_URL}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_image_id: baseImage.image_id,
          layers: exportLayers,
          include_base_image: exportIncludeBase,
        }),
      });

      if (!res.ok) throw new Error('Export failed');
      const data = await res.json();

      // Trigger download
      window.open(data.zip_url, '_blank');
      setShowExportDialog(false);
    } catch (err) {
      console.error(err);
      alert('Export failed');
    }
  };

  const handleRestore = async (settings: { engine: string; prompt?: string; params?: any }) => {
    if (!selectedLayer) {
      alert('No layer selected');
      return;
    }

    setIsRestoring(true);
    setRestoreProgress('Loading model...');

    try {
      const req: ObjectRestoreRequest = {
        layer_id: selectedLayer.id,
        engine: settings.engine,
        prompt: settings.prompt,
        params: settings.params,
      };

      await new Promise(resolve => setTimeout(resolve, 0));
      setRestoreProgress('Restoring object...');

      const res = await fetch(`${API_BASE_URL}/restore_object`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Object restore failed (${res.status}): ${body || res.statusText}`);
      }

      setRestoreProgress('Finalizing...');
      const data: ObjectRestoreResponse = await res.json();

      handleLayerUpdate(selectedLayer.id, {
        asset_id: data.restored_layer_asset_id,
        asset_url: data.preview_url,
      });

      if (data.metadata?.runtime_ms != null) {
        setRestoreProgress(`Done (runtime: ${data.metadata.runtime_ms}ms${data.metadata.cached ? ', cached' : ''})`);
      } else {
        setRestoreProgress('Done');
      }

      setTimeout(() => setRestoreProgress(''), 1500);
    } catch (err) {
      console.error(err);
      setRestoreProgress('');
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert(`Failed to restore occluded parts of object: ${msg}`);
    } finally {
      setIsRestoring(false);
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

      const res = await fetch(`${API_BASE_URL}/object_edge_cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });

      if (!res.ok) throw new Error('Object edge cleanup failed');
      const data: ObjectEdgeCleanupResponse = await res.json();

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
      const res = await fetch(`${API_BASE_URL}/reload_models`, {
        method: 'POST',
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to reload models');
      }
      
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

      const res = await fetch(`${API_BASE_URL}/layer_decompose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!res.ok) throw new Error('Layer decomposition failed');

      const data: LayerDecomposeResponse = await res.json();
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
                onUndo={handleUndo}
                onRedo={handleRedo}
                canUndo={historyIndex > 0}
                canRedo={historyIndex < history.length - 1}
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
                {rightPanelTab === 'layers' ? (
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
                        onRestore={handleRestore}
                        isRestoring={isRestoring}
                        restoreProgress={restoreProgress}
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
