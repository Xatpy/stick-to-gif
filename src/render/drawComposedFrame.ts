import type { BlurStyle, OverlayTransform, TextOverlayStyle, TrackedRegion } from '../types';
import { drawTextOverlay } from './drawTextOverlay';

interface DrawOptions {
  context: CanvasRenderingContext2D;
  frame: ImageData;
  overlay?: CanvasImageSource | null;
  imageTransform?: OverlayTransform | null;
  textStyle?: TextOverlayStyle | null;
  textTransform?: OverlayTransform | null;
  blurRegion?: TrackedRegion | null;
  blurStyle?: BlurStyle | null;
}

interface ScratchCanvases {
  baseCanvas: HTMLCanvasElement;
  baseContext: CanvasRenderingContext2D;
  mosaicCanvas: HTMLCanvasElement;
  mosaicContext: CanvasRenderingContext2D;
}

const scratchCanvases = new WeakMap<HTMLCanvasElement, ScratchCanvases>();

function getScratchCanvases(targetCanvas: HTMLCanvasElement): ScratchCanvases {
  const existing = scratchCanvases.get(targetCanvas);
  if (existing) {
    return existing;
  }

  const baseCanvas = document.createElement('canvas');
  const baseContext = baseCanvas.getContext('2d');
  const mosaicCanvas = document.createElement('canvas');
  const mosaicContext = mosaicCanvas.getContext('2d');

  if (!baseContext || !mosaicContext) {
    throw new Error('Unable to create a shared render context.');
  }

  const created = { baseCanvas, baseContext, mosaicCanvas, mosaicContext };
  scratchCanvases.set(targetCanvas, created);
  return created;
}

export function drawComposedFrame({
  context,
  frame,
  overlay,
  imageTransform,
  textStyle,
  textTransform,
  blurRegion,
  blurStyle,
}: DrawOptions) {
  const { baseCanvas, baseContext, mosaicCanvas, mosaicContext } = getScratchCanvases(context.canvas);

  if (baseCanvas.width !== frame.width || baseCanvas.height !== frame.height) {
    baseCanvas.width = frame.width;
    baseCanvas.height = frame.height;
  }

  baseContext.putImageData(frame, 0, 0);
  context.clearRect(0, 0, frame.width, frame.height);
  context.drawImage(baseCanvas, 0, 0);

  // Blur/mosaic: pixelate the tracked region
  if (blurRegion && blurStyle) {
    const { x, y, width, height } = blurRegion;
    const rx = Math.max(0, Math.round(x));
    const ry = Math.max(0, Math.round(y));
    const rw = Math.min(Math.round(width), frame.width - rx);
    const rh = Math.min(Math.round(height), frame.height - ry);

    if (rw > 0 && rh > 0) {
      // Mosaic: downscale then upscale with nearest-neighbor
      const blockSize = Math.max(2, Math.round(4 + blurStyle.intensity * 20));
      const smallW = Math.max(1, Math.ceil(rw / blockSize));
      const smallH = Math.max(1, Math.ceil(rh / blockSize));

      if (mosaicCanvas.width !== smallW || mosaicCanvas.height !== smallH) {
        mosaicCanvas.width = smallW;
        mosaicCanvas.height = smallH;
      } else {
        mosaicContext.clearRect(0, 0, smallW, smallH);
      }

      // Downscale
      mosaicContext.imageSmoothingEnabled = true;
      mosaicContext.drawImage(context.canvas, rx, ry, rw, rh, 0, 0, smallW, smallH);

      // Upscale with nearest-neighbor (pixelated)
      context.save();
      context.imageSmoothingEnabled = false;
      context.clearRect(rx, ry, rw, rh);
      context.drawImage(baseCanvas, rx, ry, rw, rh, rx, ry, rw, rh);
      context.drawImage(mosaicCanvas, 0, 0, smallW, smallH, rx, ry, rw, rh);
      context.restore();
    }
  }

  if (overlay && imageTransform) {
    context.save();
    context.translate(imageTransform.x, imageTransform.y);
    context.rotate(imageTransform.rotation);
    context.drawImage(
      overlay,
      -imageTransform.width / 2,
      -imageTransform.height / 2,
      imageTransform.width,
      imageTransform.height,
    );
    context.restore();
  }

  if (textStyle && textTransform) {
    drawTextOverlay(context, textTransform, textStyle);
  }
}
