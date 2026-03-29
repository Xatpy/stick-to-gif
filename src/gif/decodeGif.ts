import { decompressFrames, parseGIF } from 'gifuct-js';
import type { DecodedGif } from '../types';

interface ParsedFrame {
  delay: number;
  disposalType: number;
  dims: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  patch: Uint8ClampedArray;
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    throw new Error('Unable to create a 2D canvas context in this browser.');
  }

  return { canvas, context };
}

export async function decodeGif(file: File): Promise<DecodedGif> {
  const buffer = await file.arrayBuffer();
  const parsed = parseGIF(buffer);
  const rawFrames = decompressFrames(parsed, true) as ParsedFrame[];
  const parsedWithExtensions = parsed as typeof parsed & {
    appExtensions?: Array<{ identifier?: string; loops?: number }>;
  };

  const width = parsed.lsd.width;
  const height = parsed.lsd.height;
  const backgroundColor = parsed.gct?.[parsed.lsd.backgroundColorIndex] ?? [0, 0, 0];
  const loopCount =
    parsedWithExtensions.appExtensions?.find(
      (extension) => extension.identifier === 'NETSCAPE',
    )
      ?.loops ?? 0;

  const { context } = createCanvas(width, height);
  const { canvas: patchCanvas, context: patchContext } = createCanvas(width, height);
  const frames = [];
  let restoreImageData: ImageData | null = null;

  for (let index = 0; index < rawFrames.length; index += 1) {
    const frame = rawFrames[index]!;

    if (frame.disposalType === 3) {
      restoreImageData = context.getImageData(0, 0, width, height);
    } else {
      restoreImageData = null;
    }

    const patch = new ImageData(
      new Uint8ClampedArray(frame.patch),
      frame.dims.width,
      frame.dims.height,
    );
    patchContext.clearRect(0, 0, patchCanvas.width, patchCanvas.height);
    patchContext.putImageData(patch, frame.dims.left, frame.dims.top);
    context.drawImage(patchCanvas, 0, 0);

    frames.push({
      index,
      delay: Math.max(20, frame.delay || 100),
      imageData: context.getImageData(0, 0, width, height),
    });

    if (frame.disposalType === 2) {
      context.save();
      context.fillStyle = `rgb(${backgroundColor[0]}, ${backgroundColor[1]}, ${backgroundColor[2]})`;
      context.fillRect(
        frame.dims.left,
        frame.dims.top,
        frame.dims.width,
        frame.dims.height,
      );
      context.restore();
    } else if (frame.disposalType === 3 && restoreImageData) {
      context.putImageData(restoreImageData, 0, 0);
    }
  }

  if (frames.length === 0) {
    throw new Error('This GIF could not be decoded into frames.');
  }

  return {
    name: file.name,
    width,
    height,
    loopCount,
    frames,
  };
}
