import type { Rect } from '../types';
import { clampRectToBounds } from '../utils/math';

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('Unable to crop that image.'));
    }, 'image/png');
  });
}

export function normalizeCropRect(rect: Rect, width: number, height: number) {
  const bounded = clampRectToBounds(rect, width, height);
  const x = Math.max(0, Math.floor(bounded.x));
  const y = Math.max(0, Math.floor(bounded.y));
  const right = Math.min(width, Math.ceil(bounded.x + bounded.width));
  const bottom = Math.min(height, Math.ceil(bounded.y + bounded.height));
  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

export function isFullImageCrop(rect: Rect, width: number, height: number) {
  const normalized = normalizeCropRect(rect, width, height);
  return (
    normalized.x === 0 &&
    normalized.y === 0 &&
    normalized.width === width &&
    normalized.height === height
  );
}

export async function cropImageBitmapToBlob(imageBitmap: ImageBitmap, rect: Rect): Promise<Blob> {
  const cropRect = normalizeCropRect(rect, imageBitmap.width, imageBitmap.height);
  const canvas = createCanvas(cropRect.width, cropRect.height);
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Unable to crop that image.');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.clearRect(0, 0, cropRect.width, cropRect.height);
  context.drawImage(
    imageBitmap,
    cropRect.x,
    cropRect.y,
    cropRect.width,
    cropRect.height,
    0,
    0,
    cropRect.width,
    cropRect.height,
  );

  return canvasToBlob(canvas);
}
