import { useEffect, useRef, useState } from 'react';
import type { OverlayAsset, OverlayTransform, Point, Rect } from '../types';
import {
  angleBetween,
  clampRectToBounds,
  getDistance,
  getOverlayCorners,
  isPointInOverlay,
  rectCenter,
} from '../utils/math';

interface EditorCanvasProps {
  frame: ImageData;
  overlay: OverlayAsset | null;
  overlayTransform: OverlayTransform;
  targetRect: Rect;
  onOverlayChange: (transform: OverlayTransform) => void;
  onTargetRectChange: (rect: Rect) => void;
}

type DragState =
  | {
      type: 'move-overlay';
      offsetX: number;
      offsetY: number;
    }
  | {
      type: 'resize-overlay';
      startDistance: number;
      startWidth: number;
      startHeight: number;
      aspectRatio: number;
    }
  | {
      type: 'rotate-overlay';
      startAngle: number;
      startRotation: number;
    }
  | {
      type: 'move-target';
      offsetX: number;
      offsetY: number;
    }
  | {
      type: 'resize-target';
      corner: 'nw' | 'ne' | 'sw' | 'se';
    }
  | null;

const HANDLE_RADIUS = 10;

function getCanvasPoint(
  canvas: HTMLCanvasElement,
  event: PointerEvent | React.PointerEvent<HTMLCanvasElement>,
): Point {
  const bounds = canvas.getBoundingClientRect();
  const scaleX = canvas.width / bounds.width;
  const scaleY = canvas.height / bounds.height;
  return {
    x: (event.clientX - bounds.left) * scaleX,
    y: (event.clientY - bounds.top) * scaleY,
  };
}

function drawFrame(canvas: HTMLCanvasElement, frame: ImageData) {
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  context.putImageData(frame, 0, 0);
}

export function EditorCanvas({
  frame,
  overlay,
  overlayTransform,
  targetRect,
  onOverlayChange,
  onTargetRectChange,
}: EditorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dragState, setDragState] = useState<DragState>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    canvas.width = frame.width;
    canvas.height = frame.height;
    drawFrame(canvas, frame);

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    if (overlay) {
      const targetCenter = rectCenter(targetRect);

      context.save();
      context.strokeStyle = 'rgba(93, 102, 112, 0.8)';
      context.lineWidth = 2;
      context.setLineDash([6, 6]);
      context.beginPath();
      context.moveTo(targetCenter.x, targetCenter.y);
      context.lineTo(overlayTransform.x, overlayTransform.y);
      context.stroke();
      context.setLineDash([]);
      context.restore();

      context.save();
      context.translate(overlayTransform.x, overlayTransform.y);
      context.rotate(overlayTransform.rotation);
      context.drawImage(
        overlay.source,
        -overlayTransform.width / 2,
        -overlayTransform.height / 2,
        overlayTransform.width,
        overlayTransform.height,
      );
      context.restore();

      const [topLeft, topRight, bottomRight, bottomLeft] = getOverlayCorners(
        overlayTransform,
      );
      const rotationHandle = {
        x: (topLeft.x + topRight.x) / 2,
        y: (topLeft.y + topRight.y) / 2 - 28,
      };

      context.strokeStyle = '#ffe26c';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(topLeft.x, topLeft.y);
      context.lineTo(topRight.x, topRight.y);
      context.lineTo(bottomRight.x, bottomRight.y);
      context.lineTo(bottomLeft.x, bottomLeft.y);
      context.closePath();
      context.stroke();

      context.fillStyle = '#ffe26c';
      context.beginPath();
      context.arc(bottomRight.x, bottomRight.y, HANDLE_RADIUS, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = '#5d6670';
      context.beginPath();
      context.arc(targetCenter.x, targetCenter.y, 5, 0, Math.PI * 2);
      context.fill();

      context.beginPath();
      context.moveTo((topLeft.x + topRight.x) / 2, (topLeft.y + topRight.y) / 2);
      context.lineTo(rotationHandle.x, rotationHandle.y);
      context.stroke();
      context.beginPath();
      context.arc(rotationHandle.x, rotationHandle.y, HANDLE_RADIUS, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = '#5d6670';
      context.beginPath();
      context.arc(overlayTransform.x, overlayTransform.y, 5, 0, Math.PI * 2);
      context.fill();
    }

    const corners = {
      nw: { x: targetRect.x, y: targetRect.y },
      ne: { x: targetRect.x + targetRect.width, y: targetRect.y },
      sw: { x: targetRect.x, y: targetRect.y + targetRect.height },
      se: { x: targetRect.x + targetRect.width, y: targetRect.y + targetRect.height },
    };

    context.strokeStyle = '#55f0c0';
    context.lineWidth = 2;
    context.setLineDash([10, 8]);
    context.strokeRect(targetRect.x, targetRect.y, targetRect.width, targetRect.height);
    context.setLineDash([]);
    context.fillStyle = '#55f0c0';

    Object.values(corners).forEach((corner) => {
      context.fillRect(corner.x - 6, corner.y - 6, 12, 12);
    });
  }, [frame, overlay, overlayTransform, targetRect]);

  const updateTargetRect = (point: Point, corner: 'nw' | 'ne' | 'sw' | 'se') => {
    const opposite = {
      nw: { x: targetRect.x + targetRect.width, y: targetRect.y + targetRect.height },
      ne: { x: targetRect.x, y: targetRect.y + targetRect.height },
      sw: { x: targetRect.x + targetRect.width, y: targetRect.y },
      se: { x: targetRect.x, y: targetRect.y },
    }[corner];

    onTargetRectChange(
      clampRectToBounds(
        {
          x: Math.min(point.x, opposite.x),
          y: Math.min(point.y, opposite.y),
          width: Math.abs(point.x - opposite.x),
          height: Math.abs(point.y - opposite.y),
        },
        frame.width,
        frame.height,
      ),
    );
  };

  return (
    <div className="editor-canvas">
      <canvas
        ref={canvasRef}
        onPointerDown={(event) => {
          const canvas = canvasRef.current;
          if (!canvas) {
            return;
          }

          const point = getCanvasPoint(canvas, event);
          const targetCorners = {
            nw: { x: targetRect.x, y: targetRect.y },
            ne: { x: targetRect.x + targetRect.width, y: targetRect.y },
            sw: { x: targetRect.x, y: targetRect.y + targetRect.height },
            se: { x: targetRect.x + targetRect.width, y: targetRect.y + targetRect.height },
          } as const;

          if (overlay) {
            const [topLeft, topRight, bottomRight] = getOverlayCorners(overlayTransform);
            const rotationHandle = {
              x: (topLeft.x + topRight.x) / 2,
              y: (topLeft.y + topRight.y) / 2 - 28,
            };

            if (getDistance(point, rotationHandle) <= HANDLE_RADIUS * 1.5) {
              setDragState({
                type: 'rotate-overlay',
                startAngle: angleBetween(
                  { x: overlayTransform.x, y: overlayTransform.y },
                  point,
                ),
                startRotation: overlayTransform.rotation,
              });
              canvas.setPointerCapture(event.pointerId);
              return;
            }

            if (getDistance(point, bottomRight) <= HANDLE_RADIUS * 1.5) {
              setDragState({
                type: 'resize-overlay',
                startDistance: getDistance(
                  { x: overlayTransform.x, y: overlayTransform.y },
                  point,
                ),
                startWidth: overlayTransform.width,
                startHeight: overlayTransform.height,
                aspectRatio: overlayTransform.width / overlayTransform.height,
              });
              canvas.setPointerCapture(event.pointerId);
              return;
            }

            if (isPointInOverlay(point, overlayTransform)) {
              setDragState({
                type: 'move-overlay',
                offsetX: point.x - overlayTransform.x,
                offsetY: point.y - overlayTransform.y,
              });
              canvas.setPointerCapture(event.pointerId);
              return;
            }
          }

          const hitCorner = (
            Object.entries(targetCorners) as Array<
              ['nw' | 'ne' | 'sw' | 'se', Point]
            >
          ).find(([, corner]) => getDistance(point, corner) <= HANDLE_RADIUS * 1.5);

          if (hitCorner) {
            setDragState({ type: 'resize-target', corner: hitCorner[0] });
            canvas.setPointerCapture(event.pointerId);
            return;
          }

          if (
            point.x >= targetRect.x &&
            point.x <= targetRect.x + targetRect.width &&
            point.y >= targetRect.y &&
            point.y <= targetRect.y + targetRect.height
          ) {
            setDragState({
              type: 'move-target',
              offsetX: point.x - targetRect.x,
              offsetY: point.y - targetRect.y,
            });
            canvas.setPointerCapture(event.pointerId);
          }
        }}
        onPointerMove={(event) => {
          const canvas = canvasRef.current;
          if (!canvas || !dragState) {
            return;
          }

          const point = getCanvasPoint(canvas, event);

          if (dragState.type === 'move-overlay') {
            onOverlayChange({
              ...overlayTransform,
              x: Math.min(
                frame.width,
                Math.max(0, point.x - dragState.offsetX),
              ),
              y: Math.min(
                frame.height,
                Math.max(0, point.y - dragState.offsetY),
              ),
            });
            return;
          }

          if (dragState.type === 'resize-overlay') {
            const center = { x: overlayTransform.x, y: overlayTransform.y };
            const distance = Math.max(24, getDistance(center, point));
            const scale = distance / Math.max(1, dragState.startDistance);
            const width = Math.max(24, dragState.startWidth * scale);
            const height = width / dragState.aspectRatio;
            onOverlayChange({
              ...overlayTransform,
              width,
              height,
            });
            return;
          }

          if (dragState.type === 'rotate-overlay') {
            const center = { x: overlayTransform.x, y: overlayTransform.y };
            const angle = angleBetween(center, point);
            onOverlayChange({
              ...overlayTransform,
              rotation: dragState.startRotation + (angle - dragState.startAngle),
            });
            return;
          }

          if (dragState.type === 'move-target') {
            onTargetRectChange(
              clampRectToBounds(
                {
                  x: point.x - dragState.offsetX,
                  y: point.y - dragState.offsetY,
                  width: targetRect.width,
                  height: targetRect.height,
                },
                frame.width,
                frame.height,
              ),
            );
            return;
          }

          if (dragState.type === 'resize-target') {
            updateTargetRect(point, dragState.corner);
          }
        }}
        onPointerUp={(event) => {
          const canvas = canvasRef.current;
          if (canvas?.hasPointerCapture(event.pointerId)) {
            canvas.releasePointerCapture(event.pointerId);
          }
          setDragState(null);
        }}
        onPointerLeave={() => {
          if (!dragState) {
            return;
          }
          setDragState(null);
        }}
      />
    </div>
  );
}
