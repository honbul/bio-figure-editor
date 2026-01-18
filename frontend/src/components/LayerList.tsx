import { Layer } from '@/types';
import { Eye, EyeOff, Lock, Unlock, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LayerListProps {
  layers: Layer[];
  selectedLayerId: string | null;
  onLayerSelect: (id: string) => void;
  onLayerVisibilityToggle: (id: string) => void;
  onLayerLockToggle: (id: string) => void;
  onLayerDelete: (id: string) => void;
}

export function LayerList({
  layers,
  selectedLayerId,
  onLayerSelect,
  onLayerVisibilityToggle,
  onLayerLockToggle,
  onLayerDelete
}: LayerListProps) {
  // Sort layers by z_index descending (top layers first)
  const sortedLayers = [...layers].sort((a, b) => b.z_index - a.z_index);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
        {sortedLayers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 p-4">
            <span className="text-sm">No layers yet</span>
            <span className="text-xs">Segment something to start</span>
          </div>
        ) : (
          sortedLayers.map((layer) => (
            <div
              key={layer.id}
              onClick={() => onLayerSelect(layer.id)}
              className={cn(
                "group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all duration-200 border border-transparent",
                selectedLayerId === layer.id
                  ? "bg-primary/10 border-primary/20 shadow-sm"
                  : "hover:bg-white/5 hover:border-white/5"
              )}
            >
              <div className="text-muted-foreground/30 group-hover:text-muted-foreground/60 cursor-grab active:cursor-grabbing">
                 <GripVertical className="h-4 w-4" />
              </div>
              
              <div className="h-10 w-10 rounded-md overflow-hidden bg-black/40 border border-white/10 flex-shrink-0 relative">
                 <img src={layer.asset_url} alt="" className="h-full w-full object-contain" />
                 <div className="absolute inset-0 bg-grid-white/[0.05]" />
              </div>
              
              <div className="flex-1 min-w-0">
                   <div className={cn("text-sm font-medium truncate", selectedLayerId === layer.id ? "text-primary" : "text-foreground")}>
                    {layer.name || `Layer ${layer.id.slice(0, 4)}`}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {Math.round(layer.x)}, {Math.round(layer.y)}
                  </div>
              </div>

              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-white/10 hover:text-foreground text-muted-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    onLayerVisibilityToggle(layer.id);
                  }}
                >
                  {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-white/10 hover:text-foreground text-muted-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    onLayerLockToggle(layer.id);
                  }}
                >
                  {layer.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 hover:bg-red-500/20 hover:text-red-400 text-muted-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLayerDelete(layer.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
