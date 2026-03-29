import { drawComposedFrame } from '../render/drawComposedFrame';
import type { DecodedGif, OverlayAsset, TrackingFrame } from '../types';

interface ExportOptions {
  gif: DecodedGif;
  overlay: OverlayAsset;
  trackingFrames: TrackingFrame[];
  onProgress?: (progress: number) => void;
}

interface EncodedWebpFrame {
  width: number;
  height: number;
  duration: number;
  hasAlpha: boolean;
  chunks: Uint8Array;
}

const textEncoder = new TextEncoder();

function createChunk(type: string, payload: Uint8Array) {
  const paddedLength = payload.length + (payload.length % 2);
  const chunk = new Uint8Array(8 + paddedLength);
  chunk.set(textEncoder.encode(type), 0);
  new DataView(chunk.buffer).setUint32(4, payload.length, true);
  chunk.set(payload, 8);
  return chunk;
}

function createRiffWebp(chunks: Uint8Array[]) {
  const totalLength = 12 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(totalLength);
  out.set(textEncoder.encode('RIFF'), 0);
  new DataView(out.buffer).setUint32(4, totalLength - 8, true);
  out.set(textEncoder.encode('WEBP'), 8);

  let offset = 12;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }

  return out;
}

function writeUint24(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >> 8) & 0xff;
  target[offset + 2] = (value >> 16) & 0xff;
}

function parseWebpFrameChunks(bytes: Uint8Array) {
  const riff = new TextDecoder().decode(bytes.subarray(0, 4));
  const webp = new TextDecoder().decode(bytes.subarray(8, 12));

  if (riff !== 'RIFF' || webp !== 'WEBP') {
    throw new Error('Canvas did not produce a valid WebP frame.');
  }

  const chunks: Uint8Array[] = [];
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const type = new TextDecoder().decode(bytes.subarray(offset, offset + 4));
    const size = new DataView(
      bytes.buffer,
      bytes.byteOffset + offset + 4,
      4,
    ).getUint32(0, true);
    const totalSize = 8 + size + (size % 2);
    const chunk = bytes.slice(offset, offset + totalSize);

    if (type === 'ALPH' || type === 'VP8 ' || type === 'VP8L') {
      chunks.push(chunk);
    }

    offset += totalSize;
  }

  if (chunks.length === 0) {
    throw new Error('Unable to extract WebP image data for animation.');
  }

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let outOffset = 0;

  for (const chunk of chunks) {
    result.set(chunk, outOffset);
    outOffset += chunk.length;
  }

  return result;
}

function hasTransparentPixels(rgba: Uint8ClampedArray) {
  for (let index = 3; index < rgba.length; index += 4) {
    if (rgba[index] !== 255) {
      return true;
    }
  }
  return false;
}

async function canvasToWebpBytes(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (nextBlob) => {
        if (!nextBlob) {
          reject(new Error('This browser could not encode a WebP frame.'));
          return;
        }
        resolve(nextBlob);
      },
      'image/webp',
      0.96,
    );
  });

  return new Uint8Array(await blob.arrayBuffer());
}

function buildAnimatedWebp(
  width: number,
  height: number,
  frames: EncodedWebpFrame[],
  loopCount = 0,
) {
  const hasAlpha = frames.some((frame) => frame.hasAlpha);
  const vp8xPayload = new Uint8Array(10);
  vp8xPayload[0] = (hasAlpha ? 0x10 : 0) | 0x02;
  writeUint24(vp8xPayload, 4, width - 1);
  writeUint24(vp8xPayload, 7, height - 1);

  const animPayload = new Uint8Array(6);
  new DataView(animPayload.buffer).setUint32(0, 0x00000000, true);
  new DataView(animPayload.buffer).setUint16(4, loopCount, true);

  const anmfChunks = frames.map((frame) => {
    const header = new Uint8Array(16);
    writeUint24(header, 0, 0);
    writeUint24(header, 3, 0);
    writeUint24(header, 6, frame.width - 1);
    writeUint24(header, 9, frame.height - 1);
    writeUint24(header, 12, Math.max(20, Math.min(frame.duration, 0xffffff)));
    header[15] = 0;

    const payload = new Uint8Array(header.length + frame.chunks.length);
    payload.set(header, 0);
    payload.set(frame.chunks, header.length);
    return createChunk('ANMF', payload);
  });

  const bytes = createRiffWebp([
    createChunk('VP8X', vp8xPayload),
    createChunk('ANIM', animPayload),
    ...anmfChunks,
  ]);

  return new Blob([bytes], { type: 'image/webp' });
}

export async function exportAnimatedWebp({
  gif,
  overlay,
  trackingFrames,
  onProgress,
}: ExportOptions) {
  const canvas = document.createElement('canvas');
  canvas.width = gif.width;
  canvas.height = gif.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    throw new Error('Unable to create a WebP export canvas.');
  }

  const frames: EncodedWebpFrame[] = [];

  for (let index = 0; index < gif.frames.length; index += 1) {
    const frame = gif.frames[index]!;
    const trackingFrame = trackingFrames[index];

    if (!trackingFrame) {
      throw new Error('Tracking output did not match the GIF frame count.');
    }

    drawComposedFrame({
      context,
      frame: frame.imageData,
      overlay: overlay.source,
      transform: trackingFrame.overlay,
    });

    const rgba = context.getImageData(0, 0, gif.width, gif.height).data;
    const webpBytes = await canvasToWebpBytes(canvas);

    frames.push({
      width: gif.width,
      height: gif.height,
      duration: frame.delay,
      hasAlpha: hasTransparentPixels(rgba),
      chunks: parseWebpFrameChunks(webpBytes),
    });

    onProgress?.((index + 1) / gif.frames.length);

    if (index % 2 === 0) {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    }
  }

  return buildAnimatedWebp(gif.width, gif.height, frames, gif.loopCount);
}
