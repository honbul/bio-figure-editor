import { Layer } from '@/types';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Move, Maximize, RotateCw, Eye, Lock, RefreshCw, Scissors } from 'lucide-react';

interface PropertiesProps {
  selectedLayer: Layer | null;
  onUpdate: (updates: Partial<Layer>) => void;
  onApplyEdgeCleanup: () => void;
  isApplyingEdgeCleanup: boolean;
}

export function Properties({ selectedLayer, onUpdate, onApplyEdgeCleanup, isApplyingEdgeCleanup }: PropertiesProps) {
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
