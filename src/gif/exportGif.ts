import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { drawComposedFrame } from '../render/drawComposedFrame';
import type { BlurStyle, DecodedGif, OverlayAsset, TextOverlayStyle, TrackingFrame } from '../types';

interface ExportOptions {
  gif: DecodedGif;
  overlay: OverlayAsset | null;
  textStyle?: TextOverlayStyle | null;
  trackingFrames: TrackingFrame[];
  blurStyle?: BlurStyle | null;
  onProgress?: (progress: number) => void;
}

async function nextFrame() {
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function sampleFramePixels(rgba: Uint8ClampedArray, pixelStep: number) {
  const sampledPixelCount = Math.ceil(rgba.length / (pixelStep * 4));
  const sampled = new Uint8ClampedArray(sampledPixelCount * 4);
  let offset = 0;

  for (let index = 0; index < rgba.length; index += pixelStep * 4) {
    sampled[offset] = rgba[index]!;
    sampled[offset + 1] = rgba[index + 1]!;
    sampled[offset + 2] = rgba[index + 2]!;
    sampled[offset + 3] = rgba[index + 3]!;
    offset += 4;
  }

  return sampled.subarray(0, offset);
}

async function buildGlobalPalette(
  gif: DecodedGif,
  trackingFrames: TrackingFrame[],
  overlay: OverlayAsset | null,
  textStyle?: TextOverlayStyle | null,
  blurStyle?: BlurStyle | null,
) {
  const canvas = document.createElement('canvas');
  canvas.width = gif.width;
  canvas.height = gif.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    throw new Error('Unable to create a palette canvas.');
  }

  const frameStride = gif.frames.length > 120 ? 2 : 1;
  const pixelStep = gif.width * gif.height > 160_000 ? 4 : 2;
  const samples: Uint8ClampedArray[] = [];

  for (let index = 0; index < gif.frames.length; index += frameStride) {
    const frame = gif.frames[index]!;
    const trackingFrame = trackingFrames[index];

    if (!trackingFrame) {
      throw new Error('Tracking output did not match the GIF frame count.');
    }

    drawComposedFrame({
      context,
      frame: frame.imageData,
      overlay: overlay?.source,
      imageTransform: trackingFrame.imageOverlay,
      textStyle,
      textTransform: trackingFrame.textOverlay,
      blurRegion: blurStyle ? trackingFrame.region : null,
      blurStyle,
    });

    const rgba = context.getImageData(0, 0, gif.width, gif.height).data;
    samples.push(sampleFramePixels(rgba, pixelStep));
  }

  const totalLength = samples.reduce((sum, rgba) => sum + rgba.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;

  for (const rgba of samples) {
    combined.set(rgba, offset);
    offset += rgba.length;
  }

  await nextFrame();
  return quantize(combined, 256);
}

export async function exportGif({
  gif,
  overlay,
  textStyle,
  trackingFrames,
  blurStyle,
  onProgress,
}: ExportOptions) {
  const canvas = document.createElement('canvas');
  canvas.width = gif.width;
  canvas.height = gif.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    throw new Error('Unable to create an export canvas.');
  }

  const encoder = GIFEncoder();
  const palette = await buildGlobalPalette(gif, trackingFrames, overlay, textStyle, blurStyle);

  for (let index = 0; index < gif.frames.length; index += 1) {
    const frame = gif.frames[index]!;
    const trackingFrame = trackingFrames[index];

    if (!trackingFrame) {
      throw new Error('Tracking output did not match the GIF frame count.');
    }

    drawComposedFrame({
      context,
      frame: frame.imageData,
      overlay: overlay?.source,
      imageTransform: trackingFrame.imageOverlay,
      textStyle,
      textTransform: trackingFrame.textOverlay,
      blurRegion: blurStyle ? trackingFrame.region : null,
      blurStyle,
    });

    const rgba = context.getImageData(0, 0, gif.width, gif.height).data;
    const indexedFrame = applyPalette(rgba, palette);

    encoder.writeFrame(indexedFrame, gif.width, gif.height, {
      palette,
      delay: frame.delay,
      repeat: 0,
    });

    onProgress?.((index + 1) / gif.frames.length);

    if (index % 4 === 0) {
      await nextFrame();
    }
  }

  encoder.finish();

  return new Blob([new Uint8Array(encoder.bytesView())], { type: 'image/gif' });
}
