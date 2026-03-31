import type { OverlayTransform, Rect, TrackedRegion } from '../types';
import { rotatePoint, rectCenter } from '../utils/math';

export interface RelativeOverlayLayout {
  offsetX: number;
  offsetY: number;
  widthRatio: number;
  heightRatio: number;
  rotationOffset: number;
}

export function computeOverlayLayout(
  region: Rect,
  overlay: OverlayTransform,
): RelativeOverlayLayout {
  const regionCenter = rectCenter(region);
  return {
    offsetX: (overlay.x - regionCenter.x) / region.width,
    offsetY: (overlay.y - regionCenter.y) / region.height,
    widthRatio: overlay.width / region.width,
    heightRatio: overlay.height / region.height,
    rotationOffset: overlay.rotation,
  };
}

export function buildOverlayFromRegion(
  region: TrackedRegion,
  relativeLayout: RelativeOverlayLayout,
  rotationEnabled: boolean,
): OverlayTransform {
  const center = rectCenter(region);
  const regionRotation = rotationEnabled ? region.rotation : 0;
  const offset = rotatePoint(
    {
      x: region.width * relativeLayout.offsetX,
      y: region.height * relativeLayout.offsetY,
    },
    regionRotation,
  );

  return {
    x: center.x + offset.x,
    y: center.y + offset.y,
    width: Math.max(24, region.width * relativeLayout.widthRatio),
    height: Math.max(24, region.height * relativeLayout.heightRatio),
    rotation: relativeLayout.rotationOffset + regionRotation,
  };
}
