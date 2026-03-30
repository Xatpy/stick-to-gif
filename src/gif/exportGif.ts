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
    const palette = quantize(rgba, 256);
    const indexedFrame = applyPalette(rgba, palette);

    encoder.writeFrame(indexedFrame, gif.width, gif.height, {
      palette,
      delay: frame.delay,
      repeat: 0,
    });

    onProgress?.((index + 1) / gif.frames.length);

    if (index % 4 === 0) {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    }
  }

  encoder.finish();

  return new Blob([new Uint8Array(encoder.bytesView())], { type: 'image/gif' });
}
