import { useState } from 'react';
import { Layer } from '@/types';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Move, Maximize, RotateCw, Eye, Lock, RefreshCw, Scissors, ChevronRight, ChevronDown } from 'lucide-react';

interface PropertiesProps {
  selectedLayer: Layer | null;
  onUpdate: (updates: Partial<Layer>) => void;
  onApplyEdgeCleanup: () => void;
  onRestore: (settings: { engine: string; prompt?: string; params?: any }) => void;
  isRestoring: boolean;
  restoreProgress: string;
  isApplyingEdgeCleanup: boolean;
}

export function Properties({ selectedLayer, onUpdate, onApplyEdgeCleanup, onRestore, isRestoring, restoreProgress, isApplyingEdgeCleanup }: PropertiesProps) {
  const [engine, setEngine] = useState<'sd15_inpaint' | 'kandinsky22_inpaint' | 'sdxl_inpaint'>('sd15_inpaint');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [prompt, setPrompt] = useState('clean flat scientific diagram, solid colors, sharp edges, no text, no extra symbols');
  const [steps, setSteps] = useState(30);
  const [guidanceScale, setGuidanceScale] = useState(7.5);
  const [seed, setSeed] = useState<number | ''>('');
  const [resizeLongEdge, setResizeLongEdge] = useState(1024);

  if (!selectedLayer) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/50 p-6 text-center">
        <div className="h-12 w-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
            <Maximize className="h-6 w-6 opacity-50" />
        </div>
        <span className="text-sm font-medium">No layer selected</span>
        <span className="text-xs mt-1">Select a layer to edit properties</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">Layer Properties</span>
                <span className="text-xs text-muted-foreground">ID: {selectedLayer.id.slice(0, 8)}</span>
            </div>
            <div className="h-8 w-8 rounded overflow-hidden bg-black/40 border border-white/10">
                 <img src={selectedLayer.asset_url} alt="" className="h-full w-full object-contain" />
            </div>
        </div>

        {/* Toggles */}
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
             <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <Label className="cursor-pointer">Visible</Label>
             </div>
             <Switch 
                checked={selectedLayer.visible} 
                onCheckedChange={(v) => onUpdate({ visible: v })}
             />
          </div>
           <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
             <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <Label className="cursor-pointer">Locked</Label>
             </div>
             <Switch 
                checked={selectedLayer.locked} 
                onCheckedChange={(v) => onUpdate({ locked: v })}
             />
          </div>
        </div>

        {/* Opacity */}
        <div className="space-y-3">
            <div className="flex justify-between">
                <Label>Opacity</Label>
                <span className="text-xs text-muted-foreground">{Math.round(selectedLayer.opacity * 100)}%</span>
            </div>
            <Slider
              value={[selectedLayer.opacity * 100]}
              min={0}
              max={100}
              step={1}
              onValueChange={(v) => onUpdate({ opacity: v[0] / 100 })}
            />
        </div>

         <div className="space-y-4 pt-2">
             <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Object Edge Cleanup</Label>
             <div className="text-xs text-muted-foreground">
               Removes white halos or color fringes around the extracted object.
             </div>
              <div className="text-xs text-muted-foreground">
                Changes will apply when you click the button below.
              </div>
              <div className="text-xs text-amber-500/90 font-medium tracking-wide">
                Applies only to the selected object layer.
              </div>

 
             <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                <div className="flex items-center gap-2">
                   <RefreshCw className="h-4 w-4 text-muted-foreground" />
                   <Label className="cursor-pointer">Enabled</Label>
                </div>
                <Switch
                  checked={selectedLayer.edge_cleanup_enabled || false}
                  onCheckedChange={(v) => onUpdate({ edge_cleanup_enabled: v })}
                />
            </div>
 
            {selectedLayer.edge_cleanup_enabled && (
                <>
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <Label className="text-xs">Strength</Label>
                            <span className="text-xs text-muted-foreground">{selectedLayer.edge_cleanup_strength ?? 70}%</span>
                        </div>
                        <Slider
                          value={[selectedLayer.edge_cleanup_strength ?? 70]}
                          min={0}
                          max={100}
                          step={1}
                          onValueChange={(v) => onUpdate({ edge_cleanup_strength: v[0] })}
                        />
                    </div>
 
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <Label className="text-xs">Feather</Label>
                            <span className="text-xs text-muted-foreground">{selectedLayer.edge_cleanup_feather_px ?? 1}px</span>
                        </div>
                        <Slider
                          value={[selectedLayer.edge_cleanup_feather_px ?? 1]}
                          min={0}
                          max={6}
                          step={1}
                          onValueChange={(v) => onUpdate({ edge_cleanup_feather_px: v[0] })}
                        />
                    </div>
 
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <Label className="text-xs">Erode</Label>
                            <span className="text-xs text-muted-foreground">{selectedLayer.edge_cleanup_erode_px ?? 1}px</span>
                        </div>
                        <Slider
                          value={[selectedLayer.edge_cleanup_erode_px ?? 1]}
                          min={0}
                          max={6}
                          step={1}
                          onValueChange={(v) => onUpdate({ edge_cleanup_erode_px: v[0] })}
                        />
                    </div>

                    <Button
                      onClick={onApplyEdgeCleanup}
                      disabled={isApplyingEdgeCleanup}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-md border border-emerald-500/20 transition-all hover:scale-[1.01]"
                    >
                      {isApplyingEdgeCleanup ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Applying...
                        </>
                      ) : (
                        <>
                          <Scissors className="h-4 w-4 mr-2" />
                          Apply Edge Trimming
                        </>
                      )}
                    </Button>
                </>
            )}
         </div>


         <div className="space-y-4 pt-2">
             <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Object Restoration</Label>
             <div className="text-xs text-muted-foreground">
               Restores missing parts of the object (e.g. occlusion).
             </div>
             <div className="text-xs text-amber-500/90 font-medium tracking-wide">
               Modifies selected object layer only. Does not affect base image.
             </div>

             <div className="space-y-3">
                 <div className="space-y-1.5">
                     <Label className="text-xs">Model Engine</Label>
                     <select 
                        value={engine}
                        onChange={(e) => setEngine(e.target.value as typeof engine)}
                        className="w-full bg-black/20 border border-white/10 rounded-md px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
                     >
                         <option value="sd15_inpaint">SD v1.5 Inpaint — Quality: Good / Speed: Fast</option>
                         <option value="kandinsky22_inpaint">Kandinsky 2.2 — Quality: Good / Speed: Medium</option>
                         <option value="sdxl_inpaint">SDXL Inpaint — Quality: Very good / Speed: Slow</option>
                     </select>

                 </div>

                 <div className="space-y-1.5">
                     <Label className="text-xs">Prompt (Optional)</Label>
                     <Input 
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Describe the object..."
                        className="bg-black/20 border-white/10 h-7 text-xs"
                     />
                 </div>

                 <div className="pt-1">
                    <button 
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        Advanced Settings
                    </button>
                    
                    {showAdvanced && (
                        <div className="space-y-3 pt-3 pl-2 border-l border-white/10 ml-1.5 mt-1">
                            <div className="space-y-1">
                                <div className="flex justify-between">
                                    <Label className="text-[10px]">Steps</Label>
                                    <span className="text-[10px] text-muted-foreground">{steps}</span>
                                </div>
                                <Slider
                                    value={[steps]}
                                    min={10}
                                    max={100}
                                    step={1}
                                    onValueChange={(v) => setSteps(v[0])}
                                    className="py-1"
                                />
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between">
                                    <Label className="text-[10px]">Guidance Scale</Label>
                                    <span className="text-[10px] text-muted-foreground">{guidanceScale}</span>
                                </div>
                                <Slider
                                    value={[guidanceScale]}
                                    min={1}
                                    max={20}
                                    step={0.5}
                                    onValueChange={(v) => setGuidanceScale(v[0])}
                                    className="py-1"
                                />
                            </div>
                             <div className="space-y-1">
                                 <Label className="text-[10px]">Seed</Label>
                                 <Input 
                                     type="number" 
                                     placeholder="Random"
                                     value={seed}
                                     onChange={(e) => setSeed(e.target.value ? parseInt(e.target.value) : '')}
                                     className="bg-black/20 border-white/10 h-6 text-[10px]"
                                 />
                             </div>
                             <div className="space-y-1">
                                 <Label className="text-[10px]">Resize Long Edge</Label>
                                 <Input 
                                     type="number" 
                                     value={resizeLongEdge}
                                     onChange={(e) => setResizeLongEdge(parseInt(e.target.value))}
                                     className="bg-black/20 border-white/10 h-6 text-[10px]"
                                 />
                             </div>
                        </div>
                    )}
                 </div>

                 <Button
                    onClick={() => onRestore({
                        engine,
                        prompt: prompt || undefined,
                        params: {
                            steps,
                            guidance_scale: guidanceScale,
                            seed: seed === '' ? undefined : seed,
                            resize_long_edge: resizeLongEdge
                        }
                    })}
                    disabled={isRestoring}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-md border border-indigo-500/20"
                 >
                    {isRestoring ? (
                        <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            Restoring...
                        </>
                    ) : (
                        <>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Restore occluded parts
                        </>
                    )}
                 </Button>

                 {isRestoring && restoreProgress ? (
                   <div className="text-xs text-muted-foreground pt-1">
                     {restoreProgress}
                   </div>
                 ) : null}
            </div>
         </div>


        <div className="space-y-4 pt-2">
            <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Transform</Label>

            
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1 text-muted-foreground"><Move className="h-3 w-3" /> Position X</Label>
                    <Input 
                        type="number" 
                        value={Math.round(selectedLayer.x)} 
                        onChange={(e) => onUpdate({ x: parseFloat(e.target.value) })}
                        className="bg-black/20 border-white/10 h-8 text-sm"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1 text-muted-foreground"><Move className="h-3 w-3 rotate-90" /> Position Y</Label>
                    <Input 
                        type="number" 
                        value={Math.round(selectedLayer.y)} 
                        onChange={(e) => onUpdate({ y: parseFloat(e.target.value) })}
                        className="bg-black/20 border-white/10 h-8 text-sm"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1 text-muted-foreground"><Maximize className="h-3 w-3" /> Scale</Label>
                    <Input 
                        type="number" 
                        step="0.1"
                        value={selectedLayer.scale_x} 
                        onChange={(e) => onUpdate({ scale_x: parseFloat(e.target.value), scale_y: parseFloat(e.target.value) })}
                        className="bg-black/20 border-white/10 h-8 text-sm"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1 text-muted-foreground"><RotateCw className="h-3 w-3" /> Rotation</Label>
                    <Input 
                        type="number" 
                        value={Math.round(selectedLayer.rotation_deg)} 
                        onChange={(e) => onUpdate({ rotation_deg: parseFloat(e.target.value) })}
                        className="bg-black/20 border-white/10 h-8 text-sm"
                    />
                </div>
            </div>
        </div>
    </div>
  );
}
