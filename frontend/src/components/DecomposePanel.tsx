import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Grid, Play, Trash2 } from 'lucide-react';

interface DecomposePanelProps {
  onDecompose: () => void;
  onClear: () => void;
  isDecomposing: boolean;
  decomposeProgress: string;
  hasBox: boolean;
  params: {
    steps: number;
    guidance_scale: number;
    seed: number | '';
    num_layers: number;
  };
  setParams: (params: { steps: number; guidance_scale: number; seed: number | ''; num_layers: number }) => void;
}

export function DecomposePanel({
  onDecompose,
  onClear,
  isDecomposing,
  decomposeProgress,
  hasBox,
  params,
  setParams
}: DecomposePanelProps) {
  return (
    <div className="flex flex-col flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/10">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-foreground">Decompose Area</span>
          <span className="text-xs text-muted-foreground">Split area into layers</span>
        </div>
        <div className="h-8 w-8 rounded bg-primary/20 flex items-center justify-center text-primary">
          <Grid className="h-4 w-4" />
        </div>
      </div>

      {/* Instructions */}
      <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200">
        Draw a box around the area you want to decompose into multiple layers.
      </div>

      {/* Parameters */}
      <div className="space-y-4 pt-2">
        <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Parameters</Label>
        
        <div className="space-y-3">
          <div className="flex justify-between">
            <Label className="text-xs">Steps</Label>
            <span className="text-xs text-muted-foreground">{params.steps}</span>
          </div>
          <Slider
            value={[params.steps]}
            min={10}
            max={50}
            step={1}
            onValueChange={(v) => setParams({ ...params, steps: v[0] })}
          />
        </div>

        <div className="space-y-3">
          <div className="flex justify-between">
            <Label className="text-xs">Guidance Scale</Label>
            <span className="text-xs text-muted-foreground">{params.guidance_scale}</span>
          </div>
          <Slider
            value={[params.guidance_scale]}
            min={1}
            max={20}
            step={0.5}
            onValueChange={(v) => setParams({ ...params, guidance_scale: v[0] })}
          />
        </div>

        <div className="space-y-3">
          <div className="flex justify-between">
            <Label className="text-xs">Max Layers</Label>
            <span className="text-xs text-muted-foreground">{params.num_layers}</span>
          </div>
          <Slider
            value={[params.num_layers]}
            min={1}
            max={20}
            step={1}
            onValueChange={(v) => setParams({ ...params, num_layers: v[0] })}
          />
        </div>

        <div className="space-y-3">
          <Label className="text-xs">Seed (Optional)</Label>
          <Input
            type="number"
            min="0"
            placeholder="Random"
            value={params.seed}
            onChange={(e) => setParams({ ...params, seed: e.target.value ? parseInt(e.target.value) : '' })}
            className="bg-black/20 border-white/10 focus:border-primary/50"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="pt-4 space-y-3 mt-auto">
        <Button
          onClick={onDecompose}
          disabled={!hasBox || isDecomposing}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
        >
          {isDecomposing ? (
            <>
              <span className="animate-spin mr-2">⏳</span>
              {decomposeProgress || 'Processing...'}
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2 fill-current" />
              Decompose Area
            </>
          )}
        </Button>

        <Button
          variant="ghost"
          onClick={onClear}
          disabled={!hasBox || isDecomposing}
          className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Clear Selection
        </Button>
      </div>
    </div>
  );
}
