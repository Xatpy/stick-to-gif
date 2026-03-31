import type { Rect } from '../types';

export interface DeletableFeaturePoints {
  delete(): void;
}

export function refreshTrackedFeaturePoints<T extends DeletableFeaturePoints, G>(
  featurePoints: T,
  currentGray: G,
  nextRegion: Rect,
  detectFeaturePoints: (gray: G, region: Rect) => T,
) {
  featurePoints.delete();
  return detectFeaturePoints(currentGray, nextRegion);
}
