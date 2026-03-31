import { clamp, wrapAngle } from '../utils/math';

export interface MotionEstimate {
  dx: number;
  dy: number;
  scale: number;
  rotation: number;
  confidence: number;
}

export function extractPoints(pointsMat: { rows: number; data32F: Float32Array }) {
  const result: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < pointsMat.rows; index += 1) {
    result.push({
      x: pointsMat.data32F[index * 2] ?? 0,
      y: pointsMat.data32F[index * 2 + 1] ?? 0,
    });
  }
  return result;
}

export function centroid(points: Array<{ x: number; y: number }>) {
  const sum = points.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  };
}

export function estimateMotion(
  previousPoints: Array<{ x: number; y: number }>,
  currentPoints: Array<{ x: number; y: number }>,
): MotionEstimate {
  const previousCenter = centroid(previousPoints);
  const currentCenter = centroid(currentPoints);

  let previousRadius = 0;
  let currentRadius = 0;
  let rotationSum = 0;
  let rotationSamples = 0;

  for (let index = 0; index < previousPoints.length; index += 1) {
    const previousPoint = previousPoints[index]!;
    const currentPoint = currentPoints[index]!;
    const prevVector = {
      x: previousPoint.x - previousCenter.x,
      y: previousPoint.y - previousCenter.y,
    };
    const currVector = {
      x: currentPoint.x - currentCenter.x,
      y: currentPoint.y - currentCenter.y,
    };

    previousRadius += Math.hypot(prevVector.x, prevVector.y);
    currentRadius += Math.hypot(currVector.x, currVector.y);

    const prevAngle = Math.atan2(prevVector.y, prevVector.x);
    const currAngle = Math.atan2(currVector.y, currVector.x);
    const delta = wrapAngle(currAngle - prevAngle);

    if (Number.isFinite(delta)) {
      rotationSum += delta;
      rotationSamples += 1;
    }
  }

  const scale =
    previousRadius > 0 ? clamp(currentRadius / previousRadius, 0.92, 1.08) : 1;
  const rotation =
    rotationSamples >= 6 ? clamp(rotationSum / rotationSamples, -0.12, 0.12) : 0;
  const confidence = clamp(currentPoints.length / Math.max(previousPoints.length, 1), 0, 1);

  return {
    dx: currentCenter.x - previousCenter.x,
    dy: currentCenter.y - previousCenter.y,
    scale,
    rotation,
    confidence,
  };
}
