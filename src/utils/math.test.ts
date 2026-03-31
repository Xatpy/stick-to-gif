import { describe, expect, it } from 'vitest';
import { blendOverlay, blendRegion, clampRectToBounds } from './math';

describe('math', () => {
  it('normalizes negative rectangles and clamps them to bounds', () => {
    const rect = clampRectToBounds(
      { x: 110, y: 95, width: -30, height: -50 },
      100,
      80,
    );

    expect(rect).toEqual({
      x: 70,
      y: 30,
      width: 30,
      height: 50,
    });
  });

  it('blends regions using the shortest wrapped rotation path', () => {
    const previous = { x: 0, y: 0, width: 10, height: 10, rotation: Math.PI - 0.1 };
    const next = { x: 10, y: 20, width: 30, height: 50, rotation: -Math.PI + 0.1 };

    const blended = blendRegion(previous, next, 0.5, 1);

    expect(blended.x).toBeCloseTo(5);
    expect(blended.y).toBeCloseTo(10);
    expect(blended.width).toBeCloseTo(20);
    expect(blended.height).toBeCloseTo(30);
    expect(blended.rotation).toBeCloseTo(Math.PI + 0.1);
  });

  it('returns the next overlay when there is no previous overlay', () => {
    const next = { x: 20, y: 30, width: 40, height: 50, rotation: 0.4 };

    expect(blendOverlay(null, next, 0.3)).toEqual(next);
  });
});
