import { useState, useRef, useEffect } from 'react';
import { Stage, Layer as KonvaLayer, Image as KonvaImage, Transformer, Rect, Line, Circle as KonvaCircle } from 'react-konva';
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
  roiMode?: 'rect' | 'poly';
  roiBox?: [number, number, number, number] | null;
  roiPoints?: {x: number, y: number}[];
  onRoiBoxChange?: (box: [number, number, number, number] | null) => void;
  onRoiPointsChange?: (points: {x: number, y: number}[]) => void;
  roiHintMode?: 'fg' | 'bg' | null;
  onRoiHintPoint?: (mode: 'fg' | 'bg', point: {x: number, y: number}) => void;
  roiFgPoint?: {x: number, y: number} | null;
  roiBgPoint?: {x: number, y: number} | null;
  overlapMaskA?: { box: [number, number, number, number] | null; points: {x: number, y: number}[] };
  overlapMaskB?: { box: [number, number, number, number] | null; points: {x: number, y: number}[] };
  overlapActiveMask?: 'A' | 'B';
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
  roiMode,
  roiBox,
  roiPoints,
  onRoiBoxChange,
  onRoiPointsChange,
  roiHintMode,
  onRoiHintPoint,
  roiFgPoint,
  roiBgPoint,
  overlapMaskA,
  overlapMaskB,
  overlapActiveMask,
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
    if (activeTool === 'box' || (activeTool === 'roi' && roiMode === 'rect') || (activeTool === 'overlap' && roiMode === 'rect') || activeTool === 'decompose') {
        const pos = getRelativePointerPosition(e.target.getStage()!);
        if (pos) {
            setIsDrawingBox(true);
            setBoxStart(pos);
            setBoxEnd(pos);
        }
    }
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if ((activeTool === 'box' || (activeTool === 'roi' && roiMode === 'rect') || (activeTool === 'overlap' && roiMode === 'rect') || activeTool === 'decompose') && isDrawingBox) {
        const pos = getRelativePointerPosition(e.target.getStage()!);
        if (pos) {
            setBoxEnd(pos);
        }
    }
  };

  const handleMouseUp = (_e: Konva.KonvaEventObject<MouseEvent>) => {
    if ((activeTool === 'box' || (activeTool === 'roi' && roiMode === 'rect') || (activeTool === 'overlap' && roiMode === 'rect') || activeTool === 'decompose') && isDrawingBox && boxStart && boxEnd && baseImage) {
        setIsDrawingBox(false);
        
        // Normalize box
        const x1 = Math.min(boxStart.x, boxEnd.x);
        const y1 = Math.min(boxStart.y, boxEnd.y);
        const x2 = Math.max(boxStart.x, boxEnd.x);
        const y2 = Math.max(boxStart.y, boxEnd.y);
        
        // Check bounds and size
        if (x2 - x1 > 5 && y2 - y1 > 5) {
             if (activeTool === 'box') {
                 // Send box prompt
                 // xyxy format
                 onSegment(0, 0, [x1, y1, x2, y2]);
             } else if (activeTool === 'roi' && onRoiBoxChange) {
                 onRoiBoxChange([x1, y1, x2, y2]);
             } else if (activeTool === 'overlap' && onRoiBoxChange) {
                 onRoiBoxChange([x1, y1, x2, y2]);
             } else if (activeTool === 'decompose' && onRoiBoxChange) {
                 onRoiBoxChange([x1, y1, x2, y2]);
             }
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

      // Handle ROI Polygon click
      if ((activeTool === 'roi' || activeTool === 'overlap') && baseImage) {
        const stage = e.target.getStage();
        if (!stage) return;
        
        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        // Convert pointer to image coordinates
        const x = (pointer.x - stage.x()) / stage.scaleX();
        const y = (pointer.y - stage.y()) / stage.scaleY();

        // Check if inside image bounds
        if (x >= 0 && y >= 0 && x <= (baseImage.width || 0) && y <= (baseImage.height || 0)) {
          // If hint mode is armed, capture hint point instead of drawing
          if (roiHintMode && onRoiHintPoint) {
            onRoiHintPoint(roiHintMode, { x, y });
            return;
          }

          // Otherwise handle polygon drawing
          if (roiMode === 'poly' && onRoiPointsChange) {
            onRoiPointsChange([...(roiPoints || []), { x, y }]);
          }
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
        draggable={activeTool === 'pan' || activeTool === 'select'}
        onClick={handleStageClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        ref={stageRef}
        className={activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' : (activeTool === 'segment' || activeTool === 'box' || activeTool === 'roi') ? 'cursor-crosshair' : 'cursor-default'}
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
          
          {/* Box selection overlay (Drawing) */}
          {(activeTool === 'box' || (activeTool === 'roi' && roiMode === 'rect') || (activeTool === 'overlap' && roiMode === 'rect') || activeTool === 'decompose') && isDrawingBox && boxStart && boxEnd && (
             <Rect
                x={Math.min(boxStart.x, boxEnd.x)}
                y={Math.min(boxStart.y, boxEnd.y)}
                width={Math.abs(boxEnd.x - boxStart.x)}
                height={Math.abs(boxEnd.y - boxStart.y)}
                stroke={activeTool === 'roi' ? "#10b981" : activeTool === 'overlap' ? (overlapActiveMask === 'A' ? "#3b82f6" : "#f97316") : activeTool === 'decompose' ? "#06b6d4" : "#8b5cf6"}
                strokeWidth={2 / stageScale}
                fill={activeTool === 'roi' ? "rgba(16, 185, 129, 0.2)" : activeTool === 'overlap' ? (overlapActiveMask === 'A' ? "rgba(59, 130, 246, 0.2)" : "rgba(249, 115, 22, 0.2)") : activeTool === 'decompose' ? "rgba(6, 182, 212, 0.2)" : "rgba(139, 92, 246, 0.2)"}
                listening={false}
             />
          )}

          {/* Persistent ROI Box */}
          {activeTool === 'roi' && roiMode === 'rect' && roiBox && !isDrawingBox && (
             <Rect
                x={roiBox[0]}
                y={roiBox[1]}
                width={roiBox[2] - roiBox[0]}
                height={roiBox[3] - roiBox[1]}
                stroke="#10b981"
                strokeWidth={2 / stageScale}
                fill="rgba(16, 185, 129, 0.1)"
                listening={false}
             />
          )}

          {/* Persistent Decompose Box */}
          {activeTool === 'decompose' && roiBox && !isDrawingBox && (
             <Rect
                x={roiBox[0]}
                y={roiBox[1]}
                width={roiBox[2] - roiBox[0]}
                height={roiBox[3] - roiBox[1]}
                stroke="#06b6d4"
                strokeWidth={2 / stageScale}
                fill="rgba(6, 182, 212, 0.1)"
                listening={false}
             />
          )}

          {/* Persistent ROI Polygon */}
          {activeTool === 'roi' && roiMode === 'poly' && roiPoints && roiPoints.length > 0 && (
             <>
                <Line
                  points={roiPoints.flatMap(p => [p.x, p.y])}
                  stroke="#10b981"
                  strokeWidth={2 / stageScale}
                  closed={roiPoints.length > 2}
                  fill={roiPoints.length > 2 ? "rgba(16, 185, 129, 0.1)" : undefined}
                  listening={false}
                />
                {roiPoints.map((p, i) => (
                  <KonvaCircle
                    key={i}
                    x={p.x}
                    y={p.y}
                    radius={4 / stageScale}
                    fill="#10b981"
                    listening={false}
                  />
                ))}
             </>
          )}

          {/* Overlap Masks */}
          {activeTool === 'overlap' && overlapMaskA && (
             <>
                {overlapMaskA.box && (
                    <Rect
                        x={overlapMaskA.box[0]}
                        y={overlapMaskA.box[1]}
                        width={overlapMaskA.box[2] - overlapMaskA.box[0]}
                        height={overlapMaskA.box[3] - overlapMaskA.box[1]}
                        stroke="#3b82f6" // Blue
                        strokeWidth={2 / stageScale}
                        fill={overlapActiveMask === 'A' ? "rgba(59, 130, 246, 0.2)" : "rgba(59, 130, 246, 0.1)"}
                        listening={false}
                    />
                )}
                {overlapMaskA.points.length > 0 && (
                    <>
                        <Line
                            points={overlapMaskA.points.flatMap(p => [p.x, p.y])}
                            stroke="#3b82f6"
                            strokeWidth={2 / stageScale}
                            closed={overlapMaskA.points.length > 2}
                            fill={overlapMaskA.points.length > 2 ? (overlapActiveMask === 'A' ? "rgba(59, 130, 246, 0.2)" : "rgba(59, 130, 246, 0.1)") : undefined}
                            listening={false}
                        />
                        {overlapMaskA.points.map((p, i) => (
                          <KonvaCircle
                            key={`a-${i}`}
                            x={p.x}
                            y={p.y}
                            radius={4 / stageScale}
                            fill="#3b82f6"
                            listening={false}
                          />
                        ))}
                    </>
                )}
             </>
          )}

          {activeTool === 'overlap' && overlapMaskB && (
             <>
                {overlapMaskB.box && (
                    <Rect
                        x={overlapMaskB.box[0]}
                        y={overlapMaskB.box[1]}
                        width={overlapMaskB.box[2] - overlapMaskB.box[0]}
                        height={overlapMaskB.box[3] - overlapMaskB.box[1]}
                        stroke="#f97316" // Orange
                        strokeWidth={2 / stageScale}
                        fill={overlapActiveMask === 'B' ? "rgba(249, 115, 22, 0.2)" : "rgba(249, 115, 22, 0.1)"}
                        listening={false}
                    />
                )}
                {overlapMaskB.points.length > 0 && (
                    <>
                        <Line
                            points={overlapMaskB.points.flatMap(p => [p.x, p.y])}
                            stroke="#f97316"
                            strokeWidth={2 / stageScale}
                            closed={overlapMaskB.points.length > 2}
                            fill={overlapMaskB.points.length > 2 ? (overlapActiveMask === 'B' ? "rgba(249, 115, 22, 0.2)" : "rgba(249, 115, 22, 0.1)") : undefined}
                            listening={false}
                        />
                        {overlapMaskB.points.map((p, i) => (
                          <KonvaCircle
                            key={`b-${i}`}
                            x={p.x}
                            y={p.y}
                            radius={4 / stageScale}
                            fill="#f97316"
                            listening={false}
                          />
                        ))}
                    </>
                )}
             </>
          )}

          {activeTool === 'roi' && roiFgPoint && (
            <KonvaCircle
              x={roiFgPoint.x}
              y={roiFgPoint.y}
              radius={5 / stageScale}
              fill="#22c55e"
              stroke="white"
              strokeWidth={2 / stageScale}
              listening={false}
            />
          )}
          {activeTool === 'roi' && roiBgPoint && (
            <KonvaCircle
              x={roiBgPoint.x}
              y={roiBgPoint.y}
              radius={5 / stageScale}
              fill="#ef4444"
              stroke="white"
              strokeWidth={2 / stageScale}
              listening={false}
            />
          )}
        </KonvaLayer>
      </Stage>
    </div>
  );
}
