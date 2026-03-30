import type { OverlayTransform, Rect, TrackingFrame } from '../types';
import { computeOverlayLayout, buildOverlayFromRegion } from './trackObject';
import { blendOverlay } from '../utils/math';

/**
 * Compute overlay transforms for each tracking frame post-hoc.
 * This enables the "track first, overlay later" flow.
 */
export function computeOverlayFrames(
  trackingFrames: TrackingFrame[],
  initialRegion: Rect,
  overlayTransform: OverlayTransform,
  field: 'imageOverlay' | 'textOverlay' = 'imageOverlay',
): TrackingFrame[] {
  const relativeLayout = computeOverlayLayout(initialRegion, overlayTransform);

  let previousOverlay: OverlayTransform | null = overlayTransform;

  return trackingFrames.map((frame, index) => {
    if (index === 0) {
      return { ...frame, [field]: overlayTransform };
    }

    const candidateOverlay = buildOverlayFromRegion(
      frame.region,
      relativeLayout,
      Math.abs(frame.region.rotation) > 0.01,
    );

    const positionAlpha = Math.min(0.68, 0.18 + frame.confidence * 0.45);
    const blended = blendOverlay(previousOverlay, candidateOverlay, positionAlpha);
    previousOverlay = blended;

    return { ...frame, [field]: blended };
  });
}
