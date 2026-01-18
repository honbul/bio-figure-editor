import { useState, useRef, useEffect } from 'react';
import { Stage, Layer as KonvaLayer, Image as KonvaImage, Transformer, Rect } from 'react-konva';
import useImage from 'use-image';
import Konva from 'konva';
import { Layer, Tool } from '@/types';
import { Button } from '@/components/ui/button';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';

interface CanvasProps {
  baseImageUrl: string | null;
  layers: Layer[];
  selectedLayerId: string | null;
  activeTool: Tool;
  onLayerSelect: (id: string | null) => void;
  onLayerUpdate: (id: string, updates: Partial<Layer>) => void;
  onSegment: (x: number, y: number, box?: number[], text?: string) => void;
}

const URLImage = ({ src, layerProps, isSelected, onSelect, onChange, draggable, opacity, locked }: any) => {
  const [image] = useImage(src);
  const shapeRef = useRef<Konva.Image>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  return (
    <>
      <KonvaImage
        image={image}
        ref={shapeRef}
        {...layerProps}
        draggable={draggable && !locked}
        opacity={opacity}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => {
          onChange({
            x: e.target.x(),
            y: e.target.y(),
          });
        }}
        onTransformEnd={() => {
          const node = shapeRef.current;
          if (!node) return;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            x: node.x(),
            y: node.y(),
            scale_x: scaleX,
            scale_y: scaleY,
            rotation_deg: node.rotation(),
          });
        }}
      />
      {isSelected && !locked && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 5 || newBox.height < 5) {
              return oldBox;
            }
            return newBox;
          }}
          borderStroke="#8b5cf6" // Primary color
          anchorStroke="#8b5cf6"
          anchorFill="#ffffff"
          anchorSize={8}
          borderDash={[4, 4]}
        />
      )}
    </>
  );
};

export function Canvas({
  baseImageUrl,
  layers,
  selectedLayerId,
  activeTool,
  onLayerSelect,
  onLayerUpdate,
  onSegment,
}: CanvasProps) {
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [baseImage] = useImage(baseImageUrl || '');
  const stageRef = useRef<Konva.Stage>(null);

  const lastCenteredBaseImageUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!baseImageUrl || !baseImage) return;
    if (lastCenteredBaseImageUrlRef.current === baseImageUrl) return;

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    const x = (viewportW - baseImage.width * stageScale) / 2;
    const y = (viewportH - baseImage.height * stageScale) / 2;

    setStagePos({ x, y });
    lastCenteredBaseImageUrlRef.current = baseImageUrl;
  }, [baseImageUrl, baseImage, stageScale]);
  
  // Box selection state
  const [isDrawingBox, setIsDrawingBox] = useState(false);
  const [boxStart, setBoxStart] = useState<{x: number, y: number} | null>(null);
  const [boxEnd, setBoxEnd] = useState<{x: number, y: number} | null>(null);

  // Sort layers by z_index ascending for rendering order
  const sortedLayers = [...layers].sort((a, b) => a.z_index - b.z_index);

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = e.target.getStage();
    if (!stage) return;

    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    setStageScale(newScale);

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    setStagePos(newPos);
  };

  const getRelativePointerPosition = (node: Konva.Node) => {
    const transform = node.getAbsoluteTransform().copy();
    transform.invert();
    const pos = node.getStage()?.getPointerPosition();
    if (!pos) return null;
    return transform.point(pos);
  };

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (activeTool === 'box') {
        const pos = getRelativePointerPosition(e.target.getStage()!);
        if (pos) {
            setIsDrawingBox(true);
            setBoxStart(pos);
            setBoxEnd(pos);
        }
    }
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (activeTool === 'box' && isDrawingBox) {
        const pos = getRelativePointerPosition(e.target.getStage()!);
        if (pos) {
            setBoxEnd(pos);
        }
    }
  };

  const handleMouseUp = (_e: Konva.KonvaEventObject<MouseEvent>) => {
    if (activeTool === 'box' && isDrawingBox && boxStart && boxEnd && baseImage) {
        setIsDrawingBox(false);
        
        // Normalize box
        const x1 = Math.min(boxStart.x, boxEnd.x);
        const y1 = Math.min(boxStart.y, boxEnd.y);
        const x2 = Math.max(boxStart.x, boxEnd.x);
        const y2 = Math.max(boxStart.y, boxEnd.y);
        
        // Check bounds and size
        if (x2 - x1 > 5 && y2 - y1 > 5) {
             // Send box prompt
             // xyxy format
             onSegment(0, 0, [x1, y1, x2, y2]);
        }
        
        setBoxStart(null);
        setBoxEnd(null);
    }
  };

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // If clicked on empty stage, deselect
    if (e.target === e.target.getStage()) {
      onLayerSelect(null);
      
      // Handle segmentation click (Point)
      if (activeTool === 'segment' && baseImage) {
        const stage = e.target.getStage();
        if (!stage) return;
        
        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        // Convert pointer to image coordinates
        const x = (pointer.x - stage.x()) / stage.scaleX();
        const y = (pointer.y - stage.y()) / stage.scaleY();
        
        // Basic bounds check
        if (x >= 0 && y >= 0 && x <= (baseImage.width || 0) && y <= (baseImage.height || 0)) {
             onSegment(x, y);
        }
      }
    }
  };

  return (
    <div className="relative flex-1 overflow-hidden h-full w-full">
      <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-2">
        <Button size="icon" variant="secondary" className="glass h-10 w-10 rounded-full hover:bg-white/20" onClick={() => setStageScale(s => s * 1.2)}>
            <ZoomIn className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="secondary" className="glass h-10 w-10 rounded-full hover:bg-white/20" onClick={() => setStageScale(s => s / 1.2)}>
            <ZoomOut className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="secondary" className="glass h-10 w-10 rounded-full hover:bg-white/20" onClick={() => { setStageScale(1); setStagePos({x:0,y:0}); }}>
            <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      <Stage
        width={window.innerWidth}
        height={window.innerHeight}
        onWheel={handleWheel}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePos.x}
        y={stagePos.y}
        draggable={activeTool === 'pan'}
        onClick={handleStageClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        ref={stageRef}
        className={activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' : activeTool === 'segment' ? 'cursor-crosshair' : activeTool === 'box' ? 'cursor-crosshair' : 'cursor-default'}
      >
        <KonvaLayer>
          {baseImage && (
            <KonvaImage
              image={baseImage}
              listening={false} // Base image is background, doesn't capture events
            />
          )}
          {sortedLayers.map((layer) => {
            if (!layer.visible) return null;
            return (
              <URLImage
                key={layer.id}
                src={layer.asset_url}
                isSelected={selectedLayerId === layer.id}
                onSelect={() => {
                  if (activeTool === 'select') onLayerSelect(layer.id);
                }}
                onChange={(newAttrs: any) => {
                  onLayerUpdate(layer.id, newAttrs);
                }}
                draggable={activeTool === 'select'}
                layerProps={{
                  x: layer.x,
                  y: layer.y,
                  scaleX: layer.scale_x,
                  scaleY: layer.scale_y,
                  rotation: layer.rotation_deg,
                }}
                opacity={layer.opacity}
                locked={layer.locked}
              />
            );
          })}
          
          {/* Box selection overlay */}
          {activeTool === 'box' && isDrawingBox && boxStart && boxEnd && (
             <Rect
                x={Math.min(boxStart.x, boxEnd.x)}
                y={Math.min(boxStart.y, boxEnd.y)}
                width={Math.abs(boxEnd.x - boxStart.x)}
                height={Math.abs(boxEnd.y - boxStart.y)}
                stroke="#8b5cf6"
                strokeWidth={2 / stageScale}
                fill="rgba(139, 92, 246, 0.2)"
                listening={false}
             />
          )}
        </KonvaLayer>
      </Stage>
    </div>
  );
}
