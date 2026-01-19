import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Crop, Trash2, Play, Square, Hexagon, MousePointer2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RoiPanelProps {
  roiMode: 'rect' | 'poly';
  setRoiMode: (mode: 'rect' | 'poly') => void;
  onSplit: () => void;
  onClear: () => void;
  isSplitting: boolean;
  splitProgress: string;
  engine: string;
  setEngine: (engine: string) => void;
  hasRoi: boolean;
  params: Record<string, any>;
  setParams: (params: Record<string, any>) => void;
  hintMode: 'fg' | 'bg' | null;
  setHintMode: (mode: 'fg' | 'bg' | null) => void;
  hintPoints: { fg: { x: number, y: number } | null; bg: { x: number, y: number } | null };
  onClearHint: (type: 'fg' | 'bg') => void;
  prompt: string;
  setPrompt: (prompt: string) => void;
}

export function RoiPanel({
  roiMode,
  setRoiMode,
  onSplit,
  onClear,
  isSplitting,
  splitProgress,
  engine,
  setEngine,
  hasRoi,
  params,
  setParams,
  hintMode,
  setHintMode,
  hintPoints,
  onClearHint,
  prompt,
  setPrompt
}: RoiPanelProps) {


  return (
    <div className="flex flex-col flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/10">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-foreground">ROI Split</span>
          <span className="text-xs text-muted-foreground">Extract objects within region</span>
        </div>
        <div className="h-8 w-8 rounded bg-primary/20 flex items-center justify-center text-primary">
          <Crop className="h-4 w-4" />
        </div>
      </div>

      {/* Mode Selection */}
      <div className="space-y-3">
        <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Selection Mode</Label>
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

      {/* Prompt Input */}
      <div className="space-y-3">
        <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Background Prompt (Optional)</Label>
        <Input
          placeholder="Describe background to restore..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="bg-black/20 border-white/10 focus:border-primary/50"
        />
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

        <div className="space-y-3">
          <div className="flex justify-between">
            <Label className="text-xs">Strength</Label>
            <span className="text-xs text-muted-foreground">{params.strength || 1.0}</span>
          </div>
          <Slider
            value={[params.strength || 1.0]}
            min={0.1}
            max={1.0}
            step={0.05}
            onValueChange={(v) => setParams({ ...params, strength: v[0] })}
          />
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Hints</Label>
        <div className="grid grid-cols-1 gap-2">
            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setHintMode(hintMode === 'fg' ? null : 'fg')}
                    className={cn(
                        "flex-1 justify-start border-white/10 hover:bg-white/5",
                        hintMode === 'fg' && "bg-green-500/20 border-green-500/50 text-green-500 hover:bg-green-500/25",
                        hintPoints.fg && !hintMode && "border-green-500/30 text-green-500"
                    )}
                >
                    <MousePointer2 className="h-4 w-4 mr-2" />
                    {hintPoints.fg ? "Foreground Point Set" : "Set Foreground Point"}
                </Button>
                {hintPoints.fg && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        onClick={() => onClearHint('fg')}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>

            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setHintMode(hintMode === 'bg' ? null : 'bg')}
                    className={cn(
                        "flex-1 justify-start border-white/10 hover:bg-white/5",
                        hintMode === 'bg' && "bg-red-500/20 border-red-500/50 text-red-500 hover:bg-red-500/25",
                        hintPoints.bg && !hintMode && "border-red-500/30 text-red-500"
                    )}
                >
                    <MousePointer2 className="h-4 w-4 mr-2" />
                    {hintPoints.bg ? "Background Point Set" : "Set Background Point"}
                </Button>
                {hintPoints.bg && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        onClick={() => onClearHint('bg')}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>
        </div>
      </div>

      {/* Actions */}
      <div className="pt-4 space-y-3 mt-auto">
        <Button
          onClick={onSplit}
          disabled={!hasRoi || isSplitting}
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
              Split ROI
            </>
          )}
        </Button>

        <Button
          variant="ghost"
          onClick={onClear}
          disabled={!hasRoi || isSplitting}
          className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Clear Selection
        </Button>
      </div>
    </div>
  );
}
