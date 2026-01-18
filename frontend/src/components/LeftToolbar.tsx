import { type LucideIcon, MousePointer2, Move, Type, ZoomIn, Scan, BoxSelect, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Tool } from '@/types';

interface ToolButtonProps {
  tool?: Tool;
  active: boolean;
  icon: LucideIcon;
  onClick: (tool: Tool) => void;
  title: string;
}

const ToolButton = ({ tool, active, icon: Icon, onClick, title }: ToolButtonProps) => (
  <Button
    variant="ghost"
    size="icon"
    onClick={() => tool && onClick(tool)}
    title={title}
    className={cn(
        "h-10 w-10 rounded-xl transition-all duration-200", 
        active 
            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 scale-110" 
            : "text-muted-foreground hover:bg-white/10 hover:text-foreground"
    )}
  >
    <Icon className="h-5 w-5" />
  </Button>
);

interface LeftToolbarProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  onSegmentAll?: () => void;
}

export function LeftToolbar({ activeTool, onToolChange, onSegmentAll }: LeftToolbarProps) {
  return (
    <div className="glass w-16 flex flex-col items-center py-4 rounded-full space-y-3 animate-in slide-in-from-left-4 duration-500">
      <ToolButton
        tool="select"
        active={activeTool === 'select'}
        icon={MousePointer2}
        onClick={onToolChange}
        title="Select (V)"
      />
      <ToolButton
        tool="pan"
        active={activeTool === 'pan'}
        icon={Move}
        onClick={onToolChange}
        title="Pan (H)"
      />
      <ToolButton
        tool="zoom"
        active={activeTool === 'zoom'}
        icon={ZoomIn}
        onClick={onToolChange}
        title="Zoom (Z)"
      />
      
      <div className="h-px w-8 bg-white/10 my-2" />
      
      <ToolButton
        tool="segment"
        active={activeTool === 'segment'}
        icon={Circle}
        onClick={onToolChange}
        title="Dot (Point) Segment (S)"
      />
      <ToolButton
        tool="box"
        active={activeTool === 'box'}
        icon={BoxSelect}
        onClick={onToolChange}
        title="Box Segment (B)"
      />
      <ToolButton
        tool="text"
        active={activeTool === 'text'}
        icon={Type}
        onClick={onToolChange}
        title="Text Segment (T)"
      />
      
      {onSegmentAll && (
        <>
            <div className="h-px w-8 bg-white/10 my-2" />
            <Button
                variant="ghost"
                size="icon"
                onClick={onSegmentAll}
                title="Segment All Objects"
                className="h-10 w-10 rounded-xl text-purple-400 hover:text-purple-300 hover:bg-purple-500/20 transition-all"
            >
                <Scan className="h-5 w-5" />
            </Button>
        </>
      )}
    </div>
  );
}
