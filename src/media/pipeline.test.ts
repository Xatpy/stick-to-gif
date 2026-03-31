// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeGif } from '../gif/decodeGif';
import { exportGif } from '../gif/exportGif';
import { decodeVideo } from './decodeVideo';
import type { DecodedGif, TrackingFrame } from '../types';

vi.mock('../render/drawComposedFrame', () => ({
  drawComposedFrame: vi.fn(),
}));

function createDecodedGif(): DecodedGif {
  return {
    name: 'demo.gif',
    width: 1,
    height: 1,
    sourceKind: 'gif',
    loopCount: 0,
    durationMs: 100,
    frameRate: undefined,
    frames: [
      {
        index: 0,
        delay: 100,
        blob: new Blob([new Uint8Array([0xff])], { type: 'image/png' }),
      },
    ],
  };
}

function createTrackingFrame(): TrackingFrame {
  return {
    frameIndex: 0,
    confidence: 1,
    region: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
    imageOverlay: null,
    textOverlay: null,
  };
}

describe('media pipeline', () => {
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  let createElementSpy: ReturnType<typeof vi.spyOn>;
  let requestAnimationFrameSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray([255, 0, 0, 255]),
      })),
    };

    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
    };

    const originalCreateElement = document.createElement.bind(document);
    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const tag = tagName.toLowerCase();

      if (tag === 'canvas') {
        return canvas as unknown as HTMLElement;
      }

      if (tag === 'video') {
        return originalCreateElement('video');
      }

      return originalCreateElement(tagName);
    });

    requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });

    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({
        close: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    createElementSpy.mockRestore();
    requestAnimationFrameSpy.mockRestore();
    vi.restoreAllMocks();

    if (originalCreateImageBitmap) {
      vi.stubGlobal('createImageBitmap', originalCreateImageBitmap);
    } else {
      vi.unstubAllGlobals();
    }
  });

  it('rejects MP4 files over the size limit', async () => {
    const file = new File([new Uint8Array(30 * 1024 * 1024 + 1)], 'big.mp4', {
      type: 'video/mp4',
    });

    await expect(decodeVideo(file)).rejects.toThrow('MP4 files must be 30 MB or smaller.');
  });

  it('surfaces an error for unreadable GIF input', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'broken.gif', {
      type: 'image/gif',
    });

    await expect(decodeGif(file)).rejects.toThrow();
  });

  it('throws when tracking output does not match the GIF frame count', async () => {
    const gif = createDecodedGif();

    await expect(
      exportGif({
        gif,
        overlay: null,
        trackingFrames: [],
      }),
    ).rejects.toThrow('Tracking output did not match the GIF frame count.');
  });

  it('returns a non-empty GIF blob on successful export', async () => {
    const gif = createDecodedGif();
    const blob = await exportGif({
      gif,
      overlay: null,
      trackingFrames: [createTrackingFrame()],
    });

    expect(blob.type).toBe('image/gif');
    expect(blob.size).toBeGreaterThan(6);
  });
});
