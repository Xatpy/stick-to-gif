/// <reference lib="webworker" />
import type cvType from '@techstark/opencv-js';
import {
  blendOverlay,
  blendRegion,
  clamp,
  clampRectToBounds,
} from '../utils/math';
import { extractPoints, estimateMotion, MotionEstimate } from './motion';
import type { Rect, TrackedRegion, OverlayTransform, TrackingFrame } from '../types';
import { buildOverlayFromRegion, computeOverlayLayout } from './overlayLayout';

type CvModule = typeof cvType & {
  minMaxLoc: (src: InstanceType<typeof cvType.Mat>, mask?: InstanceType<typeof cvType.Mat>) => MinMaxLocResult;
};
declare const self: DedicatedWorkerGlobalScope;
let workerDebugLogging = false;

const workerLog = (...args: unknown[]) => {
  if (workerDebugLogging) {
    console.log(...args);
  }
};

const workerWarn = (...args: unknown[]) => {
  if (workerDebugLogging) {
    console.warn(...args);
  }
};

const workerError = (...args: unknown[]) => {
  if (workerDebugLogging) {
    console.error(...args);
  }
};

type OpenCvReadyModule = CvModule & {
  then?: (callback: () => void) => unknown;
  calledRun?: boolean;
  onRuntimeInitialized?: () => void;
};

function finalizeOpenCvModule(module: OpenCvReadyModule): CvModule {
  if (typeof module.then === 'function') {
    try {
      Object.defineProperty(module, 'then', {
        value: undefined,
        configurable: true,
      });
    } catch {
      // Ignore if the property is not configurable in this runtime.
    }
  }

  return module as CvModule;
}

// Load OpenCV in the worker
let cvReady: Promise<CvModule> | null = null;
function loadOpenCvWorker(baseUrl: string): Promise<CvModule> {
  workerLog('[StickToGif worker] loadOpenCvWorker', { baseUrl, hasExistingPromise: !!cvReady });
  if (!cvReady) {
    cvReady = new Promise((resolve, reject) => {
      let settled = false;

      const finish = (module: OpenCvReadyModule) => {
        if (settled) return;
        settled = true;
        workerLog('[StickToGif worker] OpenCV ready');
        workerLog('[StickToGif worker] resolving cvReady promise');
        resolve(finalizeOpenCvModule(module));
      };

      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        workerError('[StickToGif worker] OpenCV load failed', error);
        reject(error);
      };

      const finishIfReady = () => {
        const candidate = (self as DedicatedWorkerGlobalScope & { cv?: OpenCvReadyModule }).cv;
        if (!candidate) {
          workerLog('[StickToGif worker] finishIfReady: self.cv missing');
          return false;
        }

        if (candidate.calledRun) {
          workerLog('[StickToGif worker] finishIfReady: calledRun already true');
          finish(candidate);
          return true;
        }

        if (typeof candidate.then === 'function') {
          workerLog('[StickToGif worker] finishIfReady: waiting on cv.then');
          candidate.then(() => {
            const loaded = (self as DedicatedWorkerGlobalScope & { cv?: OpenCvReadyModule }).cv;
            if (loaded) {
              finish(loaded);
            } else {
              fail(new Error('OpenCV loaded incorrectly in worker.'));
            }
          });
          return true;
        }

        workerLog('[StickToGif worker] finishIfReady: attaching onRuntimeInitialized');
        candidate.onRuntimeInitialized = () => finish(candidate);
        return true;
      };

      const scriptUrl = `${baseUrl}opencv.js`;
      workerLog('[StickToGif worker] scriptUrl', scriptUrl);
      const timeoutId = self.setTimeout(() => {
        fail(new Error('OpenCV took too long to initialize inside the worker.'));
      }, 15000);

      try {
        if (finishIfReady()) {
          workerLog('[StickToGif worker] OpenCV already present before load');
          self.clearTimeout(timeoutId);
          return;
        }

        try {
          workerLog('[StickToGif worker] trying importScripts', scriptUrl);
          self.importScripts(scriptUrl);
          workerLog('[StickToGif worker] importScripts returned');
          if (!finishIfReady()) {
            fail(new Error('OpenCV script loaded in worker but runtime did not initialize.'));
          }
        } catch (importErr) {
          workerWarn('[StickToGif worker] importScripts failed, falling back to fetch/eval', importErr);
          fetch(scriptUrl)
            .then((res) => {
              workerLog('[StickToGif worker] fetch response', { ok: res.ok, status: res.status, url: scriptUrl });
              if (!res.ok) {
                throw new Error(`Failed to load OpenCV worker script: ${res.status}`);
              }
              return res.text();
            })
            .then((code) => {
              workerLog('[StickToGif worker] evaluating fetched script', { length: code.length });
              (new Function(code)).call(self);
              workerLog('[StickToGif worker] fetched script evaluated');
              if (!finishIfReady()) {
                fail(new Error('OpenCV script evaluated in worker but runtime did not initialize.'));
              }
            })
            .catch(fail);
        }
      } catch (err) {
        fail(err);
      }

      Promise.resolve().then(() => {
        if (settled) {
          self.clearTimeout(timeoutId);
        }
      });
    });
  }
  return cvReady;
}

export interface TrackerConfig {
  baseUrl: string;
  debugLogging: boolean;
  frames: Blob[];
  width: number;
  height: number;
  initialRegion: Rect;
  initialImageOverlay: OverlayTransform | null;
  initialTextOverlay: OverlayTransform | null;
  textEnabled: boolean;
}

function imageDataToGray(cv: CvModule, imageData: ImageData) {
  const rgba = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
  rgba.delete();
  return gray;
}

function createMask(cv: CvModule, width: number, height: number, region: Rect) {
  const mask = new cv.Mat(height, width, cv.CV_8UC1, new cv.Scalar(0));
  const roi = clampRectToBounds(region, width, height);
  cv.rectangle(
    mask,
    new cv.Point(roi.x, roi.y),
    new cv.Point(roi.x + roi.width, roi.y + roi.height),
    new cv.Scalar(255, 255, 255, 255),
    -1,
  );
  return mask;
}

function detectFeaturePoints(cv: CvModule, gray: InstanceType<CvModule['Mat']>, region: Rect) {
  const mask = createMask(cv, gray.cols, gray.rows, region);
  const corners = new cv.Mat();

  cv.goodFeaturesToTrack(gray, corners, 40, 0.01, 6, mask, 5);
  mask.delete();

  return corners;
}

interface MinMaxLocResult {
  minVal: number;
  maxVal: number;
  minLoc: { x: number; y: number };
  maxLoc: { x: number; y: number };
}

function estimateTemplateMotion(
  cv: CvModule,
  previousGray: InstanceType<CvModule['Mat']>,
  currentGray: InstanceType<CvModule['Mat']>,
  region: TrackedRegion,
): MotionEstimate | null {
  const templateRect = clampRectToBounds(region, previousGray.cols, previousGray.rows);
  const templateX = Math.round(templateRect.x);
  const templateY = Math.round(templateRect.y);
  const templateWidth = Math.round(templateRect.width);
  const templateHeight = Math.round(templateRect.height);

  if (templateWidth < 12 || templateHeight < 12) {
    return null;
  }

  const searchPadding = Math.max(18, Math.round(Math.max(templateWidth, templateHeight) * 1.2));
  const searchRect = clampRectToBounds(
    {
      x: templateRect.x - searchPadding,
      y: templateRect.y - searchPadding,
      width: templateRect.width + searchPadding * 2,
      height: templateRect.height + searchPadding * 2,
    },
    currentGray.cols,
    currentGray.rows,
  );

  const searchX = Math.round(searchRect.x);
  const searchY = Math.round(searchRect.y);
  const searchWidth = Math.round(searchRect.width);
  const searchHeight = Math.round(searchRect.height);

  if (searchWidth < templateWidth || searchHeight < templateHeight) {
    return null;
  }

  const template = previousGray.roi(new cv.Rect(templateX, templateY, templateWidth, templateHeight));
  const search = currentGray.roi(new cv.Rect(searchX, searchY, searchWidth, searchHeight));
  const result = new cv.Mat();

  try {
    cv.matchTemplate(search, template, result, cv.TM_CCOEFF_NORMED);
    const mask = new cv.Mat();
    const { maxVal, maxLoc } = cv.minMaxLoc(result, mask);
    mask.delete();

    return {
      dx: searchX + maxLoc.x - templateX,
      dy: searchY + maxLoc.y - templateY,
      scale: 1,
      rotation: 0,
      confidence: clamp((maxVal - 0.35) / 0.65, 0, 1),
    };
  } finally {
    template.delete();
    search.delete();
    result.delete();
  }
}

let rpcIdCounter = 0;
const rpcResolvers = new Map<number, (imageData: ImageData) => void>();

async function decodeBlob(blob: Blob, width: number, height: number): Promise<ImageData> {
  workerLog('[StickToGif worker] decodeBlob', {
    hasOffscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    width,
    height,
    size: blob.size,
    type: blob.type,
  });
  if (typeof OffscreenCanvas !== 'undefined') {
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return ctx.getImageData(0, 0, width, height);
  }

  return new Promise((resolve) => {
    const id = ++rpcIdCounter;
    workerLog('[StickToGif worker] REQUEST_FRAME', { id, width, height, size: blob.size });
    rpcResolvers.set(id, resolve);
    self.postMessage({ type: 'REQUEST_FRAME', id, blob, width, height });
  });
}

self.onmessage = async (e: MessageEvent<any>) => {
  if (e.data.type === 'RPC_FRAME_RESPONSE') {
    const resolve = rpcResolvers.get(e.data.id);
    if (resolve) {
      workerLog('[StickToGif worker] RPC_FRAME_RESPONSE received', {
        id: e.data.id,
        width: e.data.imageData?.width,
        height: e.data.imageData?.height,
      });
      resolve(e.data.imageData);
      rpcResolvers.delete(e.data.id);
    }
    return;
  }

  if (e.data.type !== 'CMD_START') return;

  const {
    baseUrl,
    debugLogging,
    frames,
    width,
    height,
    initialRegion,
    initialImageOverlay,
    initialTextOverlay,
    textEnabled,
  } = e.data.config;
  workerDebugLogging = !!debugLogging;
  workerLog('[StickToGif worker] onmessage', e.data?.type);

  try {
    workerLog('[StickToGif worker] CMD_START', {
      baseUrl,
      frameCount: frames.length,
      width,
      height,
      initialRegion,
      textEnabled,
    });
    self.postMessage({ type: 'PROGRESS', progress: 0.03, message: 'Loading OpenCV runtime in worker' });
    workerLog('[StickToGif worker] awaiting loadOpenCvWorker');
    const cv = await loadOpenCvWorker(baseUrl);
    workerLog('[StickToGif worker] OpenCV loaded, proceeding');
    self.postMessage({ type: 'PROGRESS', progress: 0.08, message: 'Preparing first frame for tracking' });
    workerLog('[StickToGif worker] posted PROGRESS 0.08');

    const region = clampRectToBounds(initialRegion, width, height);
    workerLog('[StickToGif worker] clamped initial region', region);
    const baselineRegion: TrackedRegion = { ...region, rotation: 0 };
    const imageRelativeLayout = initialImageOverlay
      ? computeOverlayLayout(region, initialImageOverlay)
      : null;
    const textRelativeLayout =
      initialTextOverlay && textEnabled
        ? computeOverlayLayout(region, initialTextOverlay)
        : null;

    const results: TrackingFrame[] = [
      {
        frameIndex: 0,
        confidence: 1,
        region: baselineRegion,
        imageOverlay: initialImageOverlay ?? null,
        textOverlay: textRelativeLayout ? initialTextOverlay ?? null : null,
      },
    ];
    workerLog('[StickToGif worker] seeded results[0]');

    workerLog('[StickToGif worker] decoding first frame');
    const firstImageData = await decodeBlob(frames[0]!, width, height);
    workerLog('[StickToGif worker] first frame decoded');
    let previousGray = imageDataToGray(cv, firstImageData);
    workerLog('[StickToGif worker] first frame converted to gray');
    let previousRegion = baselineRegion;
    let previousImageOverlay = initialImageOverlay ?? null;
    let previousTextOverlay = textRelativeLayout ? initialTextOverlay ?? null : null;
    let stableRegion = baselineRegion;
    let featurePoints = detectFeaturePoints(cv, previousGray, baselineRegion);
    workerLog('[StickToGif worker] initial feature points detected', { count: featurePoints.rows });

    for (let index = 1; index < frames.length; index += 1) {
      if (index === 1) {
        workerLog('[StickToGif worker] entering tracking loop');
      }
      self.postMessage({
        type: 'PROGRESS',
        progress: 0.08 + (index / frames.length) * 0.9,
        message: `Tracking frame ${index + 1} of ${frames.length}`,
      });

      const currentImageData = await decodeBlob(frames[index]!, width, height);
      const currentGray = imageDataToGray(cv, currentImageData);
      let confidence = 0;
      let nextRegion = previousRegion;
      let nextImageOverlay = previousImageOverlay;
      let nextTextOverlay = previousTextOverlay;
      
      const templateMotion = estimateTemplateMotion(cv, previousGray, currentGray, previousRegion);

      // Rolling feature point detection
      if (featurePoints.rows < 12 || index % 15 === 0) {
        featurePoints.delete();
        featurePoints = detectFeaturePoints(cv, previousGray, previousRegion);
      }

      if (featurePoints.rows >= 6) {
        const nextPoints = new cv.Mat();
        const status = new cv.Mat();
        const error = new cv.Mat();
        const winSize = new cv.Size(21, 21);
        const criteria = new cv.TermCriteria(
          cv.TermCriteria_EPS | cv.TermCriteria_COUNT,
          30,
          0.01,
        );

        cv.calcOpticalFlowPyrLK(
          previousGray,
          currentGray,
          featurePoints,
          nextPoints,
          status,
          error,
          winSize,
          3,
          criteria,
        );

        const previousPointList = extractPoints(featurePoints);
        const nextPointList = extractPoints(nextPoints);
        const trackedPrevious = [];
        const trackedCurrent = [];

        for (let pointIndex = 0; pointIndex < status.rows; pointIndex += 1) {
          if (status.data[pointIndex] !== 1) continue;

          const previousPoint = previousPointList[pointIndex];
          const currentPoint = nextPointList[pointIndex];

          if (!previousPoint || !currentPoint) continue;
          if (
            currentPoint.x < 0 ||
            currentPoint.x > width ||
            currentPoint.y < 0 ||
            currentPoint.y > height
          ) {
            continue;
          }

          trackedPrevious.push(previousPoint);
          trackedCurrent.push(currentPoint);
        }

        if (trackedCurrent.length >= 4) {
          const motion = estimateMotion(trackedPrevious, trackedCurrent);
          const templateConfidence = templateMotion?.confidence ?? 0;
          confidence = Math.max(motion.confidence, templateConfidence * 0.9);

          let candidateRegion: TrackedRegion = clampRectToBounds(
            {
              x: previousRegion.x + motion.dx,
              y: previousRegion.y + motion.dy,
              width: previousRegion.width * motion.scale,
              height: previousRegion.height * motion.scale,
            },
            width,
            height,
          ) as TrackedRegion;
          candidateRegion.rotation = previousRegion.rotation + motion.rotation;

          if (templateMotion && templateMotion.confidence > 0.2) {
            const templateRegion: TrackedRegion = {
              ...clampRectToBounds(
                {
                  x: previousRegion.x + templateMotion.dx,
                  y: previousRegion.y + templateMotion.dy,
                  width: previousRegion.width,
                  height: previousRegion.height,
                },
                width,
                height,
              ),
              rotation: previousRegion.rotation,
            };
            const templateBlend = clamp(
              templateMotion.confidence > motion.confidence
                ? 0.45 + (templateMotion.confidence - motion.confidence) * 0.45
                : templateMotion.confidence * 0.25,
              0,
              0.85,
            );
            candidateRegion = blendRegion(candidateRegion, templateRegion, templateBlend, 0);
          }

          const positionAlpha =
            confidence > 0.78 ? 1 : clamp(0.35 + confidence * 0.45, 0.35, 0.88);
          const rotationAlpha =
            confidence > 0.45 && trackedCurrent.length >= 8 ? positionAlpha * 0.6 : 0;

          nextRegion = blendRegion(previousRegion, candidateRegion, positionAlpha, rotationAlpha);

          if (confidence < 0.3) {
            nextRegion = blendRegion(nextRegion, stableRegion, 0.35, 0);
          } else {
            stableRegion = nextRegion;
          }

          if (imageRelativeLayout) {
            nextImageOverlay = buildOverlayFromRegion(
              nextRegion,
              imageRelativeLayout,
              rotationAlpha > 0,
            );
            nextImageOverlay = blendOverlay(
              previousImageOverlay,
              nextImageOverlay,
              positionAlpha,
            );
          }

          if (textRelativeLayout) {
            nextTextOverlay = buildOverlayFromRegion(
              nextRegion,
              textRelativeLayout,
              rotationAlpha > 0,
            );
            nextTextOverlay = blendOverlay(
              previousTextOverlay,
              nextTextOverlay,
              positionAlpha,
            );
          }
        } else {
          const templateConfidence = templateMotion?.confidence ?? 0;
          confidence = Math.max(
            trackedCurrent.length / Math.max(previousPointList.length, 1),
            templateConfidence,
          );
          if (templateMotion && templateMotion.confidence > 0.25) {
            const templateRegion: TrackedRegion = {
              ...clampRectToBounds(
                {
                  x: previousRegion.x + templateMotion.dx,
                  y: previousRegion.y + templateMotion.dy,
                  width: previousRegion.width,
                  height: previousRegion.height,
                },
                width,
                height,
              ),
              rotation: previousRegion.rotation,
            };
            nextRegion = blendRegion(previousRegion, templateRegion, clamp(0.55 + templateMotion.confidence * 0.35, 0.55, 1), 0);
            stableRegion = blendRegion(stableRegion, nextRegion, 0.35, 0);
          } else {
            nextRegion = blendRegion(previousRegion, stableRegion, 0.2, 0);
          }
          if (imageRelativeLayout) {
            nextImageOverlay = blendOverlay(
              previousImageOverlay,
              buildOverlayFromRegion(nextRegion, imageRelativeLayout, false),
              0.2,
            );
          }
          if (textRelativeLayout) {
            nextTextOverlay = blendOverlay(
              previousTextOverlay,
              buildOverlayFromRegion(nextRegion, textRelativeLayout, false),
              0.2,
            );
          }
        }

        nextPoints.delete();
        status.delete();
        error.delete();
      } else {
        const templateConfidence = templateMotion?.confidence ?? 0;
        confidence = templateConfidence;
        if (templateMotion && templateMotion.confidence > 0.25) {
          const templateRegion: TrackedRegion = {
            ...clampRectToBounds(
              {
                x: previousRegion.x + templateMotion.dx,
                y: previousRegion.y + templateMotion.dy,
                width: previousRegion.width,
                height: previousRegion.height,
              },
              width,
              height,
            ),
            rotation: previousRegion.rotation,
          };
          nextRegion = blendRegion(previousRegion, templateRegion, clamp(0.55 + templateMotion.confidence * 0.35, 0.55, 1), 0);
          stableRegion = blendRegion(stableRegion, nextRegion, 0.35, 0);
        } else {
          nextRegion = stableRegion;
        }
        nextImageOverlay = imageRelativeLayout
          ? buildOverlayFromRegion(nextRegion, imageRelativeLayout, false)
          : null;
        nextTextOverlay = textRelativeLayout
          ? buildOverlayFromRegion(nextRegion, textRelativeLayout, false)
          : null;
      }

      previousGray.delete();

      previousGray = currentGray;
      previousRegion = nextRegion;
      previousImageOverlay = nextImageOverlay;
      previousTextOverlay = nextTextOverlay;

      results.push({
        frameIndex: index,
        confidence,
        region: nextRegion,
        imageOverlay: nextImageOverlay,
        textOverlay: nextTextOverlay,
      });
    }

    previousGray.delete();
    featurePoints.delete();
    workerLog('[StickToGif worker] tracking complete, posting COMPLETE');
    self.postMessage({ type: 'COMPLETE', results });
  } catch (error) {
    workerError('[StickToGif worker] fatal error', error);
    self.postMessage({ type: 'ERROR', message: error instanceof Error ? error.message : 'Unknown tracking error' });
  }
};
