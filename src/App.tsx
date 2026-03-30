import { useEffect, useState } from 'react';
import { DropZone } from './components/DropZone';
import { EditorCanvas } from './components/EditorCanvas';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Modal } from './components/Modal';
import { OverlayPicker } from './components/OverlayPicker';
import { PreviewPlayer } from './components/PreviewPlayer';
import { exportGif } from './gif/exportGif';
import { decodeSource } from './media/decodeSource';
import { canEncodeWebp, exportAnimatedWebp } from './webp/exportWebp';
import { trackObject } from './tracking/trackObject';
import { computeOverlayFrames } from './tracking/computeOverlays';
import logoAsset from './assets/logo.png';
import type { DebugEntry } from './lib/debug';
import type {
  AppStep,
  BlurStyle,
  DecodedGif,
  OverlayAsset,
  OverlayMode,
  OverlayTransform,
  Point,
  Rect,
  StatusState,
  TextOverlayStyle,
  TrackingFrame,
} from './types';
import { clampRectToBounds, rectCenter } from './utils/math';
import { truncateFilename } from './utils/truncate';

/* ── Constants ──────────────────────────────────────────────── */

const idleStatus: StatusState = { stage: 'idle', message: '', progress: 0 };

const defaultTextStyle: TextOverlayStyle = {
  enabled: false,
  text: '',
  color: '#ffffff',
  strokeColor: '#2b2118',
  fontFamily: '"Avenir Next", "Segoe UI", sans-serif',
  fontWeight: 800,
};

const defaultBlurStyle: BlurStyle = { intensity: 0.5 };
const flowSteps = ['Upload', 'Pick subject', 'Choose effect', 'Export'] as const;

/* ── Helpers ────────────────────────────────────────────────── */

function getPixel(frame: ImageData, x: number, y: number) {
  const offset = (y * frame.width + x) * 4;
  return {
    r: frame.data[offset] ?? 0,
    g: frame.data[offset + 1] ?? 0,
    b: frame.data[offset + 2] ?? 0,
  };
}

function colorDistance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
) {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

function estimateLocalBackground(
  frame: ImageData,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let x = x0; x <= x1; x += 1) {
    const top = getPixel(frame, x, y0);
    const bottom = getPixel(frame, x, y1);
    r += top.r + bottom.r;
    g += top.g + bottom.g;
    b += top.b + bottom.b;
    count += 2;
  }

  for (let y = y0 + 1; y < y1; y += 1) {
    const left = getPixel(frame, x0, y);
    const right = getPixel(frame, x1, y);
    r += left.r + right.r;
    g += left.g + right.g;
    b += left.b + right.b;
    count += 2;
  }

  return count
    ? { r: r / count, g: g / count, b: b / count }
    : { r: 0, g: 0, b: 0 };
}

function refineRectFromLocalRegion(frame: ImageData, center: Point, seedRect: Rect): Rect | null {
  const searchPadding = Math.max(14, Math.round(seedRect.width * 0.45));
  const x0 = Math.max(0, Math.floor(seedRect.x - searchPadding));
  const y0 = Math.max(0, Math.floor(seedRect.y - searchPadding));
  const x1 = Math.min(frame.width - 1, Math.ceil(seedRect.x + seedRect.width + searchPadding));
  const y1 = Math.min(frame.height - 1, Math.ceil(seedRect.y + seedRect.height + searchPadding));
  const windowWidth = x1 - x0 + 1;
  const windowHeight = y1 - y0 + 1;

  if (windowWidth < 8 || windowHeight < 8) {
    return null;
  }

  const seedX = Math.max(x0, Math.min(x1, Math.round(center.x)));
  const seedY = Math.max(y0, Math.min(y1, Math.round(center.y)));
  const seedColor = getPixel(frame, seedX, seedY);
  const backgroundColor = estimateLocalBackground(frame, x0, y0, x1, y1);
  const seedContrast = colorDistance(seedColor, backgroundColor);

  if (seedContrast < 36) {
    return null;
  }

  const visited = new Uint8Array(windowWidth * windowHeight);
  const queueX = new Int16Array(windowWidth * windowHeight);
  const queueY = new Int16Array(windowWidth * windowHeight);
  const seedTolerance = Math.min(140, Math.max(52, seedContrast * 0.72));
  const bgTolerance = Math.max(28, seedContrast * 0.45);

  let head = 0;
  let tail = 0;
  queueX[tail] = seedX;
  queueY[tail] = seedY;
  tail += 1;
  visited[(seedY - y0) * windowWidth + (seedX - x0)] = 1;

  let minX = seedX;
  let maxX = seedX;
  let minY = seedY;
  let maxY = seedY;
  let count = 0;

  while (head < tail) {
    const x = queueX[head]!;
    const y = queueY[head]!;
    head += 1;

    const pixel = getPixel(frame, x, y);
    const distanceFromSeed = colorDistance(pixel, seedColor);
    const distanceFromBackground = colorDistance(pixel, backgroundColor);

    if (distanceFromSeed > seedTolerance || distanceFromBackground < bgTolerance) {
      continue;
    }

    count += 1;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;

    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as const;

    for (const [nextX, nextY] of neighbors) {
      if (nextX < x0 || nextX > x1 || nextY < y0 || nextY > y1) {
        continue;
      }
      const localIndex = (nextY - y0) * windowWidth + (nextX - x0);
      if (visited[localIndex]) {
        continue;
      }
      visited[localIndex] = 1;
      queueX[tail] = nextX;
      queueY[tail] = nextY;
      tail += 1;
    }
  }

  const regionWidth = maxX - minX + 1;
  const regionHeight = maxY - minY + 1;
  const searchArea = windowWidth * windowHeight;

  if (
    count < 40 ||
    regionWidth < 8 ||
    regionHeight < 8 ||
    count > searchArea * 0.6
  ) {
    return null;
  }

  const padding = Math.max(6, Math.round(Math.max(regionWidth, regionHeight) * 0.18));
  return clampRectToBounds(
    {
      x: minX - padding,
      y: minY - padding,
      width: regionWidth + padding * 2,
      height: regionHeight + padding * 2,
    },
    frame.width,
    frame.height,
  );
}

function getDefaultTargetRect(gif: DecodedGif, frame: ImageData, center: Point): Rect {
  const minDimension = Math.min(gif.width, gif.height);
  const candidateRatios = [0.14, 0.18, 0.22, 0.28, 0.34];
  const grayscale = new Float32Array(frame.width * frame.height);

  for (let index = 0; index < grayscale.length; index += 1) {
    const pixelOffset = index * 4;
    grayscale[index] =
      frame.data[pixelOffset]! * 0.299 +
      frame.data[pixelOffset + 1]! * 0.587 +
      frame.data[pixelOffset + 2]! * 0.114;
  }

  const scoreRect = (rect: Rect) => {
    const x0 = Math.max(1, Math.floor(rect.x));
    const y0 = Math.max(1, Math.floor(rect.y));
    const x1 = Math.min(frame.width - 1, Math.ceil(rect.x + rect.width));
    const y1 = Math.min(frame.height - 1, Math.ceil(rect.y + rect.height));

    let edgeSum = 0;
    let strongEdges = 0;
    let samples = 0;

    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const idx = y * frame.width + x;
        const gx = Math.abs(grayscale[idx + 1]! - grayscale[idx - 1]!);
        const gy = Math.abs(grayscale[idx + frame.width]! - grayscale[idx - frame.width]!);
        const energy = gx + gy;
        edgeSum += energy;
        strongEdges += energy > 42 ? 1 : 0;
        samples += 1;
      }
    }

    if (!samples) {
      return Number.NEGATIVE_INFINITY;
    }

    const edgeDensity = edgeSum / samples;
    const structureRatio = strongEdges / samples;
    const areaPenalty = rect.width / minDimension;

    return edgeDensity + structureRatio * 36 - areaPenalty * 12;
  };

  let bestRect = clampRectToBounds(
    {
      x: center.x - minDimension * 0.18 / 2,
      y: center.y - minDimension * 0.18 / 2,
      width: minDimension * 0.18,
      height: minDimension * 0.18,
    },
    gif.width,
    gif.height,
  );
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const ratio of candidateRatios) {
    const size = minDimension * ratio;
    const rect = clampRectToBounds(
      { x: center.x - size / 2, y: center.y - size / 2, width: size, height: size },
      gif.width,
      gif.height,
    );
    const score = scoreRect(rect);

    if (score > bestScore) {
      bestScore = score;
      bestRect = rect;
    }
  }

  return refineRectFromLocalRegion(frame, center, bestRect) ?? bestRect;
}

function getDefaultOverlayTransform(
  gif: DecodedGif,
  overlay: OverlayAsset,
  targetRect: Rect,
): OverlayTransform {
  const maxWidth = gif.width * 0.32;
  const scale = Math.min(1, maxWidth / overlay.width);
  const center = rectCenter(targetRect);
  return {
    x: center.x,
    y: center.y,
    width: overlay.width * scale,
    height: overlay.height * scale,
    rotation: 0,
  };
}

function getDefaultTextTransform(gif: DecodedGif, targetRect: Rect): OverlayTransform {
  const center = rectCenter(targetRect);
  return {
    x: center.x,
    y: Math.max(36, targetRect.y - 28),
    width: Math.min(gif.width * 0.6, 320),
    height: Math.max(36, gif.height * 0.12),
    rotation: 0,
  };
}

async function loadOverlay(file: File): Promise<OverlayAsset> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const bitmap = await createImageBitmap(file);
    return { name: file.name, width: bitmap.width, height: bitmap.height, source: bitmap, objectUrl };
  } catch {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () => reject(new Error('Unable to decode that overlay image.'));
      next.src = objectUrl;
    });
    return { name: file.name, width: image.naturalWidth, height: image.naturalHeight, source: image, objectUrl };
  }
}

async function loadRemoteFile(url: string) {
  let parsedUrl: URL;
  try { parsedUrl = new URL(url); } catch { throw new Error('Invalid URL.'); }

  const response = await fetch(parsedUrl.toString(), { mode: 'cors' });
  if (!response.ok) throw new Error('Unable to fetch that URL.');

  const blob = await response.blob();
  if (!blob.type.startsWith('image/gif'))
    throw new Error('That URL did not return a GIF file.');

  const pathname = parsedUrl.pathname.split('/').pop() || 'pasted.gif';
  return new File([blob], pathname, { type: blob.type });
}

async function loadBundledSample() {
  const response = await fetch(`${import.meta.env.BASE_URL}sample.gif`);
  if (!response.ok) {
    throw new Error('Unable to load the sample clip.');
  }

  const blob = await response.blob();
  return new File([blob], 'sample.gif', { type: blob.type || 'image/gif' });
}

/* ── App ────────────────────────────────────────────────────── */

export default function App() {
  /* State */
  const [step, setStep] = useState<AppStep>('input');
  const [gif, setGif] = useState<DecodedGif | null>(null);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [trackingFrames, setTrackingFrames] = useState<TrackingFrame[] | null>(null);
  const [overlayMode, setOverlayMode] = useState<OverlayMode | null>(null);
  const [overlay, setOverlay] = useState<OverlayAsset | null>(null);
  const [overlayTransform, setOverlayTransform] = useState<OverlayTransform | null>(null);
  const [textStyle, setTextStyle] = useState<TextOverlayStyle>(defaultTextStyle);
  const [textTransform, setTextTransform] = useState<OverlayTransform | null>(null);
  const [blurStyle, setBlurStyle] = useState<BlurStyle>(defaultBlurStyle);
  const [status, setStatus] = useState<StatusState>(idleStatus);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [webpSupported, setWebpSupported] = useState<boolean | null>(null);
  const [, setDebugLog] = useState<DebugEntry[]>([]);

  useEffect(() => {
    return () => { if (overlay?.objectUrl) URL.revokeObjectURL(overlay.objectUrl); };
  }, [overlay]);

  useEffect(() => {
    let cancelled = false;

    void canEncodeWebp()
      .then((supported) => {
        if (!cancelled) {
          setWebpSupported(supported);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWebpSupported(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const firstFrame = gif?.frames[0]?.imageData ?? null;
  const isExporting = status.stage === 'exporting';
  const isBusy = status.stage !== 'idle';
  const activeFlowStep = (() => {
    switch (step) {
      case 'input':
        return 0;
      case 'pick-subject':
      case 'tracking':
        return 1;
      case 'overlay':
        return 2;
      case 'export':
        return 3;
    }
  })();

  /* Derived: frames with overlay applied */
  const composedFrames = (() => {
    if (!trackingFrames || !gif || !targetRect) return null;

    if (overlayMode === 'sticker' && overlay && overlayTransform) {
      return computeOverlayFrames(trackingFrames, targetRect, overlayTransform, 'imageOverlay');
    }
    if (overlayMode === 'text' && textStyle.enabled && textStyle.text.trim() && textTransform) {
      return computeOverlayFrames(trackingFrames, targetRect, textTransform, 'textOverlay');
    }
    // Blur mode or no overlay — use raw tracking frames
    return trackingFrames;
  })();

  /* ── Actions ──────────────────────────────────────────── */

  const appendDebug = (entry: DebugEntry) => {
    setDebugLog((current) => [...current.slice(-199), entry]);
  };

  const clearDownstreamState = () => {
    setTrackingFrames(null);
    setOverlayMode(null);
    setOverlayTransform(null);
    setTextTransform(null);
  };

  const resetAll = () => {
    if (overlay?.objectUrl) URL.revokeObjectURL(overlay.objectUrl);
    setStep('input');
    setGif(null);
    setTargetRect(null);
    setTrackingFrames(null);
    setOverlayMode(null);
    setOverlay(null);
    setOverlayTransform(null);
    setTextStyle(defaultTextStyle);
    setTextTransform(null);
    setBlurStyle(defaultBlurStyle);
    setStatus(idleStatus);
    setError(null);
    setDebugLog([]);
  };

  const handleGifUpload = async (file: File) => {
    try {
      setError(null);
      setDebugLog([]);
      setStatus({ stage: 'decoding', message: 'Loading source media', progress: 0.1 });
      const decoded = await decodeSource(file, {
        onProgress: (update) => setStatus({ stage: 'decoding', message: update.message, progress: update.progress }),
      });
      setGif(decoded);
      setTargetRect(null);
      setTrackingFrames(null);
      setOverlayMode(null);
      setOverlay(null);
      setOverlayTransform(null);
      setStatus(idleStatus);
      setStep('pick-subject');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load that file.');
      setStatus(idleStatus);
    }
  };

  const handlePasteUrl = async (url: string) => {
    try {
      const file = await loadRemoteFile(url);
      await handleGifUpload(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to fetch that URL.');
    }
  };

  const handleTapPlace = (point: Point) => {
    if (!gif || !firstFrame) return;
    clearDownstreamState();
    setTargetRect(getDefaultTargetRect(gif, firstFrame, point));
  };

  const handleSampleLoad = async () => {
    try {
      setError(null);
      const file = await loadBundledSample();
      await handleGifUpload(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load the sample clip.');
    }
  };

  const handleTrack = async () => {
    if (!gif || !targetRect) return;

    try {
      setError(null);
      setDebugLog([]);
      clearDownstreamState();
      setStep('tracking');
      setStatus({ stage: 'tracking', message: 'Loading tracking engine', progress: 0.02 });
      await new Promise<void>((r) => requestAnimationFrame(() => r()));

      const result = await trackObject({
        gif,
        initialRegion: targetRect,
        debugReporter: appendDebug,
        onProgress: (update) => setStatus({ stage: 'tracking', message: update.message, progress: update.progress }),
      });

      setTrackingFrames(result);
      setStatus(idleStatus);
      setStep('overlay');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tracking failed.');
      appendDebug({ timestamp: new Date().toLocaleTimeString(), level: 'error', message: e instanceof Error ? e.stack ?? e.message : 'Unknown error' });
      setStatus(idleStatus);
      setStep('pick-subject');
    }
  };

  const handleBack = () => {
    if (isBusy) return;

    switch (step) {
      case 'pick-subject':
        setStep('input');
        break;
      case 'tracking':
      case 'overlay':
        setStep('pick-subject');
        break;
      case 'export':
        setStep('overlay');
        break;
      case 'input':
        break;
    }
  };

  const handleModeChange = (mode: OverlayMode) => {
    setOverlayMode(mode);
    if (mode === 'text') {
      setTextStyle((s) => ({ ...s, enabled: true }));
      if (gif && targetRect && !textTransform) {
        setTextTransform(getDefaultTextTransform(gif, targetRect));
      }
    } else {
      setTextStyle((s) => ({ ...s, enabled: false }));
    }
    if (mode === 'blur') {
      setStep('export');
    }
  };

  const handleStickerUpload = async (file: File) => {
    try {
      const asset = await loadOverlay(file);
      if (overlay?.objectUrl) URL.revokeObjectURL(overlay.objectUrl);
      setOverlay(asset);
      if (gif && targetRect) {
        setOverlayTransform(getDefaultOverlayTransform(gif, asset, targetRect));
      }
      setStep('export');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load that image.');
    }
  };

  const handlePresetPick = (asset: OverlayAsset) => {
    if (overlay?.objectUrl) URL.revokeObjectURL(overlay.objectUrl);
    setOverlay(asset);
    if (gif && targetRect) {
      setOverlayTransform(getDefaultOverlayTransform(gif, asset, targetRect));
    }
    setStep('export');
  };

  const handleExport = async (format: 'gif' | 'webp') => {
    if (!gif || !composedFrames) return;
    if (format === 'webp' && webpSupported === false) {
      setError('WebP export is not supported in this browser. Export GIF instead.');
      return;
    }

    try {
      setError(null);
      setDebugLog([]);
      const label = format === 'gif' ? 'Encoding GIF' : 'Encoding WebP';
      setStatus({ stage: 'exporting', message: label, progress: 0 });

      const exportOptions = {
        gif,
        overlay: overlayMode === 'sticker' ? overlay : null,
        textStyle: overlayMode === 'text' ? textStyle : null,
        trackingFrames: composedFrames,
        blurStyle: overlayMode === 'blur' ? blurStyle : undefined,
        onProgress: (p: number) => setStatus({ stage: 'exporting', message: label, progress: p }),
      };

      const blob = format === 'gif'
        ? await exportGif(exportOptions)
        : await exportAnimatedWebp(exportOptions);

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${gif.name.replace(/\.[^.]+$/i, '') || 'sticktogif'}-sticktogif.${format}`;
      link.click();
      URL.revokeObjectURL(url);
      setStatus(idleStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.');
      setStatus(idleStatus);
    }
  };

  /* ── Sidebar content per step ────────────────────────── */

  const renderSidebar = () => {
    switch (step) {
      case 'input':
        return (
          <div className="sidebar__step">
            <DropZone
              onFileSelected={handleGifUpload}
              onPasteUrl={handlePasteUrl}
              onError={setError}
            />
            <p className="step-hint">Everything runs locally in your browser. Nothing is uploaded.</p>
          </div>
        );

      case 'pick-subject':
        return (
          <div className="sidebar__step">
            <div className="step-nav">
              <button type="button" className="step-nav__back" onClick={handleBack} disabled={isBusy}>
                Back
              </button>
              <span className="step-nav__count">Step 2 of 4</span>
            </div>
            <p className="step-instruction">Tap the thing you want to track</p>
            <p className="step-hint">
              A tracking box will appear. Drag corners to resize, drag the center to move.
            </p>
            {targetRect && (
              <button
                type="button"
                className="button button--full"
                onClick={handleTrack}
                disabled={isBusy}
              >
                Track
              </button>
            )}
          </div>
        );

      case 'tracking':
        return (
          <div className="sidebar__step">
            <div className="step-nav">
              <button type="button" className="step-nav__back" onClick={handleBack} disabled>
                Back
              </button>
              <span className="step-nav__count">Step 2 of 4</span>
            </div>
            <p className="step-instruction">Tracking…</p>
            <div className="progress-bar">
              <div style={{ width: `${status.progress * 100}%` }} />
            </div>
            <p className="step-hint">{status.message}</p>
          </div>
        );

      case 'overlay':
        return (
          <div className="sidebar__step">
            <div className="step-nav">
              <button type="button" className="step-nav__back" onClick={handleBack} disabled={isBusy}>
                Back
              </button>
              <span className="step-nav__count">Step 3 of 4</span>
            </div>
            <OverlayPicker
              mode={overlayMode}
              onModeChange={handleModeChange}
              onStickerUpload={handleStickerUpload}
              onPresetPick={handlePresetPick}
              textStyle={textStyle}
              onTextStyleChange={(s) => {
                setTextStyle(s);
                if (gif && targetRect && !textTransform) {
                  setTextTransform(getDefaultTextTransform(gif, targetRect));
                }
                setStep('export');
              }}
              blurStyle={blurStyle}
              onBlurStyleChange={(s) => {
                setBlurStyle(s);
              }}
            />
          </div>
        );

      case 'export':
        return (
          <div className="sidebar__step">
            <div className="step-nav">
              <button type="button" className="step-nav__back" onClick={handleBack} disabled={isBusy}>
                Back
              </button>
              <span className="step-nav__count">Step 4 of 4</span>
            </div>
            {/* Show overlay controls when in sticker/text/blur mode */}
            {overlayMode && (
              <OverlayPicker
                mode={overlayMode}
                onModeChange={handleModeChange}
                onStickerUpload={handleStickerUpload}
                onPresetPick={handlePresetPick}
                textStyle={textStyle}
                onTextStyleChange={(s) => {
                  setTextStyle(s);
                  if (gif && targetRect && !textTransform) {
                    setTextTransform(getDefaultTextTransform(gif, targetRect));
                  }
                }}
                blurStyle={blurStyle}
                onBlurStyleChange={setBlurStyle}
              />
            )}
            <div className="export-actions">
              <button
                type="button"
                className="button button--full"
                onClick={() => handleExport('gif')}
                disabled={isBusy}
              >
                {isExporting ? `Exporting…` : 'Export GIF'}
              </button>
              <button
                type="button"
                className="button button--secondary button--full"
                onClick={() => handleExport('webp')}
                disabled={isBusy || webpSupported === false}
                title={webpSupported === false ? 'WebP export is unavailable in this browser.' : undefined}
              >
                {webpSupported === false ? 'WebP Unavailable' : 'Export WebP'}
              </button>
            </div>
            <button type="button" className="start-over-link" onClick={resetAll} disabled={isBusy}>
              Start over
            </button>
          </div>
        );
    }
  };

  /* ── Canvas area content per step ─────────────────────── */

  const renderCanvas = () => {
    // Step A: drop zone fills the canvas area
    if (step === 'input') {
      return (
        <div className="empty-canvas">
          <h1>Pin anything to a moving subject. Runs entirely in your browser.</h1>
          <p>Your GIFs never leave your device.</p>
          <div className="empty-canvas__actions">
            <button type="button" className="button" onClick={() => void handleSampleLoad()} disabled={isBusy}>
              Try The Sample Clip
            </button>
          </div>
        </div>
      );
    }

    // Step B: editor canvas with tap-to-place
    if (step === 'pick-subject' && gif && firstFrame) {
      return (
        <>
          <div className="canvas-stage canvas-stage--tracking">
            <EditorCanvas
              frame={firstFrame}
              tapToPlace={!targetRect}
              targetRect={targetRect}
              onTargetRectChange={(r) => {
                clearDownstreamState();
                setTargetRect(clampRectToBounds(r, gif.width, gif.height));
              }}
              onTapPlace={handleTapPlace}
            />
          </div>
          <div className="canvas-meta">
            <span>{gif.width}×{gif.height}</span>
            <span>{gif.frames.length} frames</span>
            <span>{truncateFilename(gif.name, 28)}</span>
          </div>
        </>
      );
    }

    // Step C: tracking in progress
    if (step === 'tracking' && gif && firstFrame) {
      return (
        <>
          <div className="canvas-stage">
            <canvas
              ref={(canvas) => {
                if (!canvas || !firstFrame) return;
                canvas.width = firstFrame.width;
                canvas.height = firstFrame.height;
                const ctx = canvas.getContext('2d');
                if (ctx) ctx.putImageData(firstFrame, 0, 0);
              }}
            />
            <div className="canvas-progress">
              <div className="canvas-progress__fill" style={{ width: `${status.progress * 100}%` }} />
            </div>
          </div>
        </>
      );
    }

    // Steps D & E: preview player (with or without overlay)
    if ((step === 'overlay' || step === 'export') && gif && composedFrames) {
      return (
        <>
          <PreviewPlayer
            gif={gif}
            overlay={overlayMode === 'sticker' ? overlay : null}
            textStyle={overlayMode === 'text' ? textStyle : null}
            trackingFrames={composedFrames}
            blurStyle={overlayMode === 'blur' ? blurStyle : null}
            progressValue={isExporting ? status.progress : undefined}
          />
          <div className="canvas-meta">
            <span>{gif.width}×{gif.height}</span>
            <span>{gif.frames.length} frames</span>
            <span>{truncateFilename(gif.name, 28)}</span>
          </div>
        </>
      );
    }

    return null;
  };

  /* ── Render ────────────────────────────────────────────── */

  return (
    <main className="app-shell">
      <div className={`product-frame ${step === 'input' ? 'product-frame--empty' : ''}`}>
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar__brand" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img src={logoAsset} alt="" className="brand-logo" />
              <span className="brand-text">StickToGif</span>
            </div>
            <button
              type="button"
              className="playback-bar__btn"
              style={{ width: 32, height: 32, fontSize: '0.85rem' }}
              onClick={() => setShowHelp(true)}
              aria-label="Help"
            >
              ?
            </button>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          <div className="stepper" aria-label="Progress">
            {flowSteps.map((label, index) => {
              const statusName =
                index < activeFlowStep ? 'done' : index === activeFlowStep ? 'current' : 'upcoming';
              return (
                <div
                  key={label}
                  className={`stepper__item stepper__item--${statusName}`}
                  aria-current={index === activeFlowStep ? 'step' : undefined}
                >
                  <span className="stepper__dot">{index + 1}</span>
                  <span className="stepper__label">{label}</span>
                </div>
              );
            })}
          </div>
          {renderSidebar()}
        </aside>

        {/* Main area */}
        <div className="main-area">
          <ErrorBoundary onReset={resetAll}>
            {renderCanvas()}
          </ErrorBoundary>
        </div>
      </div>

      {/* Help Modal */}
      <Modal isOpen={showHelp} onClose={() => setShowHelp(false)} title="How to use StickToGif">
        <div className="prose">
          <p><strong>StickToGif</strong> is a fast, local tool to pin an image, text, or a blur effect onto a moving object inside a short animation.</p>
          <ol>
            <li><strong>Input:</strong> Drop a GIF or MP4, or paste a GIF URL to get started.</li>
            <li><strong>Pick Subject:</strong> Tap or click on the object you want to track. A tracking box will appear. Drag its corners to resize it exactly around the subject.</li>
            <li><strong>Track:</strong> Hit Track. The engine runs locally in your browser to follow the object frame-by-frame.</li>
            <li><strong>Overlay:</strong> Choose between a Sticker, Text, or Blur effect. The app instantly attaches it to the tracked motion.</li>
            <li><strong>Export:</strong> Save your final animated GIF or WebP directly to your device!</li>
          </ol>
          <p><em>Privacy: Everything runs entirely in your browser. No files are uploaded or stored anywhere.</em></p>
        </div>
      </Modal>
    </main>
  );
}
