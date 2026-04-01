import { emitDebug, type DebugReporter } from '../lib/debug';
import type {
  DecodedGif,
  OverlayTransform,
  ProgressUpdate,
  Rect,
  TextOverlayStyle,
  TrackingFrame,
} from '../types';
import TrackerWorker from './tracker.worker?worker';
import type { TrackerConfig } from './tracker.worker';
import { isInternalDebugEnabled } from '../lib/internalDebug';
import { getAbsoluteAppAssetUrl, getRuntimePlatform } from '../lib/platform';

export { computeOverlayLayout, buildOverlayFromRegion } from './overlayLayout';

interface TrackOptions {
  gif: DecodedGif;
  initialRegion: Rect;
  initialImageOverlay?: OverlayTransform | null;
  initialTextOverlay?: OverlayTransform | null;
  textStyle?: TextOverlayStyle | null;
  onProgress?: (update: ProgressUpdate) => void;
  debugReporter?: DebugReporter;
}

export async function trackObject({
  gif,
  initialRegion,
  initialImageOverlay,
  initialTextOverlay,
  textStyle,
  onProgress,
  debugReporter,
}: TrackOptions): Promise<TrackingFrame[]> {
  const verboseLogging = isInternalDebugEnabled();
  const verboseLog = (...args: unknown[]) => {
    if (verboseLogging) {
      console.log(...args);
    }
  };
  const verboseError = (...args: unknown[]) => {
    if (verboseLogging) {
      console.error(...args);
    }
  };

  verboseLog('[StickToGif] trackObject start', {
    frameCount: gif.frames.length,
    width: gif.width,
    height: gif.height,
    initialRegion,
    baseUrl: import.meta.env.BASE_URL,
    openCvUrl: getAbsoluteAppAssetUrl('opencv.js'),
    platform: getRuntimePlatform(),
  });
  emitDebug(
    debugReporter,
    'info',
    `Track requested for ${gif.frames.length} frames at ${gif.width}x${gif.height} via Web Worker on ${getRuntimePlatform()}.`,
  );

  return new Promise((resolve, reject) => {
    try {
      // Setup the classic worker via Vite loader
      verboseLog('[StickToGif] constructing TrackerWorker');
      const worker = new TrackerWorker();
      verboseLog('[StickToGif] TrackerWorker constructed');

      worker.onmessage = async (e) => {
        const { type, progress, message, results, id, blob, width, height } = e.data;
        verboseLog('[StickToGif] worker -> main', {
          type,
          progress,
          message,
          id,
          width,
          height,
          resultCount: Array.isArray(results) ? results.length : undefined,
        });

        if (type === 'REQUEST_FRAME') {
          try {
            verboseLog('[StickToGif] REQUEST_FRAME', { id, width, height, size: blob?.size, mime: blob?.type });
            const bitmap = await createImageBitmap(blob);
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(bitmap, 0, 0);
            bitmap.close();
            const imageData = ctx.getImageData(0, 0, width, height);
            verboseLog('[StickToGif] RPC_FRAME_RESPONSE', { id, byteLength: imageData.data.buffer.byteLength });
            worker.postMessage({ type: 'RPC_FRAME_RESPONSE', id, imageData }, [imageData.data.buffer]);
          } catch (err) {
            emitDebug(debugReporter, 'error', `Main thread fallback decode failed: ${err}`);
            verboseError('[StickToGif] Main thread fallback decode failed', err);
            worker.terminate();
            reject(new Error('Failed to decode fallback frame.'));
          }
          return;
        }

        if (type === 'PROGRESS') {
          onProgress?.({ progress, message });
        } else if (type === 'COMPLETE') {
          emitDebug(debugReporter, 'info', 'Tracking complete.');
          onProgress?.({ progress: 1, message: 'Tracking complete' });
          worker.terminate();
          resolve(results);
        } else if (type === 'ERROR') {
          emitDebug(debugReporter, 'error', `Worker tracking error: ${message}`);
          worker.terminate();
          reject(new Error(message));
        }
      };

      worker.onerror = (e) => {
        emitDebug(debugReporter, 'error', `Worker failed to load or crashed: ${e.message}`);
        verboseError('[StickToGif] worker.onerror', e);
        worker.terminate();
        reject(new Error(`Tracker worker crashed or failed to load on ${getRuntimePlatform()}.`));
      };

      // Construct and post config
      const config: TrackerConfig = {
        openCvUrl: getAbsoluteAppAssetUrl('opencv.js'),
        debugLogging: verboseLogging,
        frames: gif.frames.map((f) => f.blob),
        width: gif.width,
        height: gif.height,
        initialRegion,
        initialImageOverlay: initialImageOverlay ?? null,
        initialTextOverlay: initialTextOverlay ?? null,
        textEnabled: !!(textStyle?.enabled && textStyle.text.trim()),
      };

      verboseLog('[StickToGif] posting CMD_START', {
        openCvUrl: config.openCvUrl,
        frameCount: config.frames.length,
        textEnabled: config.textEnabled,
      });
      worker.postMessage({ type: 'CMD_START', config });
    } catch (e) {
      emitDebug(debugReporter, 'error', 'Failed to instantiate the Web Worker.');
      verboseError('[StickToGif] Failed to instantiate worker', e);
      reject(e);
    }
  });
}
