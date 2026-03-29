import { useEffect, useMemo, useState } from 'react';
import { EditorCanvas } from './components/EditorCanvas';
import { Modal } from './components/Modal';
import { PreviewPlayer } from './components/PreviewPlayer';
import { StatusBanner } from './components/StatusBanner';
import { UploadCard } from './components/UploadCard';
import { decodeGif } from './gif/decodeGif';
import { exportGif } from './gif/exportGif';
import { exportAnimatedWebp } from './webp/exportWebp';
import { trackObject } from './tracking/trackObject';
import type { DebugEntry } from './lib/debug';
import type {
  DecodedGif,
  OverlayAsset,
  OverlayTransform,
  Rect,
  StatusState,
  TrackingFrame,
} from './types';
import { clampRectToBounds, rectCenter, round } from './utils/math';

const idleStatus: StatusState = {
  stage: 'idle',
  message: '',
  progress: 0,
};

function getDefaultTargetRect(gif: DecodedGif): Rect {
  return {
    x: gif.width * 0.3,
    y: gif.height * 0.3,
    width: gif.width * 0.2,
    height: gif.height * 0.2,
  };
}

function getDefaultOverlayTransform(
  gif: DecodedGif,
  overlay: OverlayAsset,
  targetRect: Rect,
): OverlayTransform {
  const maxWidth = gif.width * 0.32;
  const scale = Math.min(1, maxWidth / overlay.width);
  const width = overlay.width * scale;
  const height = overlay.height * scale;
  const targetCenter = rectCenter(targetRect);

  return {
    x: targetCenter.x,
    y: targetCenter.y,
    width,
    height,
    rotation: 0,
  };
}

async function loadOverlay(file: File): Promise<OverlayAsset> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const bitmap = await createImageBitmap(file);
    return {
      name: file.name,
      width: bitmap.width,
      height: bitmap.height,
      source: bitmap,
      objectUrl,
    };
  } catch {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () => reject(new Error('Unable to decode that overlay image.'));
      next.src = objectUrl;
    });

    return {
      name: file.name,
      width: image.naturalWidth,
      height: image.naturalHeight,
      source: image,
      objectUrl,
    };
  }
}

async function loadRemoteFile(url: string, expectedMimePrefix: string, fallbackName: string) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('That pasted text is not a valid URL.');
  }

  const response = await fetch(parsedUrl.toString(), { mode: 'cors' });
  if (!response.ok) {
    throw new Error('Unable to fetch that URL from the browser.');
  }

  const blob = await response.blob();
  if (!blob.type.startsWith(expectedMimePrefix)) {
    throw new Error(
      `That URL did not return a supported ${expectedMimePrefix.replace('/', ' ')} file. Some hosts block direct browser fetches or return the wrong content type.`,
    );
  }

  const pathname = parsedUrl.pathname.split('/').pop() || fallbackName;
  return new File([blob], pathname, { type: blob.type });
}

export default function App() {
  const [gif, setGif] = useState<DecodedGif | null>(null);
  const [overlay, setOverlay] = useState<OverlayAsset | null>(null);
  const [overlayTransform, setOverlayTransform] = useState<OverlayTransform | null>(null);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [trackingFrames, setTrackingFrames] = useState<TrackingFrame[] | null>(null);
  const [status, setStatus] = useState<StatusState>(idleStatus);
  const [error, setError] = useState<string | null>(null);
  const [debugLog, setDebugLog] = useState<DebugEntry[]>([]);
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [guideModalOpen, setGuideModalOpen] = useState(false);

  useEffect(() => {
    return () => {
      if (overlay?.objectUrl) {
        URL.revokeObjectURL(overlay.objectUrl);
      }
    };
  }, [overlay]);

  const firstFrame = gif?.frames[0]?.imageData ?? null;
  const readyToTrack = Boolean(gif && overlay && overlayTransform && targetRect);
  const setupStats = useMemo(() => {
    if (!gif || !targetRect) {
      return null;
    }

    return {
      gifSize: `${gif.width}x${gif.height}`,
      frameCount: gif.frames.length,
      overlaySize: overlayTransform
        ? `${Math.round(overlayTransform.width)}x${Math.round(overlayTransform.height)}`
        : 'Upload overlay',
      target: `${round(targetRect.x)}, ${round(targetRect.y)} / ${round(targetRect.width)} x ${round(targetRect.height)}`,
    };
  }, [gif, overlayTransform, targetRect]);

  const resetState = () => {
    if (overlay?.objectUrl) {
      URL.revokeObjectURL(overlay.objectUrl);
    }
    setGif(null);
    setOverlay(null);
    setOverlayTransform(null);
    setTargetRect(null);
    setTrackingFrames(null);
    setStatus(idleStatus);
    setError(null);
    setDebugLog([]);
  };

  const appendDebug = (entry: DebugEntry) => {
    setDebugLog((current) => [...current.slice(-199), entry]);
  };

  const handleGifUpload = async (file: File) => {
    try {
      setError(null);
      setDebugLog([]);
      setStatus({
        stage: 'decoding',
        message: 'Decoding GIF frames in your browser',
        progress: 0.15,
      });
      const decoded = await decodeGif(file);
      const nextTargetRect = getDefaultTargetRect(decoded);
      setGif(decoded);
      setTargetRect(nextTargetRect);
      setTrackingFrames(null);
      setStatus(idleStatus);

      if (overlay) {
        setOverlayTransform(getDefaultOverlayTransform(decoded, overlay, nextTargetRect));
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Unable to load that GIF.',
      );
      setStatus(idleStatus);
    }
  };

  const handleGifUrlPaste = async (url: string) => {
    const file = await loadRemoteFile(url, 'image/gif', 'pasted.gif');
    await handleGifUpload(file);
  };

  const handleOverlayUpload = async (file: File) => {
    try {
      setError(null);
      setDebugLog([]);
      const nextOverlay = await loadOverlay(file);

      if (overlay?.objectUrl) {
        URL.revokeObjectURL(overlay.objectUrl);
      }

      setOverlay(nextOverlay);
      setOverlayTransform(null);
      setTrackingFrames(null);

      if (gif) {
        const rect = targetRect ?? getDefaultTargetRect(gif);
        setTargetRect(rect);
        setOverlayTransform(getDefaultOverlayTransform(gif, nextOverlay, rect));
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Unable to load that overlay image.',
      );
    }
  };

  const handleTrack = async () => {
    if (!gif || !overlayTransform || !targetRect) {
      return;
    }

    try {
      setError(null);
      setDebugLog([]);
      setStatus({
        stage: 'tracking',
        message: 'Loading tracking engine',
        progress: 0.02,
      });
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
      const result = await trackObject({
        gif,
        initialRegion: targetRect,
        initialOverlay: overlayTransform,
        debugReporter: appendDebug,
        onProgress: (update) =>
          setStatus({
            stage: 'tracking',
            message: update.message,
            progress: update.progress,
          }),
      });
      setTrackingFrames(result);
      setStatus(idleStatus);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Tracking failed on this GIF.',
      );
      appendDebug({
        timestamp: new Date().toLocaleTimeString(),
        level: 'error',
        message:
          nextError instanceof Error ? nextError.stack ?? nextError.message : 'Unknown tracking error.',
      });
      setStatus(idleStatus);
    }
  };

  const handleExport = async (format: 'gif' | 'webp') => {
    if (!gif || !overlay || !trackingFrames) {
      return;
    }

    try {
      setError(null);
      setDebugLog([]);
      setStatus({
        stage: 'exporting',
        message: format === 'gif' ? 'Encoding your edited GIF' : 'Encoding your animated WebP',
        progress: 0,
      });
      const blob =
        format === 'gif'
          ? await exportGif({
              gif,
              overlay,
              trackingFrames,
              onProgress: (progress) =>
                setStatus({
                  stage: 'exporting',
                  message: 'Encoding your edited GIF',
                  progress,
                }),
            })
          : await exportAnimatedWebp({
              gif,
              overlay,
              trackingFrames,
              onProgress: (progress) =>
                setStatus({
                  stage: 'exporting',
                  message: 'Encoding your animated WebP',
                  progress,
                }),
            });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${gif.name.replace(/\.gif$/i, '')}-tracked.${format}`;
      link.click();
      URL.revokeObjectURL(downloadUrl);
      setStatus(idleStatus);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Export failed.',
      );
      setStatus(idleStatus);
    }
  };

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">StickToGif</p>
          <h1>Upload, place, track, export.</h1>
        </div>
        <div className="topbar__meta">
          <span>Local-only</span>
          <span>Mobile-ready</span>
        </div>
      </section>

      <StatusBanner status={status} error={error} debugLog={debugLog} />

      <section className="asset-strip">
        <div className="panel asset-strip__panel">
          <div className="asset-strip__header">
            <div>
              <p className="eyebrow">Step 1</p>
              <h2>Load your files</h2>
            </div>
            <div className="asset-strip__tools">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setSetupModalOpen(true)}
              >
                Setup
              </button>
              <button
                type="button"
                className="button button--secondary"
                onClick={resetState}
                disabled={status.stage !== 'idle'}
              >
                Reset
              </button>
            </div>
          </div>
          <div className="upload-grid">
            <UploadCard
              title="1. GIF"
              description="Animated source GIF"
              accept="image/gif"
              buttonLabel={gif ? 'Replace GIF' : 'Upload GIF'}
              fileName={gif?.name ?? null}
              onFileSelected={handleGifUpload}
              onPasteImage={handleGifUpload}
              onPasteError={setError}
              onPasteUrl={handleGifUrlPaste}
            />
            <UploadCard
              title="2. Overlay"
              description="Overlay image"
              accept="image/png,image/jpeg,image/webp,image/gif"
              buttonLabel={overlay ? 'Replace Overlay' : 'Upload Overlay'}
              fileName={overlay?.name ?? null}
              disabled={!gif}
              onFileSelected={handleOverlayUpload}
              onPasteImage={handleOverlayUpload}
              onPasteError={setError}
            />
          </div>
        </div>
      </section>

      {!gif && (
        <section className="empty-state">
          <h2>Start with the source GIF</h2>
          <p>
            Load the GIF first, then add the overlay image and place both directly in the editor.
          </p>
        </section>
      )}

      {gif && firstFrame && targetRect && (
        <section className="workspace">
          <div className="panel">
            <div className="panel__header">
              <div>
                <p className="eyebrow">Step 2</p>
                <h2>Position on frame one</h2>
              </div>
              <div className="panel__actions">
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => setGuideModalOpen(true)}
                >
                  Guide
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={handleTrack}
                  disabled={!readyToTrack || status.stage !== 'idle'}
                >
                  Track
                </button>
              </div>
            </div>
            <p className="panel__copy">
              {overlayTransform
                ? 'Drag the overlay. Yellow handle scales. Floating dot rotates. Mint box is the tracking area.'
                : 'The GIF is ready. Add an overlay image to place it here, then adjust the mint tracking box.'}
            </p>
            <EditorCanvas
              frame={firstFrame}
              overlay={overlay}
              overlayTransform={
                overlayTransform ?? {
                  x: rectCenter(targetRect).x,
                  y: rectCenter(targetRect).y,
                  width: 1,
                  height: 1,
                  rotation: 0,
                }
              }
              targetRect={targetRect}
              onOverlayChange={(transform) => {
                setOverlayTransform(transform);
                setTrackingFrames(null);
              }}
              onTargetRectChange={(nextRect) => {
                setTargetRect(clampRectToBounds(nextRect, gif.width, gif.height));
                setTrackingFrames(null);
              }}
            />
          </div>
        </section>
      )}

      {gif && overlay && trackingFrames && (
        <section className="preview-section">
          <div className="panel">
            <div className="panel__header">
              <div>
                <p className="eyebrow">Step 3</p>
                <h2>Tracked result</h2>
              </div>
              <button
                type="button"
                className="button"
                onClick={() => handleExport('gif')}
                disabled={status.stage !== 'idle'}
              >
                Export GIF
              </button>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => handleExport('webp')}
                disabled={status.stage !== 'idle'}
              >
                Export WebP
              </button>
            </div>
            <PreviewPlayer gif={gif} overlay={overlay} trackingFrames={trackingFrames} />
          </div>
        </section>
      )}

      <Modal
        title="Setup"
        open={setupModalOpen}
        onClose={() => setSetupModalOpen(false)}
      >
        <div className="stat-list">
          <div>
            <span>GIF</span>
            <strong>{gif?.name ?? 'Missing'}</strong>
          </div>
          <div>
            <span>Frames</span>
            <strong>{setupStats?.frameCount ?? 'n/a'}</strong>
          </div>
          <div>
            <span>Canvas</span>
            <strong>{setupStats?.gifSize ?? 'n/a'}</strong>
          </div>
          <div>
            <span>Overlay</span>
            <strong>{overlay?.name ?? 'Missing'}</strong>
          </div>
          <div>
            <span>Overlay size</span>
            <strong>{setupStats?.overlaySize ?? 'Upload overlay'}</strong>
          </div>
          <div>
            <span>Target rect</span>
            <strong>{setupStats?.target ?? 'n/a'}</strong>
          </div>
        </div>
      </Modal>

      <Modal
        title="Guide"
        open={guideModalOpen}
        onClose={() => setGuideModalOpen(false)}
      >
        <ul className="info-list">
          <li>Step 1: upload the GIF and confirm the first frame looks right.</li>
          <li>Step 2: upload the overlay and place it where it should stick.</li>
          <li>Resize the mint box around the object you want to track.</li>
          <li>The dashed grey line previews how the overlay is anchored to that target.</li>
          <li>Track first, review the preview, then export the final GIF.</li>
        </ul>
      </Modal>
    </main>
  );
}
