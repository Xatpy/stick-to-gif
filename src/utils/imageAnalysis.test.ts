import { describe, expect, it } from 'vitest';
import { getDefaultTargetRect, getPixel, refineRectFromLocalRegion } from './imageAnalysis';
import type { DecodedGif, Rect } from '../types';

function createFrame(
  width: number,
  height: number,
  background: [number, number, number],
  objectRect?: Rect,
  objectColor: [number, number, number] = [220, 90, 60],
) {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const inObject = objectRect
        && x >= objectRect.x
        && x < objectRect.x + objectRect.width
        && y >= objectRect.y
        && y < objectRect.y + objectRect.height;
      const [r, g, b] = inObject ? objectColor : background;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 255;
    }
  }

  return { width, height, data } as ImageData;
}

describe('imageAnalysis', () => {
  it('reads pixel color channels correctly', () => {
    const frame = createFrame(4, 4, [240, 237, 230], { x: 1, y: 1, width: 1, height: 1 });

    expect(getPixel(frame, 0, 0)).toEqual({ r: 240, g: 237, b: 230 });
    expect(getPixel(frame, 1, 1)).toEqual({ r: 220, g: 90, b: 60 });
  });

  it('returns null for low-contrast local refinement', () => {
    const frame = createFrame(40, 40, [220, 220, 220], { x: 14, y: 14, width: 12, height: 12 }, [228, 228, 228]);

    const refined = refineRectFromLocalRegion(
      frame,
      { x: 20, y: 20 },
      { x: 12, y: 12, width: 16, height: 16 },
    );

    expect(refined).toBeNull();
  });

  it('refines a region around a clear high-contrast object', () => {
    const frame = createFrame(40, 40, [240, 237, 230], { x: 14, y: 14, width: 12, height: 12 });

    const refined = refineRectFromLocalRegion(
      frame,
      { x: 20, y: 20 },
      { x: 10, y: 10, width: 20, height: 20 },
    );

    expect(refined).not.toBeNull();
    expect(refined!.x).toBeLessThanOrEqual(14);
    expect(refined!.y).toBeLessThanOrEqual(14);
    expect(refined!.x + refined!.width).toBeGreaterThanOrEqual(26);
    expect(refined!.y + refined!.height).toBeGreaterThanOrEqual(26);
    expect(refined!.width).toBeLessThanOrEqual(24);
    expect(refined!.height).toBeLessThanOrEqual(24);
  });

  it('selects a bounded default target rect around a clear object', () => {
    const gif = {
      name: 'synthetic.gif',
      width: 100,
      height: 100,
      sourceKind: 'gif',
      loopCount: 0,
      durationMs: 100,
      frames: [],
    } as DecodedGif;
    const frame = createFrame(100, 100, [240, 237, 230], { x: 42, y: 42, width: 16, height: 16 });

    const rect = getDefaultTargetRect(gif, frame, { x: 50, y: 50 });

    expect(rect.x).toBeLessThanOrEqual(42);
    expect(rect.y).toBeLessThanOrEqual(42);
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(58);
    expect(rect.y + rect.height).toBeGreaterThanOrEqual(58);
    expect(rect.width).toBeLessThan(30);
    expect(rect.height).toBeLessThan(30);
  });
});
