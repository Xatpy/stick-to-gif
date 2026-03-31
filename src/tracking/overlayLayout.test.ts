import { describe, expect, it } from 'vitest';
import { buildOverlayFromRegion, computeOverlayLayout } from './overlayLayout';

describe('overlayLayout', () => {
  it('round-trips overlay placement from one region to another', () => {
    const initialRegion = { x: 20, y: 30, width: 40, height: 20 };
    const overlay = { x: 45, y: 35, width: 24, height: 12, rotation: 0.15 };
    const nextRegion = { x: 50, y: 60, width: 80, height: 40, rotation: 0 };

    const relative = computeOverlayLayout(initialRegion, overlay);
    const rebuilt = buildOverlayFromRegion(nextRegion, relative, false);

    expect(rebuilt.x).toBeCloseTo(100);
    expect(rebuilt.y).toBeCloseTo(70);
    expect(rebuilt.width).toBeCloseTo(48);
    expect(rebuilt.height).toBeCloseTo(24);
    expect(rebuilt.rotation).toBeCloseTo(0.15);
  });

  it('rotates overlay offset with the tracked region when enabled', () => {
    const region = { x: 80, y: 40, width: 20, height: 20, rotation: Math.PI / 2 };
    const relative = {
      offsetX: 1,
      offsetY: 0,
      widthRatio: 1,
      heightRatio: 1,
      rotationOffset: 0.25,
    };

    const overlay = buildOverlayFromRegion(region, relative, true);

    expect(overlay.x).toBeCloseTo(90);
    expect(overlay.y).toBeCloseTo(70);
    expect(overlay.width).toBeCloseTo(24);
    expect(overlay.height).toBeCloseTo(24);
    expect(overlay.rotation).toBeCloseTo(Math.PI / 2 + 0.25);
  });
});
