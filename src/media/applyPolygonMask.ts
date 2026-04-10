import type { Point } from '../types';
import { clamp } from '../utils/math';

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('Unable to create that cutout.'));
    }, 'image/png');
  });
}

export async function applyPolygonMask(
  imageBitmap: ImageBitmap,
  polygon: Point[],
): Promise<Blob> {
  if (polygon.length < 3) {
    throw new Error('Add at least 3 points to create a cutout.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to create that cutout.');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = 'destination-in';
  context.beginPath();
  context.moveTo(
    clamp(polygon[0]!.x, 0, canvas.width),
    clamp(polygon[0]!.y, 0, canvas.height),
  );

  for (let index = 1; index < polygon.length; index += 1) {
    const point = polygon[index]!;
    context.lineTo(
      clamp(point.x, 0, canvas.width),
      clamp(point.y, 0, canvas.height),
    );
  }

  context.closePath();
  context.fillStyle = '#ffffff';
  context.fill();
  context.globalCompositeOperation = 'source-over';

  return canvasToBlob(canvas);
}
