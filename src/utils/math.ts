import type { OverlayTransform, Point, Rect, TrackedRegion } from '../types';

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const lerp = (from: number, to: number, alpha: number) =>
  from + (to - from) * alpha;

export const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export const rectCenter = (rect: Rect): Point => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
});

export const normalizeRect = (rect: Rect): Rect => {
  const next: Rect = { ...rect };
  if (next.width < 0) {
    next.x += next.width;
    next.width *= -1;
  }
  if (next.height < 0) {
    next.y += next.height;
    next.height *= -1;
  }
  return next;
};

export const clampRectToBounds = (
  rect: Rect,
  boundsWidth: number,
  boundsHeight: number,
): Rect => {
  const normalized = normalizeRect(rect);
  const width = clamp(normalized.width, 16, boundsWidth);
  const height = clamp(normalized.height, 16, boundsHeight);

  return {
    x: clamp(normalized.x, 0, Math.max(0, boundsWidth - width)),
    y: clamp(normalized.y, 0, Math.max(0, boundsHeight - height)),
    width,
    height,
  };
};

export const rotatePoint = (point: Point, angle: number): Point => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
};

export const inverseRotatePoint = (point: Point, angle: number): Point =>
  rotatePoint(point, -angle);

export const getOverlayCorners = (
  overlay: OverlayTransform,
): [Point, Point, Point, Point] => {
  const halfWidth = overlay.width / 2;
  const halfHeight = overlay.height / 2;
  const corners: Point[] = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ].map((point) => {
    const rotated = rotatePoint(point, overlay.rotation);
    return { x: overlay.x + rotated.x, y: overlay.y + rotated.y };
  });

  return [
    corners[0]!,
    corners[1]!,
    corners[2]!,
    corners[3]!,
  ];
};

export const isPointInOverlay = (
  point: Point,
  overlay: OverlayTransform,
): boolean => {
  const local = inverseRotatePoint(
    { x: point.x - overlay.x, y: point.y - overlay.y },
    overlay.rotation,
  );
  return (
    Math.abs(local.x) <= overlay.width / 2 &&
    Math.abs(local.y) <= overlay.height / 2
  );
};

export const getDistance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);

export const angleBetween = (center: Point, point: Point) =>
  Math.atan2(point.y - center.y, point.x - center.x);

export const wrapAngle = (angle: number) => {
  let next = angle;
  while (next > Math.PI) next -= Math.PI * 2;
  while (next < -Math.PI) next += Math.PI * 2;
  return next;
};

export const blendRegion = (
  previous: TrackedRegion,
  next: TrackedRegion,
  alpha: number,
  rotationAlpha: number,
): TrackedRegion => ({
  x: lerp(previous.x, next.x, alpha),
  y: lerp(previous.y, next.y, alpha),
  width: lerp(previous.width, next.width, alpha),
  height: lerp(previous.height, next.height, alpha),
  rotation: previous.rotation + wrapAngle(next.rotation - previous.rotation) * rotationAlpha,
});

export const blendOverlay = (
  previous: OverlayTransform,
  next: OverlayTransform,
  alpha: number,
): OverlayTransform => ({
  x: lerp(previous.x, next.x, alpha),
  y: lerp(previous.y, next.y, alpha),
  width: lerp(previous.width, next.width, alpha),
  height: lerp(previous.height, next.height, alpha),
  rotation:
    previous.rotation + wrapAngle(next.rotation - previous.rotation) * alpha,
});
