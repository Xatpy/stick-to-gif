import type { DecodedGif, ProgressUpdate } from '../types';

const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
const MAX_VIDEO_DURATION_SECONDS = 15;
const TARGET_VIDEO_FPS = 15;
const FRAME_DELAY_MS = Math.round(1000 / TARGET_VIDEO_FPS);

interface DecodeVideoOptions {
  onProgress?: (update: ProgressUpdate) => void;
}

function waitForEvent(target: EventTarget, eventName: string) {
  return new Promise<void>((resolve, reject) => {
    const handleResolve = () => {
      cleanup();
      resolve();
    };
    const handleReject = () => {
      cleanup();
      reject(new Error('This MP4 could not be decoded in this browser.'));
    };
    const cleanup = () => {
      target.removeEventListener(eventName, handleResolve);
      target.removeEventListener('error', handleReject);
    };

    target.addEventListener(eventName, handleResolve, { once: true });
    target.addEventListener('error', handleReject, { once: true });
  });
}

async function seekTo(video: HTMLVideoElement, time: number) {
  const clampedTime = Math.max(0, Math.min(time, Math.max(0, video.duration - 0.001)));

  if (Math.abs(video.currentTime - clampedTime) < 0.001) {
    return;
  }

  const seekPromise = waitForEvent(video, 'seeked');
  video.currentTime = clampedTime;
  await seekPromise;
}

async function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas could not produce a blob'));
      },
      type,
      quality,
    );
  });
}

export async function decodeVideo(
  file: File,
  { onProgress }: DecodeVideoOptions = {},
): Promise<DecodedGif> {
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error('MP4 files must be 30 MB or smaller.');
  }

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;

  try {
    onProgress?.({
      progress: 0.12,
      message: 'Reading MP4 metadata',
    });

    await waitForEvent(video, 'loadedmetadata');

    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error('This MP4 does not contain a readable duration.');
    }
    if (video.duration > MAX_VIDEO_DURATION_SECONDS) {
      throw new Error('MP4 clips must be 15 seconds or shorter.');
    }
    if (video.videoWidth <= 0 || video.videoHeight <= 0) {
      throw new Error('This MP4 does not contain readable video dimensions.');
    }

    onProgress?.({
      progress: 0.18,
      message: 'Preparing video frames',
    });

    await waitForEvent(video, 'loadeddata');

    const width = video.videoWidth;
    const height = video.videoHeight;
    const durationMs = Math.round(video.duration * 1000);
    const frameCount = Math.max(1, Math.min(Math.ceil(video.duration * TARGET_VIDEO_FPS), MAX_VIDEO_DURATION_SECONDS * TARGET_VIDEO_FPS));
    const maxTimestamp = Math.max(0, video.duration - 1 / 120);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (!context) {
      throw new Error('Unable to create a canvas for MP4 decoding.');
    }

    const frames: DecodedGif['frames'] = [];

    for (let index = 0; index < frameCount; index += 1) {
      const timestamp = Math.min(index / TARGET_VIDEO_FPS, maxTimestamp);

      if (index > 0) {
        await seekTo(video, timestamp);
      }

      context.clearRect(0, 0, width, height);
      context.drawImage(video, 0, 0, width, height);
      const blob = await canvasToBlob(canvas);
      frames.push({
        index,
        delay: FRAME_DELAY_MS,
        blob,
      });

      onProgress?.({
        progress: 0.18 + ((index + 1) / frameCount) * 0.78,
        message: `Sampling MP4 frames ${index + 1}/${frameCount}`,
      });

      if (index % 5 === 0) {
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        });
      }
    }

    return {
      name: file.name,
      width,
      height,
      sourceKind: 'video',
      loopCount: 0,
      durationMs,
      frameRate: TARGET_VIDEO_FPS,
      frames,
    };
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}
