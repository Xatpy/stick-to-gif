import { useEffect, useState } from 'react';
import { DropZone } from './components/DropZone';
import { EditorCanvas } from './components/EditorCanvas';
import { Modal } from './components/Modal';
import { OverlayPicker } from './components/OverlayPicker';
import { PreviewPlayer } from './components/PreviewPlayer';
import { exportGif } from './gif/exportGif';
import { decodeSource } from './media/decodeSource';
import { exportAnimatedWebp } from './webp/exportWebp';
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

/* ── Helpers ────────────────────────────────────────────────── */

function getDefaultTargetRect(gif: DecodedGif, center: Point): Rect {
  const size = Math.min(gif.width, gif.height) * 0.2;
  return clampRectToBounds(
    { x: center.x - size / 2, y: center.y - size / 2, width: size, height: size },
    gif.width,
    gif.height,
  );
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
  const [, setDebugLog] = useState<DebugEntry[]>([]);

  useEffect(() => {
    return () => { if (overlay?.objectUrl) URL.revokeObjectURL(overlay.objectUrl); };
  }, [overlay]);

  const firstFrame = gif?.frames[0]?.imageData ?? null;
  const isExporting = status.stage === 'exporting';
  const isBusy = status.stage !== 'idle';

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
    if (!gif) return;
    setTargetRect(getDefaultTargetRect(gif, point));
  };

  const handleTrack = async () => {
    if (!gif || !targetRect) return;

    try {
      setError(null);
      setDebugLog([]);
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
          </div>
        );

      case 'pick-subject':
        return (
          <div className="sidebar__step">
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
                disabled={isBusy}
              >
                Export WebP
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
          <h1>Pin something to a moving subject — locally, in seconds.</h1>
          <p>Drop a GIF or MP4 above or tap to choose from your files.</p>
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
              onTargetRectChange={(r) => setTargetRect(clampRectToBounds(r, gif.width, gif.height))}
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
          {renderSidebar()}
        </aside>

        {/* Main area */}
        <div className="main-area">
          {renderCanvas()}
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
