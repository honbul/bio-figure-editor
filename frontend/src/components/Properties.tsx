import { Layer } from '@/types';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Move, Maximize, RotateCw, Eye, Lock, RefreshCw, Shield } from 'lucide-react';

interface PropertiesProps {
  selectedLayer: Layer | null;
  onUpdate: (updates: Partial<Layer>) => void;
  onRestore: (protectOtherLayers: boolean) => void;
  isRestoring: boolean;
}

export function Properties({ selectedLayer, onUpdate, onRestore, isRestoring }: PropertiesProps) {
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
    <div className="flex flex-col flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
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

        {/* Edge Cleanup */}
        <div className="space-y-4 pt-2">
            <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Edge Cleanup</Label>

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
                           <span className="text-xs text-muted-foreground">{selectedLayer.edge_cleanup_strength || 50}%</span>
                       </div>
                       <Slider
                         value={[selectedLayer.edge_cleanup_strength || 50]}
                         min={0}
                         max={100}
                         step={1}
                         onValueChange={(v) => onUpdate({ edge_cleanup_strength: v[0] })}
                       />
                   </div>

                   <div className="space-y-2">
                       <div className="flex justify-between">
                           <Label className="text-xs">Feather</Label>
                           <span className="text-xs text-muted-foreground">{selectedLayer.edge_cleanup_feather_px || 2}px</span>
                       </div>
                       <Slider
                         value={[selectedLayer.edge_cleanup_feather_px || 2]}
                         min={0}
                         max={6}
                         step={1}
                         onValueChange={(v) => onUpdate({ edge_cleanup_feather_px: v[0] })}
                       />
                   </div>

                   <div className="space-y-2">
                       <div className="flex justify-between">
                           <Label className="text-xs">Erode</Label>
                           <span className="text-xs text-muted-foreground">{selectedLayer.edge_cleanup_erode_px || 1}px</span>
                       </div>
                       <Slider
                         value={[selectedLayer.edge_cleanup_erode_px || 1]}
                         min={0}
                         max={6}
                         step={1}
                         onValueChange={(v) => onUpdate({ edge_cleanup_erode_px: v[0] })}
                       />
                   </div>
               </>
           )}
        </div>

        {/* Restore */}
        <div className="space-y-4 pt-2">
            <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Restore Area</Label>

            <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                   <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      <Label htmlFor="protect-other" className="cursor-pointer">Protect other layers</Label>
                   </div>
                   <Switch
                     id="protect-other"
                     checked={selectedLayer.protect_other_layers || false}
                     onCheckedChange={(v) => onUpdate({ protect_other_layers: v })}
                   />
               </div>

               <Button
                   onClick={() => onRestore(selectedLayer.protect_other_layers || false)}
                   disabled={isRestoring || !selectedLayer.mask_asset_id}
                   className="w-full bg-primary/90 hover:bg-primary text-white"
               >
                   {isRestoring ? (
                       <>
                           <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                           Restoring...
                       </>
                   ) : (
                       <>
                           <RefreshCw className="h-4 w-4 mr-2" />
                           Restore underlying area
                       </>
                   )}
               </Button>
           </div>
        </div>

        {/* Transform */}
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
