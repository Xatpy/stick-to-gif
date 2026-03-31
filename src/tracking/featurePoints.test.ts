import { describe, expect, it, vi } from 'vitest';
import type { Rect } from '../types';
import { refreshTrackedFeaturePoints } from './featurePoints';

describe('refreshTrackedFeaturePoints', () => {
  it('deletes the old points and re-detects from the current frame and next region', () => {
    const previousPoints = { delete: vi.fn() };
    const refreshedPoints = { delete: vi.fn() };
    const currentGray = { frame: 'current' };
    const nextRegion: Rect = { x: 12, y: 18, width: 42, height: 36 };
    const detect = vi.fn(() => refreshedPoints);

    const result = refreshTrackedFeaturePoints(previousPoints, currentGray, nextRegion, detect);

    expect(previousPoints.delete).toHaveBeenCalledTimes(1);
    expect(detect).toHaveBeenCalledWith(currentGray, nextRegion);
    expect(result).toBe(refreshedPoints);
  });
});
