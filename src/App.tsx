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
import {
  getAppAssetUrl,
  getAppHomeHref,
  isNativeMobilePlatform,
} from './lib/platform';
import { exportResultNatively } from './mobile/exportResult';
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
  fontFamily: 'Impact, "Arial Black", sans-serif',
  fontWeight: 800,
};

const defaultBlurStyle: BlurStyle = { intensity: 0.5 };
const flowSteps = ['Upload', 'Pick subject', 'Choose effect', 'Export'] as const;
const MAX_UPLOADED_STICKER_DIMENSION = 1024;

/* ── Helpers ────────────────────────────────────────────────── */

import { getDefaultTargetRect } from './utils/imageAnalysis';

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
    y: center.y,
    width: Math.min(gif.width * 0.6, 320),
    height: Math.max(36, gif.height * 0.12),
    rotation: 0,
  };
}

function scaleOverlayTransform(
  transform: OverlayTransform,
  nextScale: number,
  previousScale: number,
): OverlayTransform {
  const ratio = nextScale / Math.max(previousScale, 0.001);
  return {
    ...transform,
    width: Math.max(24, transform.width * ratio),
    height: Math.max(24, transform.height * ratio),
  };
}

async function loadOverlay(file: File): Promise<OverlayAsset> {
  const originalObjectUrl = URL.createObjectURL(file);
  let optimizedObjectUrl: string | null = null;

  const decodeAssetFromBlob = async (blob: Blob, objectUrl: string) => {
    try {
      const bitmap = await createImageBitmap(blob);
      return { width: bitmap.width, height: bitmap.height, source: bitmap as CanvasImageSource, objectUrl };
    } catch {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const next = new Image();
        next.onload = () => resolve(next);
        next.onerror = () => reject(new Error('Unable to decode that overlay image.'));
        next.src = objectUrl;
      });

      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        source: image as CanvasImageSource,
        objectUrl,
      };
    }
  };

  const encodeCanvas = (canvas: HTMLCanvasElement) =>
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
            return;
          }
          reject(new Error('Unable to optimize that overlay image.'));
        },
        'image/webp',
        0.9,
      );
    });

  try {
    const decoded = await decodeAssetFromBlob(file, originalObjectUrl);
    const maxDimension = Math.max(decoded.width, decoded.height);

    if (maxDimension <= MAX_UPLOADED_STICKER_DIMENSION) {
      return { name: file.name, ...decoded };
    }

    const scale = MAX_UPLOADED_STICKER_DIMENSION / maxDimension;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to optimize that overlay image.');
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
    if (decoded.source instanceof ImageBitmap) {
      decoded.source.close();
    }

    const optimizedBlob = await encodeCanvas(canvas);
    optimizedObjectUrl = URL.createObjectURL(optimizedBlob);
    URL.revokeObjectURL(originalObjectUrl);

    return { name: file.name, ...(await decodeAssetFromBlob(optimizedBlob, optimizedObjectUrl)) };
  } catch (error) {
    URL.revokeObjectURL(originalObjectUrl);
    if (optimizedObjectUrl) {
      URL.revokeObjectURL(optimizedObjectUrl);
    }
    throw error;
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
  const response = await fetch(getAppAssetUrl('demo.gif'));
  if (!response.ok) {
    throw new Error('Unable to load the sample clip.');
  }

  const blob = await response.blob();
  return new File([blob], 'demo.gif', { type: blob.type || 'image/gif' });
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
  const [stickerScale, setStickerScale] = useState(1);
  const [textStyle, setTextStyle] = useState<TextOverlayStyle>(defaultTextStyle);
  const [textTransform, setTextTransform] = useState<OverlayTransform | null>(null);
  const [textScale, setTextScale] = useState(1);
  const [blurStyle, setBlurStyle] = useState<BlurStyle>(defaultBlurStyle);
  const [status, setStatus] = useState<StatusState>(idleStatus);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [webpSupported, setWebpSupported] = useState<boolean | null>(null);
  const [preferShareLabel, setPreferShareLabel] = useState(false);
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

  const isNativeMobile = isNativeMobilePlatform();

  useEffect(() => {
    if (isNativeMobile) {
      setPreferShareLabel(true);
      return;
    }

    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(max-width: 767px) and (pointer: coarse)');
    const syncPreference = () => setPreferShareLabel(mediaQuery.matches);
    syncPreference();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncPreference);
      return () => mediaQuery.removeEventListener('change', syncPreference);
    }

    mediaQuery.addListener(syncPreference);
    return () => mediaQuery.removeListener(syncPreference);
  }, [isNativeMobile]);

  const [firstFrame, setFirstFrame] = useState<ImageData | null>(null);
  const isExporting = status.stage === 'exporting';

  useEffect(() => {
    let cancelled = false;
    if (gif?.frames[0]?.blob) {
      createImageBitmap(gif.frames[0].blob)
        .then((bitmap) => {
          if (cancelled) {
            bitmap.close();
            return;
          }
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(bitmap, 0, 0);
            setFirstFrame(ctx.getImageData(0, 0, canvas.width, canvas.height));
          }
          bitmap.close();
        })
        .catch(() => { });
    } else {
      setFirstFrame(null);
    }
    return () => {
      cancelled = true;
    };
  }, [gif]);
  const isBusy = status.stage !== 'idle';
  const primaryExportLabel = preferShareLabel ? 'Share GIF' : 'Download GIF';
  const secondaryExportLabel = preferShareLabel ? 'Share WebP' : 'Download WebP';
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
    // Blur mode or no overlay - use raw tracking frames
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
    setStickerScale(1);
    setTextTransform(null);
    setTextScale(1);
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
    setStickerScale(1);
    setTextStyle(defaultTextStyle);
    setTextTransform(null);
    setTextScale(1);
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
    setTimeout(() => {
      setTargetRect(getDefaultTargetRect(gif, firstFrame, point));
    }, 0);
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

      setStatus({ stage: 'tracking', message: 'Tracking complete! Reviewing...', progress: 1.0 });
      setTrackingFrames(result);

      await new Promise((resolve) => setTimeout(resolve, 1500));

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

  const handleStepJump = (stepIndex: number) => {
    if (isBusy || stepIndex >= activeFlowStep) return;

    switch (stepIndex) {
      case 0:
        setStep('input');
        break;
      case 1:
        setStep('pick-subject');
        break;
      case 2:
        setStep('overlay');
        break;
      default:
        break;
    }
  };

  const handleModeChange = (mode: OverlayMode) => {
    setOverlayMode(mode);
    if (mode === 'text') {
      setTextStyle((s) => ({ ...s, enabled: true }));
      if (gif && targetRect && !textTransform) {
        setTextScale(1);
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
        setStickerScale(1);
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
      setStickerScale(1);
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
      const filename = `${gif.name.replace(/\.[^.]+$/i, '') || 'sticktogif'}-sticktogif.${format}`;
      const file = new File([blob], filename, { type: blob.type });

      setStatus(idleStatus);

      if (isNativeMobile) {
        await exportResultNatively({
          blob,
          filename,
          title: 'StickToGif export',
          debugReporter: appendDebug,
        });
      } else if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'StickToGif export',
          });
        } catch (shareErr) {
          // Fallback to downloading if sharing gets aborted
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          link.click();
        }
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
      }

      // Cleanup happens eventually or handled safely via object urls
      setTimeout(() => URL.revokeObjectURL(url), 1000 * 60);
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
          <div className="sidebar__step" data-step="input">
            <div className="input-sidebar">
              <h1 className="input-sidebar__headline">Tracked stickers for your GIFs - right on your device.</h1>
              <div className="privacy-badge" role="note" aria-label="100 percent private, no uploads, instant processing">
                <span className="privacy-badge__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M12 2 5 5v6c0 5.2 3 9.9 7 11 4-1.1 7-5.8 7-11V5l-7-3Zm0 2.2 5 2.1V11c0 4.1-2.2 7.9-5 9-2.8-1.1-5-4.9-5-9V6.3l5-2.1Zm0 2.3a3 3 0 0 0-3 3v1h-.4A1.6 1.6 0 0 0 7 12.1v3.3A1.6 1.6 0 0 0 8.6 17h6.8a1.6 1.6 0 0 0 1.6-1.6v-3.3a1.6 1.6 0 0 0-1.6-1.6H15v-1a3 3 0 0 0-3-3Zm0 2a1 1 0 0 1 1 1v1h-2v-1a1 1 0 0 1 1-1Z" />
                  </svg>
                </span>
                <span>100% private · no uploads · instant processing</span>
              </div>
              <button type="button" className="button button--full input-sidebar__cta" onClick={() => void handleSampleLoad()} disabled={isBusy}>
                Try the sample clip →
              </button>
              <DropZone
                onFileSelected={handleGifUpload}
                onPasteUrl={handlePasteUrl}
                onError={setError}
                label={isNativeMobile ? 'Choose a GIF or MP4 from your device' : 'or drop your own GIF / MP4'}
                hint={isNativeMobile ? 'or tap to browse your device storage' : undefined}
                compact
              />
            </div>
          </div>
        );

      case 'pick-subject':
        return (
          <div className="sidebar__step" data-step="pick-subject">
            <div className="step-nav">
              <button type="button" className="step-nav__back" onClick={handleBack} disabled={isBusy}>
                <span aria-hidden="true">←</span>
                <span>Back</span>
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
          <div className="sidebar__step" data-step="tracking">
            <div className="step-nav">
              <button type="button" className="step-nav__back" onClick={handleBack} disabled>
                <span aria-hidden="true">←</span>
                <span>Back</span>
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
          <div className="sidebar__step" data-step="overlay">
            <div className="step-nav">
              <button type="button" className="step-nav__back" onClick={handleBack} disabled={isBusy}>
                <span aria-hidden="true">←</span>
                <span>Back</span>
              </button>
              <span className="step-nav__count">Step 3 of 4</span>
            </div>
            <OverlayPicker
              mode={overlayMode}
              onModeChange={handleModeChange}
              onStickerUpload={handleStickerUpload}
              onPresetPick={handlePresetPick}
              stickerScale={stickerScale}
              onStickerScaleChange={(nextScale) => {
                setStickerScale((previousScale) => {
                  if (overlayTransform) {
                    setOverlayTransform(scaleOverlayTransform(overlayTransform, nextScale, previousScale));
                  }
                  return nextScale;
                });
              }}
              textStyle={textStyle}
              onTextStyleChange={(s) => {
                setTextStyle(s);
                if (gif && targetRect && !textTransform) {
                  setTextScale(1);
                  setTextTransform(getDefaultTextTransform(gif, targetRect));
                }
                setStep('export');
              }}
              textScale={textScale}
              onTextScaleChange={(nextScale) => {
                setTextScale((previousScale) => {
                  if (textTransform) {
                    setTextTransform(scaleOverlayTransform(textTransform, nextScale, previousScale));
                  }
                  return nextScale;
                });
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
          <div className="sidebar__step" data-step="export">
            <div className="step-nav">
              <button type="button" className="step-nav__back" onClick={handleBack} disabled={isBusy}>
                <span aria-hidden="true">←</span>
                <span>Back</span>
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
                stickerScale={stickerScale}
                onStickerScaleChange={(nextScale) => {
                  setStickerScale((previousScale) => {
                    if (overlayTransform) {
                      setOverlayTransform(scaleOverlayTransform(overlayTransform, nextScale, previousScale));
                    }
                    return nextScale;
                  });
                }}
                textStyle={textStyle}
                onTextStyleChange={(s) => {
                  setTextStyle(s);
                  if (gif && targetRect && !textTransform) {
                    setTextScale(1);
                    setTextTransform(getDefaultTextTransform(gif, targetRect));
                  }
                }}
                textScale={textScale}
                onTextScaleChange={(nextScale) => {
                  setTextScale((previousScale) => {
                    if (textTransform) {
                      setTextTransform(scaleOverlayTransform(textTransform, nextScale, previousScale));
                    }
                    return nextScale;
                  });
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
                {isExporting ? `Exporting…` : primaryExportLabel}
              </button>
              <button
                type="button"
                className="button button--secondary button--full"
                onClick={() => handleExport('webp')}
                disabled={isBusy || webpSupported === false}
                title={webpSupported === false ? 'WebP export is unavailable in this browser.' : undefined}
              >
                {webpSupported === false ? 'WebP Unavailable' : secondaryExportLabel}
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
          <div className="empty-canvas__media">
            <img
              className="empty-canvas__demo"
              src={getAppAssetUrl('demo.gif')}
              alt="Demo GIF showing a sticker tracked onto a moving subject"
            />
          </div>
          <p className="empty-canvas__caption">Made with StickToGif</p>
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

    // Step C: tracking in progress (before completion)
    if (step === 'tracking' && !trackingFrames && gif && firstFrame) {
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

    // Steps D & E (and magic moment during C): preview player
    if ((step === 'overlay' || step === 'export' || (step === 'tracking' && trackingFrames)) && gif && composedFrames) {
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

  const renderBrand = (className = 'sidebar__brand') => (
    <div className={`${className} brand-bar`}>
      <a
        href={getAppHomeHref()}
        className="brand-link"
        aria-label="Go to StickToGif home"
      >
        <img src={logoAsset} alt="" className="brand-logo" />
        <span className="brand-text">StickToGif</span>
      </a>
      <button
        type="button"
        className="playback-bar__btn brand-help-btn"
        onClick={() => setShowHelp(true)}
        aria-label="Help"
      >
        ?
      </button>
    </div>
  );

  const renderStepper = () => (
    <div className="stepper" aria-label="Progress">
      {flowSteps.map((label, index) => {
        const statusName =
          index < activeFlowStep ? 'done' : index === activeFlowStep ? 'current' : 'upcoming';
        const isJumpable = !isBusy && index < activeFlowStep;
        return (
          <button
            key={label}
            type="button"
            className={`stepper__item stepper__item--${statusName}`}
            aria-current={index === activeFlowStep ? 'step' : undefined}
            aria-label={isJumpable ? `Go back to ${label}` : label}
            disabled={!isJumpable}
            onClick={() => handleStepJump(index)}
          >
            <span className="stepper__dot">{index + 1}</span>
            <span className="stepper__label">{label}</span>
          </button>
        );
      })}
    </div>
  );

  const renderHelpModal = () => (
    <Modal isOpen={showHelp} onClose={() => setShowHelp(false)} title="How to use StickToGif">
      <div className="prose">
        <p><strong>StickToGif</strong> is a fast, local tool to pin an image, text, or a blur effect onto a moving object inside a short animation.</p>
        <ol>
          <li><strong>Input:</strong> Choose a GIF or MP4 from your device, or paste a GIF URL to get started.</li>
          <li><strong>Pick Subject:</strong> Tap or click on the object you want to track. A tracking box will appear. Drag its corners to resize it exactly around the subject.</li>
          <li><strong>Track:</strong> Hit Track. The engine runs locally on your device to follow the object frame-by-frame.</li>
          <li><strong>Overlay:</strong> Choose between a Sticker, Text, or Blur effect. The app instantly attaches it to the tracked motion.</li>
          <li><strong>Export:</strong> Save or share your final animated GIF or WebP directly from your device.</li>
        </ol>
        <p><em>Privacy: Everything runs entirely on your device. No files are uploaded or stored anywhere beyond local export files you choose to keep.</em></p>
      </div>
    </Modal>
  );

  return (
    <main className="app-shell">
      {renderBrand('mobile-topbar')}
      <div className={`product-frame ${step === 'input' ? 'product-frame--empty' : ''}`}>
        {/* Sidebar */}
        <aside className="sidebar">
          {renderBrand()}
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          {step !== 'input' && renderStepper()}
          {renderSidebar()}
        </aside>

        {/* Main area */}
        <div className="main-area">
          <ErrorBoundary onReset={resetAll}>
            {renderCanvas()}
          </ErrorBoundary>
        </div>
      </div>

      {renderHelpModal()}
    </main>
  );
}
