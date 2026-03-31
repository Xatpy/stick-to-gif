import type { DecodedGif, Point, Rect } from '../types';
import { clampRectToBounds } from './math';

export function getPixel(frame: ImageData, x: number, y: number) {
  const offset = (y * frame.width + x) * 4;
  return {
    r: frame.data[offset] ?? 0,
    g: frame.data[offset + 1] ?? 0,
    b: frame.data[offset + 2] ?? 0,
  };
}

export function colorDistance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
) {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

export function estimateLocalBackground(
  frame: ImageData,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let x = x0; x <= x1; x += 1) {
    const top = getPixel(frame, x, y0);
    const bottom = getPixel(frame, x, y1);
    r += top.r + bottom.r;
    g += top.g + bottom.g;
    b += top.b + bottom.b;
    count += 2;
  }

  for (let y = y0 + 1; y < y1; y += 1) {
    const left = getPixel(frame, x0, y);
    const right = getPixel(frame, x1, y);
    r += left.r + right.r;
    g += left.g + right.g;
    b += left.b + right.b;
    count += 2;
  }

  return count
    ? { r: r / count, g: g / count, b: b / count }
    : { r: 0, g: 0, b: 0 };
}

export function refineRectFromLocalRegion(frame: ImageData, center: Point, seedRect: Rect): Rect | null {
  const searchPadding = Math.max(14, Math.round(seedRect.width * 0.45));
  const x0 = Math.max(0, Math.floor(seedRect.x - searchPadding));
  const y0 = Math.max(0, Math.floor(seedRect.y - searchPadding));
  const x1 = Math.min(frame.width - 1, Math.ceil(seedRect.x + seedRect.width + searchPadding));
  const y1 = Math.min(frame.height - 1, Math.ceil(seedRect.y + seedRect.height + searchPadding));
  const windowWidth = x1 - x0 + 1;
  const windowHeight = y1 - y0 + 1;

  if (windowWidth < 8 || windowHeight < 8) {
    return null;
  }

  const seedX = Math.max(x0, Math.min(x1, Math.round(center.x)));
  const seedY = Math.max(y0, Math.min(y1, Math.round(center.y)));
  const seedColor = getPixel(frame, seedX, seedY);
  const backgroundColor = estimateLocalBackground(frame, x0, y0, x1, y1);
  const seedContrast = colorDistance(seedColor, backgroundColor);

  if (seedContrast < 36) {
    return null;
  }

  const visited = new Uint8Array(windowWidth * windowHeight);
  const queueX = new Int16Array(windowWidth * windowHeight);
  const queueY = new Int16Array(windowWidth * windowHeight);
  const seedTolerance = Math.min(140, Math.max(52, seedContrast * 0.72));
  const bgTolerance = Math.max(28, seedContrast * 0.45);

  let head = 0;
  let tail = 0;
  queueX[tail] = seedX;
  queueY[tail] = seedY;
  tail += 1;
  visited[(seedY - y0) * windowWidth + (seedX - x0)] = 1;

  let minX = seedX;
  let maxX = seedX;
  let minY = seedY;
  let maxY = seedY;
  let count = 0;

  while (head < tail) {
    const x = queueX[head]!;
    const y = queueY[head]!;
    head += 1;

    const pixel = getPixel(frame, x, y);
    const distanceFromSeed = colorDistance(pixel, seedColor);
    const distanceFromBackground = colorDistance(pixel, backgroundColor);

    if (distanceFromSeed > seedTolerance || distanceFromBackground < bgTolerance) {
      continue;
    }

    count += 1;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;

    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as const;

    for (const [nextX, nextY] of neighbors) {
      if (nextX < x0 || nextX > x1 || nextY < y0 || nextY > y1) {
        continue;
      }
      const localIndex = (nextY - y0) * windowWidth + (nextX - x0);
      if (visited[localIndex]) {
        continue;
      }
      visited[localIndex] = 1;
      queueX[tail] = nextX;
      queueY[tail] = nextY;
      tail += 1;
    }
  }

  const regionWidth = maxX - minX + 1;
  const regionHeight = maxY - minY + 1;
  const searchArea = windowWidth * windowHeight;

  if (
    count < 40 ||
    regionWidth < 8 ||
    regionHeight < 8 ||
    count > searchArea * 0.6
  ) {
    return null;
  }

  const padding = Math.max(6, Math.round(Math.max(regionWidth, regionHeight) * 0.18));
  return clampRectToBounds(
    {
      x: minX - padding,
      y: minY - padding,
      width: regionWidth + padding * 2,
      height: regionHeight + padding * 2,
    },
    frame.width,
    frame.height,
  );
}

export function getDefaultTargetRect(gif: DecodedGif, frame: ImageData, center: Point): Rect {
  const minDimension = Math.min(gif.width, gif.height);
  const candidateRatios = [0.14, 0.18, 0.22, 0.28, 0.34];
  const grayscale = new Float32Array(frame.width * frame.height);

  for (let index = 0; index < grayscale.length; index += 1) {
    const pixelOffset = index * 4;
    grayscale[index] =
      frame.data[pixelOffset]! * 0.299 +
      frame.data[pixelOffset + 1]! * 0.587 +
      frame.data[pixelOffset + 2]! * 0.114;
  }

  const scoreRect = (rect: Rect) => {
    const x0 = Math.max(1, Math.floor(rect.x));
    const y0 = Math.max(1, Math.floor(rect.y));
    const x1 = Math.min(frame.width - 1, Math.ceil(rect.x + rect.width));
    const y1 = Math.min(frame.height - 1, Math.ceil(rect.y + rect.height));

    let edgeSum = 0;
    let strongEdges = 0;
    let samples = 0;

    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const idx = y * frame.width + x;
        const gx = Math.abs(grayscale[idx + 1]! - grayscale[idx - 1]!);
        const gy = Math.abs(grayscale[idx + frame.width]! - grayscale[idx - frame.width]!);
        const energy = gx + gy;
        edgeSum += energy;
        strongEdges += energy > 42 ? 1 : 0;
        samples += 1;
      }
    }

    if (!samples) {
      return Number.NEGATIVE_INFINITY;
    }

    const edgeDensity = edgeSum / samples;
    const structureRatio = strongEdges / samples;
    const areaPenalty = rect.width / minDimension;

    return edgeDensity + structureRatio * 36 - areaPenalty * 12;
  };

  let bestRect = clampRectToBounds(
    {
      x: center.x - minDimension * 0.18 / 2,
      y: center.y - minDimension * 0.18 / 2,
      width: minDimension * 0.18,
      height: minDimension * 0.18,
    },
    gif.width,
    gif.height,
  );
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const ratio of candidateRatios) {
    const size = minDimension * ratio;
    const rect = clampRectToBounds(
      { x: center.x - size / 2, y: center.y - size / 2, width: size, height: size },
      gif.width,
      gif.height,
    );
    const score = scoreRect(rect);

    if (score > bestScore) {
      bestScore = score;
      bestRect = rect;
    }
  }

  return refineRectFromLocalRegion(frame, center, bestRect) ?? bestRect;
}
