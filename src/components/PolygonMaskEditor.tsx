import { useEffect, useId, useRef, useState } from 'react';
import type { Point } from '../types';
import { clamp } from '../utils/math';

const HANDLE_RADIUS = 9;
const HIT_RADIUS = 18;
const MIN_POINT_SPACING = 14;

type DragState = {
  pointerId: number;
  pointIndex: number;
} | null;

interface PolygonMaskEditorProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  points: Point[];
  closed: boolean;
  onPointsChange: (points: Point[]) => void;
  onClosedChange: (closed: boolean) => void;
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

function getHitPointIndex(point: Point, points: Point[]) {
  return points.findIndex((candidate) => (
    Math.hypot(point.x - candidate.x, point.y - candidate.y) <= HIT_RADIUS
  ));
}

export function PolygonMaskEditor({
  imageUrl,
  imageWidth,
  imageHeight,
  points,
  closed,
  onPointsChange,
  onClosedChange,
  disabled = false,
}: PolygonMaskEditorProps) {
  const maskId = `polygon-mask-${useId().replace(/:/g, '')}`;
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<DragState>(null);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
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
  const averageScale = Math.max((scaleX + scaleY) / 2, 0.001);
  const closeThreshold = HIT_RADIUS / averageScale;
  const minimumPointSpacing = MIN_POINT_SPACING / averageScale;
  const displayPoints = points.map((point) => ({
    x: point.x * scaleX,
    y: point.y * scaleY,
  }));
  const displayHoverPoint = hoverPoint
    ? { x: hoverPoint.x * scaleX, y: hoverPoint.y * scaleY }
    : null;

  const toImagePoint = (point: Point): Point => ({
    x: clamp((point.x / Math.max(stageSize.x, 1)) * imageWidth, 0, imageWidth),
    y: clamp((point.y / Math.max(stageSize.y, 1)) * imageHeight, 0, imageHeight),
  });

  return (
    <div
      ref={stageRef}
      className={`polygon-mask-editor${disabled ? ' is-disabled' : ''}`}
      onPointerDown={(event) => {
        if (disabled || !stageRef.current) {
          return;
        }

        const point = getPointWithinStage(stageRef.current, event);
        const imagePoint = toImagePoint(point);

        if (closed) {
          const hitIndex = getHitPointIndex(point, displayPoints);
          if (hitIndex === -1) {
            return;
          }

          setDragState({
            pointerId: event.pointerId,
            pointIndex: hitIndex,
          });
          stageRef.current.setPointerCapture(event.pointerId);
          return;
        }

        if (points.length >= 3 && Math.hypot(
          imagePoint.x - points[0]!.x,
          imagePoint.y - points[0]!.y,
        ) <= closeThreshold) {
          onClosedChange(true);
          return;
        }

        const lastPoint = points[points.length - 1];
        if (lastPoint && Math.hypot(imagePoint.x - lastPoint.x, imagePoint.y - lastPoint.y) < minimumPointSpacing) {
          return;
        }

        onPointsChange([...points, imagePoint]);
      }}
      onPointerMove={(event) => {
        if (!stageRef.current) {
          return;
        }

        const point = getPointWithinStage(stageRef.current, event);
        const imagePoint = toImagePoint(point);

        if (dragState && dragState.pointerId === event.pointerId && closed) {
          const nextPoints = [...points];
          nextPoints[dragState.pointIndex] = imagePoint;
          onPointsChange(nextPoints);
          return;
        }

        if (!closed) {
          setHoverPoint(imagePoint);
        }
      }}
      onPointerLeave={() => {
        if (!closed) {
          setHoverPoint(null);
        }
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
        alt="Manual outline preview"
        draggable={false}
      />

      <svg
        className="polygon-mask-editor__overlay"
        viewBox={`0 0 ${stageSize.x} ${stageSize.y}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <mask id={maskId}>
            <rect width="100%" height="100%" fill="white" />
            {displayPoints.length > 1 && (
              <path
                d={[
                  `M ${displayPoints[0]!.x} ${displayPoints[0]!.y}`,
                  ...displayPoints.slice(1).map((point) => `L ${point.x} ${point.y}`),
                  ...(closed ? ['Z'] : []),
                ].join(' ')}
                fill={closed ? 'black' : 'transparent'}
                stroke="black"
                strokeWidth="2"
              />
            )}
          </mask>
        </defs>

        <rect
          width="100%"
          height="100%"
          fill="rgba(20, 20, 26, 0.46)"
          mask={`url(#${maskId})`}
        />

        {displayPoints.length > 0 && (
          <path
            d={[
              `M ${displayPoints[0]!.x} ${displayPoints[0]!.y}`,
              ...displayPoints.slice(1).map((point) => `L ${point.x} ${point.y}`),
              ...(!closed && displayHoverPoint ? [`L ${displayHoverPoint.x} ${displayHoverPoint.y}`] : []),
              ...(closed ? ['Z'] : []),
            ].join(' ')}
            fill={closed ? 'rgba(85, 240, 192, 0.12)' : 'none'}
            stroke="#55f0c0"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        )}

        {displayPoints.map((point, index) => (
          <g key={`${index}-${point.x}-${point.y}`}>
            <circle
              cx={point.x}
              cy={point.y}
              r={HANDLE_RADIUS}
              fill={index === 0 && !closed && points.length >= 3 ? '#ffd180' : '#55f0c0'}
              stroke="#ffffff"
              strokeWidth="3"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
