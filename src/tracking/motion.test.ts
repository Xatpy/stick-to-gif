import { describe, expect, it } from 'vitest';
import { estimateMotion, extractPoints } from './motion';

describe('motion', () => {
  it('extracts x/y pairs from a float mat-like object', () => {
    const points = extractPoints({
      rows: 3,
      data32F: new Float32Array([1, 2, 3, 4, 5, 6]),
    });

    expect(points).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
      { x: 5, y: 6 },
    ]);
  });

  it('estimates translation for stable point sets', () => {
    const previous = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
    ];
    const current = previous.map(({ x, y }) => ({ x: x + 5, y: y + 3 }));

    const motion = estimateMotion(previous, current);

    expect(motion.dx).toBeCloseTo(5);
    expect(motion.dy).toBeCloseTo(3);
    expect(motion.scale).toBeCloseTo(1);
    expect(motion.rotation).toBeCloseTo(0);
    expect(motion.confidence).toBe(1);
  });

  it('clamps large scale and rotation changes to conservative bounds', () => {
    const previous = Array.from({ length: 8 }, (_, index) => {
      const angle = (index / 8) * Math.PI * 2;
      return { x: Math.cos(angle) * 10, y: Math.sin(angle) * 10 };
    });
    const current = previous.map(({ x, y }) => {
      const scaledX = x * 1.2;
      const scaledY = y * 1.2;
      const angle = 0.2;
      return {
        x: scaledX * Math.cos(angle) - scaledY * Math.sin(angle),
        y: scaledX * Math.sin(angle) + scaledY * Math.cos(angle),
      };
    });

    const motion = estimateMotion(previous, current);

    expect(motion.scale).toBeCloseTo(1.08);
    expect(motion.rotation).toBeCloseTo(0.12);
    expect(motion.confidence).toBe(1);
  });
});
