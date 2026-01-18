import { FolderOpen, Save, Download, Undo2, Redo2, Image as ImageIcon, Layers, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TopBarProps {
  onOpen: () => void;
  onSave: () => void;
  onExport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onLayerDecompose: () => void;
  onReloadModels: () => void;
  canUndo: boolean;
  canRedo: boolean;
  fileName?: string;
  isReloadingModels?: boolean;
}

export const TopBar = ({ onOpen, onSave, onExport, onUndo, onRedo, onLayerDecompose, onReloadModels, canUndo, canRedo, fileName, isReloadingModels }: TopBarProps) => {
  return (
    <div className="glass h-14 px-4 rounded-full flex items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-500">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
            <ImageIcon className="h-4 w-4" />
        </div>
        <span className="font-medium text-sm text-foreground/90 truncate max-w-[150px]">
            {fileName || 'Untitled Project'}
        </span>
      </div>

      <div className="h-6 w-px bg-white/10" />

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onOpen} className="h-9 w-9 rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground" title="Open Image">
            <FolderOpen className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onSave} className="h-9 w-9 rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground" title="Save Project">
            <Save className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onExport} className="h-9 w-9 rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground" title="Export">
            <Download className="h-4 w-4" />
        </Button>
        <Button 
            variant="ghost" 
            size="icon" 
            onClick={onReloadModels} 
            disabled={isReloadingModels}
            className={cn("h-9 w-9 rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground", isReloadingModels && "animate-spin")}
            title="Reload Models (SAM/Qwen/Diffusion)"
        >
            <RotateCw className="h-4 w-4" />
        </Button>
        <Button
            variant="ghost"
            size="icon"
            onClick={onLayerDecompose}
            className="h-9 w-9 rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground"
            title="Auto Layer Decompose (Qwen)"
        >
            <Layers className="h-4 w-4" />
        </Button>
      </div>

      <div className="h-6 w-px bg-white/10" />

      <div className="flex items-center gap-1">
        <Button 
            variant="ghost" 
            size="icon" 
            onClick={onUndo} 
            disabled={!canUndo}
            className={cn("h-9 w-9 rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground", !canUndo && "opacity-30")}
            title="Undo (Ctrl+Z)"
        >
            <Undo2 className="h-4 w-4" />
        </Button>
        <Button 
            variant="ghost" 
            size="icon" 
            onClick={onRedo} 
            disabled={!canRedo}
            className={cn("h-9 w-9 rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground", !canRedo && "opacity-30")}
            title="Redo (Ctrl+Y)"
        >
            <Redo2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
