import type cvType from '@techstark/opencv-js';
import { loadOpenCv } from '../lib/opencv';
import { emitDebug, type DebugReporter } from '../lib/debug';
import type {
  DecodedGif,
  OverlayTransform,
  ProgressUpdate,
  Rect,
  TextOverlayStyle,
  TrackingFrame,
  TrackedRegion,
} from '../types';
import {
  blendOverlay,
  blendRegion,
  clamp,
  clampRectToBounds,
  rectCenter,
  rotatePoint,
  wrapAngle,
} from '../utils/math';

interface TrackOptions {
  gif: DecodedGif;
  initialRegion: Rect;
  initialImageOverlay?: OverlayTransform | null;
  initialTextOverlay?: OverlayTransform | null;
  textStyle?: TextOverlayStyle | null;
  onProgress?: (update: ProgressUpdate) => void;
  debugReporter?: DebugReporter;
}

interface RelativeOverlayLayout {
  offsetX: number;
  offsetY: number;
  widthRatio: number;
  heightRatio: number;
  rotationOffset: number;
}

interface MotionEstimate {
  dx: number;
  dy: number;
  scale: number;
  rotation: number;
  confidence: number;
}

type CvModule = typeof cvType;

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

function extractPoints(pointsMat: InstanceType<CvModule['Mat']>) {
  const result: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < pointsMat.rows; index += 1) {
    result.push({
      x: pointsMat.data32F[index * 2] ?? 0,
      y: pointsMat.data32F[index * 2 + 1] ?? 0,
    });
  }
  return result;
}

function centroid(points: Array<{ x: number; y: number }>) {
  const sum = points.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  };
}

function estimateMotion(
  previousPoints: Array<{ x: number; y: number }>,
  currentPoints: Array<{ x: number; y: number }>,
): MotionEstimate {
  const previousCenter = centroid(previousPoints);
  const currentCenter = centroid(currentPoints);

  let previousRadius = 0;
  let currentRadius = 0;
  let rotationSum = 0;
  let rotationSamples = 0;

  for (let index = 0; index < previousPoints.length; index += 1) {
    const previousPoint = previousPoints[index]!;
    const currentPoint = currentPoints[index]!;
    const prevVector = {
      x: previousPoint.x - previousCenter.x,
      y: previousPoint.y - previousCenter.y,
    };
    const currVector = {
      x: currentPoint.x - currentCenter.x,
      y: currentPoint.y - currentCenter.y,
    };

    previousRadius += Math.hypot(prevVector.x, prevVector.y);
    currentRadius += Math.hypot(currVector.x, currVector.y);

    const prevAngle = Math.atan2(prevVector.y, prevVector.x);
    const currAngle = Math.atan2(currVector.y, currVector.x);
    const delta = wrapAngle(currAngle - prevAngle);

    if (Number.isFinite(delta)) {
      rotationSum += delta;
      rotationSamples += 1;
    }
  }

  const scale =
    previousRadius > 0 ? clamp(currentRadius / previousRadius, 0.92, 1.08) : 1;
  const rotation =
    rotationSamples >= 6 ? clamp(rotationSum / rotationSamples, -0.12, 0.12) : 0;
  const confidence = clamp(currentPoints.length / Math.max(previousPoints.length, 1), 0, 1);

  return {
    dx: currentCenter.x - previousCenter.x,
    dy: currentCenter.y - previousCenter.y,
    scale,
    rotation,
    confidence,
  };
}

export function computeOverlayLayout(
  region: Rect,
  overlay: OverlayTransform,
): RelativeOverlayLayout {
  const regionCenter = rectCenter(region);
  return {
    offsetX: (overlay.x - regionCenter.x) / region.width,
    offsetY: (overlay.y - regionCenter.y) / region.height,
    widthRatio: overlay.width / region.width,
    heightRatio: overlay.height / region.height,
    rotationOffset: overlay.rotation,
  };
}

export function buildOverlayFromRegion(
  region: TrackedRegion,
  relativeLayout: RelativeOverlayLayout,
  rotationEnabled: boolean,
): OverlayTransform {
  const center = rectCenter(region);
  const regionRotation = rotationEnabled ? region.rotation : 0;
  const offset = rotatePoint(
    {
      x: region.width * relativeLayout.offsetX,
      y: region.height * relativeLayout.offsetY,
    },
    regionRotation,
  );

  return {
    x: center.x + offset.x,
    y: center.y + offset.y,
    width: Math.max(24, region.width * relativeLayout.widthRatio),
    height: Math.max(24, region.height * relativeLayout.heightRatio),
    rotation: relativeLayout.rotationOffset + regionRotation,
  };
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
  emitDebug(
    debugReporter,
    'info',
    `Track requested for ${gif.frames.length} frames at ${gif.width}x${gif.height}.`,
  );
  onProgress?.({
    progress: 0.03,
    message: 'Loading OpenCV runtime',
  });

  const cv = await loadOpenCv(debugReporter);
  emitDebug(debugReporter, 'info', 'OpenCV handoff complete. Starting frame preparation.');
  const region = clampRectToBounds(initialRegion, gif.width, gif.height);
  const baselineRegion: TrackedRegion = { ...region, rotation: 0 };
  const imageRelativeLayout = initialImageOverlay
    ? computeOverlayLayout(region, initialImageOverlay)
    : null;
  const textRelativeLayout =
    initialTextOverlay && textStyle?.enabled && textStyle.text.trim()
      ? computeOverlayLayout(region, initialTextOverlay)
      : null;
  emitDebug(
    debugReporter,
    'info',
    `Initial region: x=${Math.round(region.x)}, y=${Math.round(region.y)}, w=${Math.round(region.width)}, h=${Math.round(region.height)}.`,
  );

  const results: TrackingFrame[] = [
    {
      frameIndex: 0,
      confidence: 1,
      region: baselineRegion,
      imageOverlay: initialImageOverlay ?? null,
      textOverlay: textRelativeLayout ? initialTextOverlay ?? null : null,
    },
  ];

  onProgress?.({
    progress: 0.08,
    message: 'Preparing first frame for tracking',
  });
  let previousGray = imageDataToGray(cv, gif.frames[0]!.imageData);
  let previousRegion = baselineRegion;
  let previousImageOverlay = initialImageOverlay ?? null;
  let previousTextOverlay = textRelativeLayout ? initialTextOverlay ?? null : null;
  let stableRegion = baselineRegion;
  let featurePoints = detectFeaturePoints(cv, previousGray, baselineRegion);
  emitDebug(
    debugReporter,
    'info',
    `Detected ${featurePoints.rows} initial feature points.`,
  );

  if (featurePoints.rows < 4) {
    emitDebug(
      debugReporter,
      'warn',
      'Very few feature points detected in the tracking box. Tracking may be unstable.',
    );
  }

  for (let index = 1; index < gif.frames.length; index += 1) {
    if (index === 1 || index % 10 === 0 || index === gif.frames.length - 1) {
      emitDebug(
        debugReporter,
        'info',
        `Processing frame ${index + 1}/${gif.frames.length}.`,
      );
    }

    onProgress?.({
      progress: 0.08 + (index / gif.frames.length) * 0.9,
      message: `Tracking frame ${index + 1} of ${gif.frames.length}`,
    });
    const currentGray = imageDataToGray(cv, gif.frames[index]!.imageData);
    let confidence = 0;
    let nextRegion = previousRegion;
    let nextImageOverlay = previousImageOverlay;
    let nextTextOverlay = previousTextOverlay;

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
        if (status.data[pointIndex] !== 1) {
          continue;
        }

        const previousPoint = previousPointList[pointIndex];
        const currentPoint = nextPointList[pointIndex];

        if (!previousPoint || !currentPoint) {
          continue;
        }

        if (
          currentPoint.x < 0 ||
          currentPoint.x > gif.width ||
          currentPoint.y < 0 ||
          currentPoint.y > gif.height
        ) {
          continue;
        }

        trackedPrevious.push(previousPoint);
        trackedCurrent.push(currentPoint);
      }

      if (trackedCurrent.length >= 4) {
        const motion = estimateMotion(trackedPrevious, trackedCurrent);
        confidence = motion.confidence;
        if (index === 1 || index % 10 === 0 || index === gif.frames.length - 1) {
          emitDebug(
            debugReporter,
            'info',
            `Frame ${index + 1}: ${trackedCurrent.length} points survived, confidence=${motion.confidence.toFixed(2)}, dx=${motion.dx.toFixed(1)}, dy=${motion.dy.toFixed(1)}.`,
          );
        }

        const candidateRegion: TrackedRegion = clampRectToBounds(
          {
            x: previousRegion.x + motion.dx,
            y: previousRegion.y + motion.dy,
            width: previousRegion.width * motion.scale,
            height: previousRegion.height * motion.scale,
          },
          gif.width,
          gif.height,
        ) as TrackedRegion;
        candidateRegion.rotation = previousRegion.rotation + motion.rotation;

        const positionAlpha = clamp(0.18 + confidence * 0.45, 0.18, 0.68);
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
        confidence = trackedCurrent.length / Math.max(previousPointList.length, 1);
        emitDebug(
          debugReporter,
          'warn',
          `Frame ${index + 1}: only ${trackedCurrent.length} points survived. Falling back toward stable region.`,
        );
        nextRegion = blendRegion(previousRegion, stableRegion, 0.2, 0);
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
      emitDebug(
        debugReporter,
        'warn',
        `Frame ${index + 1}: not enough tracked points to run optical flow (${featurePoints.rows}).`,
      );
      nextRegion = stableRegion;
      nextImageOverlay = imageRelativeLayout
        ? buildOverlayFromRegion(nextRegion, imageRelativeLayout, false)
        : null;
      nextTextOverlay = textRelativeLayout
        ? buildOverlayFromRegion(nextRegion, textRelativeLayout, false)
        : null;
    }

    previousGray.delete();
    featurePoints.delete();

    previousGray = currentGray;
    previousRegion = nextRegion;
    previousImageOverlay = nextImageOverlay;
    previousTextOverlay = nextTextOverlay;
    featurePoints = detectFeaturePoints(cv, currentGray, nextRegion);

    results.push({
      frameIndex: index,
      confidence,
      region: nextRegion,
      imageOverlay: nextImageOverlay,
      textOverlay: nextTextOverlay,
    });

    if (index % 3 === 0) {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    }
  }

  previousGray.delete();
  featurePoints.delete();
  emitDebug(debugReporter, 'info', 'Tracking complete.');
  onProgress?.({
    progress: 1,
    message: 'Tracking complete',
  });

  return results;
}
