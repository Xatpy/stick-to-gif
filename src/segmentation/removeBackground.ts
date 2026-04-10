import type {
  Results,
  SelfieSegmentation as SelfieSegmentationType,
} from '@mediapipe/selfie_segmentation';

const SELFIE_SEGMENTATION_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation';
const SEGMENTATION_TIMEOUT_MS = 15000;
const FOREGROUND_THRESHOLD = 128;

type RasterCanvas = HTMLCanvasElement | OffscreenCanvas;
type PendingResult = {
  resolve: (results: Results) => void;
  reject: (error: unknown) => void;
  timerId: ReturnType<typeof setTimeout>;
};
type SelfieSegmentationConstructor = new (config?: {
  locateFile?: (path: string, prefix?: string) => string;
}) => SelfieSegmentationType;
type SelfieSegmentationRuntimeModule = {
  SelfieSegmentation?: SelfieSegmentationConstructor;
  default?: {
    SelfieSegmentation?: SelfieSegmentationConstructor;
  };
  'module.exports'?: {
    SelfieSegmentation?: SelfieSegmentationConstructor;
  };
};

let selfieSegmentation: SelfieSegmentationType | null = null;
let selfieSegmentationReady: Promise<SelfieSegmentationType> | null = null;
let pendingResult: PendingResult | null = null;
let segmentationQueue: Promise<unknown> = Promise.resolve();

function resolveSelfieSegmentationConstructor(
  module: SelfieSegmentationRuntimeModule,
): SelfieSegmentationConstructor {
  const globalRuntime = globalThis as typeof globalThis & {
    SelfieSegmentation?: SelfieSegmentationConstructor;
  };

  const constructor =
    module.SelfieSegmentation ??
    module.default?.SelfieSegmentation ??
    module['module.exports']?.SelfieSegmentation ??
    globalRuntime.SelfieSegmentation;

  if (typeof constructor !== 'function') {
    throw new Error('MediaPipe SelfieSegmentation runtime did not expose a constructor.');
  }

  return constructor;
}

function disposeGpuBuffer(buffer: CanvasImageSource | undefined) {
  if (buffer instanceof ImageBitmap) {
    buffer.close();
  }
}

function disposeResults(results: Results) {
  disposeGpuBuffer(results.image);
  if (results.segmentationMask !== results.image) {
    disposeGpuBuffer(results.segmentationMask);
  }
}

function createInputCanvas(width: number, height: number) {
  if (typeof document === 'undefined') {
    throw new Error('Background removal is unavailable in this browser.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function createRasterCanvas(width: number, height: number): RasterCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }

  return createInputCanvas(width, height);
}

function get2dContext(canvas: RasterCanvas, willReadFrequently = false) {
  const context = canvas.getContext('2d', willReadFrequently ? { willReadFrequently: true } : undefined);
  if (!context) {
    throw new Error('Unable to create a canvas context for background removal.');
  }
  return context;
}

async function canvasToPngBlob(canvas: RasterCanvas) {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: 'image/png' });
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('Unable to encode the background-removed image.'));
    }, 'image/png');
  });
}

function clearPendingResult() {
  if (!pendingResult) {
    return null;
  }

  const current = pendingResult;
  pendingResult = null;
  clearTimeout(current.timerId);
  return current;
}

async function sendForResults(
  segmentation: SelfieSegmentationType,
  image: HTMLCanvasElement,
): Promise<Results> {
  if (pendingResult) {
    throw new Error('Background removal is already processing another image.');
  }

  return new Promise<Results>((resolve, reject) => {
    const timerId = globalThis.setTimeout(() => {
      if (!pendingResult || pendingResult.timerId !== timerId) {
        return;
      }

      pendingResult = null;
      reject(new Error('Background removal timed out.'));
    }, SEGMENTATION_TIMEOUT_MS);

    pendingResult = { resolve, reject, timerId };

    segmentation.send({ image }).catch((error) => {
      if (!pendingResult || pendingResult.timerId !== timerId) {
        return;
      }

      pendingResult = null;
      clearTimeout(timerId);
      reject(error);
    });
  });
}

async function getSelfieSegmentation() {
  if (selfieSegmentation) {
    return selfieSegmentation;
  }

  if (!selfieSegmentationReady) {
    selfieSegmentationReady = (async () => {
      const module = await import('@mediapipe/selfie_segmentation');
      const SelfieSegmentation = resolveSelfieSegmentationConstructor(module);
      const segmentation = new SelfieSegmentation({
        locateFile: (path) => `${SELFIE_SEGMENTATION_CDN}/${path}`,
      });

      segmentation.onResults((results) => {
        const current = clearPendingResult();
        current?.resolve(results);
      });

      segmentation.setOptions({ modelSelection: 1 });
      await segmentation.initialize();

      const warmupCanvas = createInputCanvas(1, 1);
      const warmupContext = get2dContext(warmupCanvas);
      warmupContext.fillStyle = '#ffffff';
      warmupContext.fillRect(0, 0, 1, 1);
      const warmupResults = await sendForResults(segmentation, warmupCanvas);
      disposeResults(warmupResults);

      selfieSegmentation = segmentation;
      return segmentation;
    })().catch((error) => {
      const current = clearPendingResult();
      current?.reject(error);
      selfieSegmentation = null;
      selfieSegmentationReady = null;
      throw error;
    });
  }

  return selfieSegmentationReady;
}

function buildBinaryMask(maskContext: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D) {
  const imageData = maskContext.getImageData(0, 0, maskContext.canvas.width, maskContext.canvas.height);
  const { data } = imageData;

  for (let offset = 0; offset < data.length; offset += 4) {
    const intensity = Math.max(
      data[offset] ?? 0,
      data[offset + 1] ?? 0,
      data[offset + 2] ?? 0,
      data[offset + 3] ?? 0,
    );
    const alpha = intensity >= FOREGROUND_THRESHOLD ? 255 : 0;

    data[offset] = 255;
    data[offset + 1] = 255;
    data[offset + 2] = 255;
    data[offset + 3] = alpha;
  }

  maskContext.putImageData(imageData, 0, 0);
}

async function runBackgroundRemoval(imageBitmap: ImageBitmap) {
  const segmentation = await getSelfieSegmentation();
  const width = imageBitmap.width;
  const height = imageBitmap.height;

  const inputCanvas = createInputCanvas(width, height);
  const inputContext = get2dContext(inputCanvas);
  inputContext.imageSmoothingEnabled = true;
  inputContext.imageSmoothingQuality = 'high';
  inputContext.clearRect(0, 0, width, height);
  inputContext.drawImage(imageBitmap, 0, 0, width, height);

  const results = await sendForResults(segmentation, inputCanvas);

  try {
    const maskCanvas = createRasterCanvas(width, height);
    const maskContext = get2dContext(maskCanvas, true);
    maskContext.clearRect(0, 0, width, height);
    maskContext.drawImage(results.segmentationMask, 0, 0, width, height);
    buildBinaryMask(maskContext);

    const outputCanvas = createRasterCanvas(width, height);
    const outputContext = get2dContext(outputCanvas);
    outputContext.clearRect(0, 0, width, height);
    outputContext.drawImage(inputCanvas, 0, 0, width, height);
    outputContext.globalCompositeOperation = 'destination-in';
    outputContext.drawImage(maskCanvas, 0, 0, width, height);
    outputContext.globalCompositeOperation = 'source-over';

    return canvasToPngBlob(outputCanvas);
  } finally {
    disposeResults(results);
  }
}

export function preloadBackgroundRemoval() {
  return getSelfieSegmentation().then(() => undefined);
}

export async function removeBackground(imageBitmap: ImageBitmap): Promise<Blob> {
  const task = segmentationQueue.then(
    () => runBackgroundRemoval(imageBitmap),
    () => runBackgroundRemoval(imageBitmap),
  );

  segmentationQueue = task.catch(() => undefined);
  return task;
}
