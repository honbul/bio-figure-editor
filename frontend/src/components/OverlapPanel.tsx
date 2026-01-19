import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Layers, Play, Square, Hexagon, MousePointer2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OverlapPanelProps {
  roiMode: 'rect' | 'poly';
  setRoiMode: (mode: 'rect' | 'poly') => void;
  activeMask: 'A' | 'B';
  setActiveMask: (mask: 'A' | 'B') => void;
  maskA: { box: [number, number, number, number] | null; points: {x: number, y: number}[] };
  maskB: { box: [number, number, number, number] | null; points: {x: number, y: number}[] };
  onClearMask: (mask: 'A' | 'B') => void;
  promptA: string;
  setPromptA: (s: string) => void;
  promptB: string;
  setPromptB: (s: string) => void;
  
  onSplit: () => void;
  isSplitting: boolean;
  splitProgress: string;
  
  engine: string;
  setEngine: (engine: string) => void;
  params: Record<string, any>;
  setParams: (params: Record<string, any>) => void;
}

export function OverlapPanel({
  roiMode,
  setRoiMode,
  activeMask,
  setActiveMask,
  maskA,
  maskB,
  onClearMask,
  promptA,
  setPromptA,
  promptB,
  setPromptB,
  onSplit,
  isSplitting,
  splitProgress,
  engine,
  setEngine,
  params,
  setParams
}: OverlapPanelProps) {
    
  const hasMaskA = !!(maskA.box || maskA.points.length >= 3);
  const hasMaskB = !!(maskB.box || maskB.points.length >= 3);
  const canSplit = hasMaskA && hasMaskB;

  return (
    <div className="flex flex-col flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/10">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-foreground">Overlap Split</span>
          <span className="text-xs text-muted-foreground">Resolve overlapping objects</span>
        </div>
        <div className="h-8 w-8 rounded bg-primary/20 flex items-center justify-center text-primary">
          <Layers className="h-4 w-4" />
        </div>
      </div>

      {/* Mode Selection */}
      <div className="space-y-3">
        <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Selection Tool</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRoiMode('rect')}
            className={cn(
              "justify-start border-white/10 hover:bg-white/5",
              roiMode === 'rect' && "bg-primary/20 border-primary/50 text-primary hover:bg-primary/25"
            )}
          >
            <Square className="h-4 w-4 mr-2" />
            Rectangle
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRoiMode('poly')}
            className={cn(
              "justify-start border-white/10 hover:bg-white/5",
              roiMode === 'poly' && "bg-primary/20 border-primary/50 text-primary hover:bg-primary/25"
            )}
          >
            <Hexagon className="h-4 w-4 mr-2" />
            Polygon
          </Button>
        </div>
      </div>

      {/* Mask A Control */}
      <div className="space-y-3 p-3 rounded-lg border border-white/10 bg-black/20">
         <div className="flex items-center justify-between">
            <div className="flex flex-col">
                <Label className="text-sm font-medium text-blue-400">Mask A (To Restore)</Label>
                <span className="text-[10px] text-muted-foreground">Primary object (will be completed)</span>
            </div>
            {hasMaskA && (
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => onClearMask('A')}>
                    <X className="h-3 w-3" />
                </Button>
            )}
         </div>
         <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setActiveMask('A')}
            className={cn(
                "w-full justify-start border-white/10",
                activeMask === 'A' ? "bg-blue-500/20 border-blue-500/50 text-blue-400" : "hover:bg-white/5"
            )}
         >
            <MousePointer2 className="h-4 w-4 mr-2" />
            {activeMask === 'A' ? "Drawing Mask A..." : (hasMaskA ? "Edit Mask A" : "Draw Mask A")}
         </Button>
         <Input
           placeholder="Prompt for A (e.g. 'blue cell')"
           value={promptA}
           onChange={(e) => setPromptA(e.target.value)}
           className="bg-black/20 border-white/10 focus:border-blue-500/50 text-xs h-8"
         />
      </div>

      {/* Mask B Control */}
      <div className="space-y-3 p-3 rounded-lg border border-white/10 bg-black/20">
         <div className="flex items-center justify-between">
            <div className="flex flex-col">
                <Label className="text-sm font-medium text-orange-400">Mask B (Occluder)</Label>
                <span className="text-[10px] text-muted-foreground">Top object (preserved as-is)</span>
            </div>
            {hasMaskB && (
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => onClearMask('B')}>
                    <X className="h-3 w-3" />
                </Button>
            )}
         </div>
         <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setActiveMask('B')}
            className={cn(
                "w-full justify-start border-white/10",
                activeMask === 'B' ? "bg-orange-500/20 border-orange-500/50 text-orange-400" : "hover:bg-white/5"
            )}
         >
            <MousePointer2 className="h-4 w-4 mr-2" />
            {activeMask === 'B' ? "Drawing Mask B..." : (hasMaskB ? "Edit Mask B" : "Draw Mask B")}
         </Button>
         <Input
           placeholder="Prompt for B (optional)"
           value={promptB}
           onChange={(e) => setPromptB(e.target.value)}
           className="bg-black/20 border-white/10 focus:border-orange-500/50 text-xs h-8"
         />
      </div>

      {/* Helper Text */}
      <div className="p-3 bg-white/5 rounded text-xs text-muted-foreground space-y-1">
        <p>• <strong>Mask A</strong> will be reconstructed in the overlap region.</p>
        <p>• <strong>Mask B</strong> will be kept exactly as it is.</p>
        <p className="text-white/50 italic">Tip: For text over shapes, set Shape as A and Text as B.</p>
      </div>

      {/* Engine Selection */}
      <div className="space-y-3">
        <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Engine</Label>
        <div className="w-full">
          <select
            value={engine}
            onChange={(e) => setEngine(e.target.value)}
            className={cn(
              "w-full h-10 rounded-md px-3 text-sm",
              "bg-black/20 border border-white/10",
              "text-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40",
              "disabled:opacity-50"
            )}
          >
            <option value="sdxl_inpaint">SDXL (High Quality)</option>
          </select>
        </div>
      </div>

      {/* Advanced Params */}
      <div className="space-y-4 pt-2">
        <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Parameters</Label>
        
        <div className="space-y-3">
          <div className="flex justify-between">
            <Label className="text-xs">Steps</Label>
            <span className="text-xs text-muted-foreground">{params.steps || 20}</span>
          </div>
          <Slider
            value={[params.steps || 20]}
            min={10}
            max={50}
            step={1}
            onValueChange={(v) => setParams({ ...params, steps: v[0] })}
          />
        </div>

        <div className="space-y-3">
          <div className="flex justify-between">
            <Label className="text-xs">Guidance Scale</Label>
            <span className="text-xs text-muted-foreground">{params.guidance_scale || 6.0}</span>
          </div>
          <Slider
            value={[params.guidance_scale || 6.0]}
            min={1}
            max={20}
            step={0.5}
            onValueChange={(v) => setParams({ ...params, guidance_scale: v[0] })}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="pt-4 space-y-3 mt-auto">
        <Button
          onClick={onSplit}
          disabled={!canSplit || isSplitting}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
        >
          {isSplitting ? (
            <>
              <span className="animate-spin mr-2">⏳</span>
              {splitProgress || 'Processing...'}
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2 fill-current" />
              Split Overlap
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
