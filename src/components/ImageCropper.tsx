import { useEffect, useRef, useState } from 'react';
import type { Point, Rect } from '../types';
import { clamp, clampRectToBounds } from '../utils/math';

const HANDLE_HIT_RADIUS = 18;

type Corner = 'nw' | 'ne' | 'sw' | 'se';
type DragState =
  | {
    type: 'move';
    pointerId: number;
    startPointer: Point;
    startRect: Rect;
  }
  | {
    type: 'resize';
    pointerId: number;
    corner: Corner;
    startRect: Rect;
  }
  | null;

interface ImageCropperProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  cropRect: Rect;
  onChange: (rect: Rect) => void;
  disabled?: boolean;
}

function getPointWithinStage(
  element: HTMLElement,
  event: { clientX: number; clientY: number },
): Point {
  const bounds = element.getBoundingClientRect();
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  };
}

function isPointInRect(point: Point, rect: Rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function getCornerPoint(rect: Rect, corner: Corner): Point {
  switch (corner) {
    case 'nw':
      return { x: rect.x, y: rect.y };
    case 'ne':
      return { x: rect.x + rect.width, y: rect.y };
    case 'sw':
      return { x: rect.x, y: rect.y + rect.height };
    case 'se':
      return { x: rect.x + rect.width, y: rect.y + rect.height };
  }
}

function getOppositeCorner(rect: Rect, corner: Corner): Point {
  switch (corner) {
    case 'nw':
      return { x: rect.x + rect.width, y: rect.y + rect.height };
    case 'ne':
      return { x: rect.x, y: rect.y + rect.height };
    case 'sw':
      return { x: rect.x + rect.width, y: rect.y };
    case 'se':
      return { x: rect.x, y: rect.y };
  }
}

function getHitCorner(point: Point, rect: Rect) {
  const corners: Corner[] = ['nw', 'ne', 'sw', 'se'];
  return corners.find((corner) => {
    const handle = getCornerPoint(rect, corner);
    return Math.hypot(point.x - handle.x, point.y - handle.y) <= HANDLE_HIT_RADIUS;
  }) ?? null;
}

export function ImageCropper({
  imageUrl,
  imageWidth,
  imageHeight,
  cropRect,
  onChange,
  disabled = false,
}: ImageCropperProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<DragState>(null);
  const [stageSize, setStageSize] = useState<Point>({ x: imageWidth, y: imageHeight });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const syncSize = () => {
      setStageSize({
        x: stage.clientWidth || imageWidth,
        y: stage.clientHeight || imageHeight,
      });
    };

    syncSize();

    if (typeof ResizeObserver !== 'function') {
      window.addEventListener('resize', syncSize);
      return () => window.removeEventListener('resize', syncSize);
    }

    const observer = new ResizeObserver(syncSize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [imageHeight, imageUrl, imageWidth]);

  const scaleX = stageSize.x > 0 ? stageSize.x / imageWidth : 1;
  const scaleY = stageSize.y > 0 ? stageSize.y / imageHeight : 1;
  const displayRect = {
    x: cropRect.x * scaleX,
    y: cropRect.y * scaleY,
    width: cropRect.width * scaleX,
    height: cropRect.height * scaleY,
  };

  const toImagePoint = (point: Point): Point => ({
    x: clamp((point.x / Math.max(stageSize.x, 1)) * imageWidth, 0, imageWidth),
    y: clamp((point.y / Math.max(stageSize.y, 1)) * imageHeight, 0, imageHeight),
  });

  return (
    <div
      ref={stageRef}
      className={`image-cropper${disabled ? ' is-disabled' : ''}`}
      onPointerDown={(event) => {
        if (disabled || !stageRef.current) {
          return;
        }

        const point = getPointWithinStage(stageRef.current, event);
        const hitCorner = getHitCorner(point, displayRect);

        if (hitCorner) {
          setDragState({
            type: 'resize',
            pointerId: event.pointerId,
            corner: hitCorner,
            startRect: cropRect,
          });
          stageRef.current.setPointerCapture(event.pointerId);
          return;
        }

        if (!isPointInRect(point, displayRect)) {
          return;
        }

        setDragState({
          type: 'move',
          pointerId: event.pointerId,
          startPointer: toImagePoint(point),
          startRect: cropRect,
        });
        stageRef.current.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!dragState || dragState.pointerId !== event.pointerId || !stageRef.current) {
          return;
        }

        const point = getPointWithinStage(stageRef.current, event);
        const imagePoint = toImagePoint(point);

        if (dragState.type === 'move') {
          const deltaX = imagePoint.x - dragState.startPointer.x;
          const deltaY = imagePoint.y - dragState.startPointer.y;
          onChange(clampRectToBounds(
            {
              x: dragState.startRect.x + deltaX,
              y: dragState.startRect.y + deltaY,
              width: dragState.startRect.width,
              height: dragState.startRect.height,
            },
            imageWidth,
            imageHeight,
          ));
          return;
        }

        const opposite = getOppositeCorner(dragState.startRect, dragState.corner);
        onChange(clampRectToBounds(
          {
            x: Math.min(imagePoint.x, opposite.x),
            y: Math.min(imagePoint.y, opposite.y),
            width: Math.abs(imagePoint.x - opposite.x),
            height: Math.abs(imagePoint.y - opposite.y),
          },
          imageWidth,
          imageHeight,
        ));
      }}
      onPointerUp={(event) => {
        if (!stageRef.current || !dragState || dragState.pointerId !== event.pointerId) {
          return;
        }

        if (stageRef.current.hasPointerCapture(event.pointerId)) {
          stageRef.current.releasePointerCapture(event.pointerId);
        }
        setDragState(null);
      }}
      onPointerCancel={(event) => {
        if (!stageRef.current || !dragState || dragState.pointerId !== event.pointerId) {
          return;
        }

        if (stageRef.current.hasPointerCapture(event.pointerId)) {
          stageRef.current.releasePointerCapture(event.pointerId);
        }
        setDragState(null);
      }}
    >
      <img
        src={imageUrl}
        alt="Uploaded image crop preview"
        draggable={false}
      />

      <div
        className="image-cropper__selection"
        style={{
          left: `${displayRect.x}px`,
          top: `${displayRect.y}px`,
          width: `${displayRect.width}px`,
          height: `${displayRect.height}px`,
        }}
      >
        <div className="image-cropper__rule image-cropper__rule--v1" />
        <div className="image-cropper__rule image-cropper__rule--v2" />
        <div className="image-cropper__rule image-cropper__rule--h1" />
        <div className="image-cropper__rule image-cropper__rule--h2" />
        <div className="image-cropper__label">
          {Math.round(cropRect.width)} × {Math.round(cropRect.height)}
        </div>
        {(['nw', 'ne', 'sw', 'se'] as Corner[]).map((corner) => (
          <div
            key={corner}
            className={`image-cropper__handle image-cropper__handle--${corner}`}
          />
        ))}
      </div>
    </div>
  );
}
