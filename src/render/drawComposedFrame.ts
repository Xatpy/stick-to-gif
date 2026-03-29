import type { OverlayTransform } from '../types';

interface DrawOptions {
  context: CanvasRenderingContext2D;
  frame: ImageData;
  overlay: CanvasImageSource;
  transform: OverlayTransform;
}

const baseCanvas = document.createElement('canvas');
const baseContext = baseCanvas.getContext('2d');

export function drawComposedFrame({
  context,
  frame,
  overlay,
  transform,
}: DrawOptions) {
  if (!baseContext) {
    throw new Error('Unable to create a shared render context.');
  }

  if (baseCanvas.width !== frame.width || baseCanvas.height !== frame.height) {
    baseCanvas.width = frame.width;
    baseCanvas.height = frame.height;
  }

  baseContext.putImageData(frame, 0, 0);
  context.clearRect(0, 0, frame.width, frame.height);
  context.drawImage(baseCanvas, 0, 0);

  context.save();
  context.translate(transform.x, transform.y);
  context.rotate(transform.rotation);
  context.drawImage(
    overlay,
    -transform.width / 2,
    -transform.height / 2,
    transform.width,
    transform.height,
  );
  context.restore();
}
