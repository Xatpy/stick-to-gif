import { useEffect, useRef, useState } from 'react';
import type { Point, Rect } from '../types';
import { applyPolygonMask } from '../media/applyPolygonMask';
import { isFullImageCrop, cropImageBitmapToBlob, normalizeCropRect } from '../media/cropImage';
import { ImageCropper } from './ImageCropper';
import { PolygonMaskEditor } from './PolygonMaskEditor';
import { Modal } from './Modal';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';
type ModalStage = 'crop' | 'review' | 'manual';
type PreviewMode = 'crop' | 'cutout';

interface BackgroundRemovalModalProps {
  isOpen: boolean;
  file: File | null;
  onClose: () => void;
  onUseImage: (file: File) => void;
}

function buildCropFilename(name: string) {
  const extensionIndex = name.lastIndexOf('.');
  const baseName = extensionIndex > 0 ? name.slice(0, extensionIndex) : name;
  return `${baseName}-crop.png`;
}

function buildCutoutFilename(name: string) {
  const extensionIndex = name.lastIndexOf('.');
  const baseName = extensionIndex > 0 ? name.slice(0, extensionIndex) : name;
  return `${baseName}-cutout.png`;
}

export function BackgroundRemovalModal({
  isOpen,
  file,
  onClose,
  onUseImage,
}: BackgroundRemovalModalProps) {
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stage, setStage] = useState<ModalStage>('crop');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [cropRect, setCropRect] = useState<Rect | null>(null);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [croppedSize, setCroppedSize] = useState<{ width: number; height: number } | null>(null);
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState<string | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [processedPreviewUrl, setProcessedPreviewUrl] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('crop');
  const [isPreparingCrop, setIsPreparingCrop] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<Point[]>([]);
  const [polygonClosed, setPolygonClosed] = useState(false);
  const activeFileRef = useRef<File | null>(null);

  useEffect(() => {
    activeFileRef.current = file;
  }, [file]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      setImageSize(null);
      setCropRect(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    let cancelled = false;
    const image = new Image();

    image.onload = () => {
      if (cancelled) {
        return;
      }

      setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
      setCropRect({
        x: 0,
        y: 0,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };

    image.onerror = () => {
      if (!cancelled) {
        setImageSize(null);
        setCropRect(null);
        setProcessingError('Unable to preview that image.');
      }
    };

    image.src = nextPreviewUrl;
    setPreviewUrl(nextPreviewUrl);

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
      URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [file]);

  useEffect(() => {
    if (!croppedBlob) {
      setCroppedPreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(croppedBlob);
    setCroppedPreviewUrl(nextPreviewUrl);

    return () => {
      URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [croppedBlob]);

  useEffect(() => {
    if (!processedBlob) {
      setProcessedPreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(processedBlob);
    setProcessedPreviewUrl(nextPreviewUrl);

    return () => {
      URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [processedBlob]);

  useEffect(() => {
    if (!isOpen) {
      setStage('crop');
      setCroppedBlob(null);
      setCroppedSize(null);
      setProcessedBlob(null);
      setPreviewMode('crop');
      setIsPreparingCrop(false);
      setIsRemoving(false);
      setPolygonPoints([]);
      setPolygonClosed(false);
      setLoadError(null);
      if (loadState === 'loading' || loadState === 'error') {
        setLoadState('idle');
      }
      setProcessingError(null);
      return;
    }

    setStage('crop');
    setCroppedBlob(null);
    setCroppedSize(null);
    setProcessedBlob(null);
    setPreviewMode('crop');
    setIsPreparingCrop(false);
    setIsRemoving(false);
    setPolygonPoints([]);
    setPolygonClosed(false);
    setLoadError(null);
    if (loadState === 'error') {
      setLoadState('idle');
    }
    setProcessingError(null);
  }, [file, isOpen]);

  useEffect(() => {
    if (!cropRect) {
      return;
    }

    setStage('crop');
    setCroppedBlob(null);
    setCroppedSize(null);
    setProcessedBlob(null);
    setPreviewMode('crop');
    setPolygonPoints([]);
    setPolygonClosed(false);
    setProcessingError(null);
  }, [cropRect?.x, cropRect?.y, cropRect?.width, cropRect?.height]);

  const createCroppedBlob = async (selectedFile: File, rect: Rect) => {
    const sourceBitmap = await createImageBitmap(selectedFile);

    try {
      return await cropImageBitmapToBlob(sourceBitmap, rect);
    } finally {
      sourceBitmap.close();
    }
  };

  const ensureBackgroundRemovalReady = async () => {
    if (loadState === 'ready') {
      return true;
    }

    setLoadState('loading');
    setLoadError(null);

    try {
      const { preloadBackgroundRemoval } = await import('../segmentation/removeBackground');
      await preloadBackgroundRemoval();
      if (activeFileRef.current !== file) {
        return false;
      }

      setLoadState('ready');
      return true;
    } catch (error) {
      if (activeFileRef.current === file) {
        setLoadState('error');
        setLoadError(error instanceof Error ? error.message : 'Unable to load background removal.');
      }
      return false;
    }
  };

  const handleContinueToReview = async () => {
    if (!file || !cropRect || !imageSize) {
      return;
    }

    try {
      const selectedFile = file;
      setIsPreparingCrop(true);
      setProcessingError(null);
      const normalizedCrop = normalizeCropRect(cropRect, imageSize.width, imageSize.height);
      const nextCroppedBlob = await createCroppedBlob(selectedFile, cropRect);

      if (activeFileRef.current !== selectedFile) {
        return;
      }

      setCroppedSize({
        width: normalizedCrop.width,
        height: normalizedCrop.height,
      });
      setCroppedBlob(nextCroppedBlob);
      setStage('review');
    } catch (error) {
      if (activeFileRef.current === file) {
        setProcessingError(error instanceof Error ? error.message : 'Unable to crop that image.');
      }
    } finally {
      if (activeFileRef.current === file) {
        setIsPreparingCrop(false);
      }
    }
  };

  const handleUseCrop = () => {
    if (!file || !cropRect || !imageSize) {
      return;
    }

    if (isFullImageCrop(cropRect, imageSize.width, imageSize.height)) {
      onUseImage(file);
      return;
    }

    if (!croppedBlob) {
      return;
    }

    onUseImage(new File([croppedBlob], buildCropFilename(file.name), {
      type: 'image/png',
      lastModified: Date.now(),
    }));
  };

  const handleOpenManualOutline = () => {
    if (!croppedBlob || !croppedSize) {
      return;
    }

    setStage('manual');
    setPreviewMode('crop');
    setProcessingError(null);
  };

  const handleRemoveBackground = async () => {
    if (!file || !croppedBlob) {
      return;
    }

    const selectedFile = file;

    try {
      setIsRemoving(true);
      setProcessingError(null);

      const ready = await ensureBackgroundRemovalReady();
      if (!ready || activeFileRef.current !== selectedFile) {
        return;
      }

      const [{ removeBackground }, croppedBitmap] = await Promise.all([
        import('../segmentation/removeBackground'),
        createImageBitmap(croppedBlob),
      ]);

      try {
        const nextProcessedBlob = await removeBackground(croppedBitmap);
        if (activeFileRef.current !== selectedFile) {
          return;
        }

        setProcessedBlob(nextProcessedBlob);
        setPreviewMode('cutout');
      } finally {
        croppedBitmap.close();
      }
    } catch (error) {
      if (activeFileRef.current === selectedFile) {
        setProcessingError(error instanceof Error ? error.message : 'Unable to remove the background.');
      }
    } finally {
      if (activeFileRef.current === selectedFile) {
        setIsRemoving(false);
      }
    }
  };

  const handleUseCutout = () => {
    if (!file || !processedBlob) {
      return;
    }

    onUseImage(new File([processedBlob], buildCutoutFilename(file.name), {
      type: 'image/png',
      lastModified: Date.now(),
    }));
  };

  const handleApplyManualOutline = async () => {
    if (!file || !croppedBlob || !polygonClosed || polygonPoints.length < 3) {
      return;
    }

    const selectedFile = file;

    try {
      setIsRemoving(true);
      setProcessingError(null);
      const croppedBitmap = await createImageBitmap(croppedBlob);

      try {
        const nextProcessedBlob = await applyPolygonMask(croppedBitmap, polygonPoints);
        if (activeFileRef.current !== selectedFile) {
          return;
        }

        setProcessedBlob(nextProcessedBlob);
        setPreviewMode('cutout');
        setStage('review');
      } finally {
        croppedBitmap.close();
      }
    } catch (error) {
      if (activeFileRef.current === selectedFile) {
        setProcessingError(error instanceof Error ? error.message : 'Unable to create that cutout.');
      }
    } finally {
      if (activeFileRef.current === selectedFile) {
        setIsRemoving(false);
      }
    }
  };

  const handleResetCrop = () => {
    if (!imageSize) {
      return;
    }

    setCropRect({
      x: 0,
      y: 0,
      width: imageSize.width,
      height: imageSize.height,
    });
  };

  const canEditCrop = !!previewUrl && !!imageSize && !!cropRect;
  const canReviewCrop = !!croppedPreviewUrl && !!cropRect;
  const activeReviewPreviewUrl = previewMode === 'cutout' && processedPreviewUrl
    ? processedPreviewUrl
    : croppedPreviewUrl;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Crop and remove background">
      <div className="background-removal">
        <p className="background-removal__hint">
          {stage === 'crop'
            ? 'Drag the box to isolate the part of the image you want.'
            : stage === 'manual'
              ? 'Tap around the subject to build a polygon. Tap the first point to close it.'
              : 'Review the cropped part, then either use it directly, remove its background, or outline it manually.'}
        </p>

        <div className="background-removal__toolbar">
          <span className="background-removal__meta">
            {stage === 'crop'
              ? imageSize ? `${imageSize.width} × ${imageSize.height}px source` : 'Preparing image…'
              : croppedSize ? `${croppedSize.width} × ${croppedSize.height}px crop` : cropRect ? `${Math.round(cropRect.width)} × ${Math.round(cropRect.height)}px crop` : 'Preparing crop…'}
          </span>
          {stage === 'crop' ? (
            <button
              type="button"
              className="button button--secondary button--sm"
              onClick={handleResetCrop}
              disabled={!imageSize || isPreparingCrop || isRemoving}
            >
              Reset crop
            </button>
          ) : stage === 'manual' ? (
            <button
              type="button"
              className="button button--secondary button--sm"
              onClick={() => setStage('review')}
              disabled={isPreparingCrop || isRemoving}
            >
              Back to review
            </button>
          ) : (
            <button
              type="button"
              className="button button--secondary button--sm"
              onClick={() => setStage('crop')}
              disabled={isPreparingCrop || isRemoving}
            >
              Edit crop
            </button>
          )}
        </div>

        {stage === 'review' && processedPreviewUrl && (
          <div className="background-removal__tabs" role="tablist" aria-label="Preview mode">
            <button
              type="button"
              className={`background-removal__tab${previewMode === 'crop' ? ' is-active' : ''}`}
              onClick={() => setPreviewMode('crop')}
              aria-pressed={previewMode === 'crop'}
            >
              Crop
            </button>
            <button
              type="button"
              className={`background-removal__tab${previewMode === 'cutout' ? ' is-active' : ''}`}
              onClick={() => setPreviewMode('cutout')}
              aria-pressed={previewMode === 'cutout'}
            >
              Cutout
            </button>
          </div>
        )}

        <div className="background-removal__preview">
          {stage === 'manual' && croppedPreviewUrl && croppedSize ? (
            <PolygonMaskEditor
              imageUrl={croppedPreviewUrl}
              imageWidth={croppedSize.width}
              imageHeight={croppedSize.height}
              points={polygonPoints}
              closed={polygonClosed}
              onPointsChange={setPolygonPoints}
              onClosedChange={setPolygonClosed}
              disabled={isRemoving}
            />
          ) : stage === 'review' && activeReviewPreviewUrl ? (
            <img
              src={activeReviewPreviewUrl}
              alt={previewMode === 'cutout' ? 'Background removed crop preview' : 'Cropped image preview'}
            />
          ) : canEditCrop && previewUrl && imageSize && cropRect ? (
            <ImageCropper
              imageUrl={previewUrl}
              imageWidth={imageSize.width}
              imageHeight={imageSize.height}
              cropRect={cropRect}
              onChange={setCropRect}
              disabled={isRemoving}
            />
          ) : (
            <div className="background-removal__placeholder">Preparing preview…</div>
          )}
        </div>

        <div className="background-removal__status" aria-live="polite">
          {isPreparingCrop && (
            <p>Preparing crop preview…</p>
          )}
          {stage === 'review' && loadState === 'loading' && !isRemoving && (
            <p>Loading background remover…</p>
          )}
          {stage === 'review' && loadError && loadState === 'error' && (
            <p className="background-removal__error">{loadError}</p>
          )}
          {isRemoving && (
            <p>{stage === 'manual' ? 'Creating cutout from the current crop…' : 'Removing background from the current crop…'}</p>
          )}
          {processingError && (
            <p className="background-removal__error">{processingError}</p>
          )}
          {stage === 'crop' && cropRect && !isPreparingCrop && !isRemoving && (
            <p>Drag inside the box to move it. Drag the corners to resize it.</p>
          )}
          {stage === 'manual' && !isRemoving && !processingError && (
            <p>
              {polygonClosed
                ? 'Drag points to adjust the outline, then create the cutout.'
                : polygonPoints.length >= 3
                  ? 'Tap the first point to close the polygon.'
                  : 'Tap to add points around the part you want to keep.'}
            </p>
          )}
          {stage === 'review' && canReviewCrop && !processedBlob && !isPreparingCrop && !isRemoving && !processingError && (
            <p>Use this cropped image as-is, try automatic background removal, or outline it manually.</p>
          )}
          {stage === 'review' && processedBlob && !isRemoving && !processingError && (
            <p>Cutout ready. You can still switch back to the crop, or open manual outline for a cleaner edge.</p>
          )}
        </div>

        <div className={`background-removal__actions background-removal__actions--${stage}`}>
          <button type="button" className="button button--secondary button--full" onClick={onClose}>
            Cancel
          </button>
          {stage === 'crop' ? (
            <button
              type="button"
              className="button button--full"
              onClick={() => void handleContinueToReview()}
              disabled={!canEditCrop || isPreparingCrop || isRemoving}
            >
              {isPreparingCrop ? 'Preparing…' : 'Continue'}
            </button>
          ) : stage === 'manual' ? (
            <>
              <button
                type="button"
                className="button button--secondary button--full"
                onClick={() => {
                  if (polygonPoints.length === 0) {
                    return;
                  }

                  if (polygonClosed) {
                    setPolygonClosed(false);
                    return;
                  }

                  setPolygonPoints((currentPoints) => currentPoints.slice(0, -1));
                }}
                disabled={isRemoving || polygonPoints.length === 0}
              >
                {polygonClosed ? 'Reopen' : 'Undo point'}
              </button>
              <button
                type="button"
                className="button button--secondary button--full"
                onClick={() => {
                  setPolygonPoints([]);
                  setPolygonClosed(false);
                }}
                disabled={isRemoving || (polygonPoints.length === 0 && !polygonClosed)}
              >
                Reset outline
              </button>
              <button
                type="button"
                className="button button--full"
                onClick={() => void handleApplyManualOutline()}
                disabled={isRemoving || !polygonClosed || polygonPoints.length < 3}
              >
                {isRemoving ? 'Creating…' : 'Create cutout'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="button button--secondary button--full"
                onClick={handleUseCrop}
                disabled={!canReviewCrop || isPreparingCrop || isRemoving}
              >
                Use crop
              </button>
              <button
                type="button"
                className="button button--secondary button--full"
                onClick={handleOpenManualOutline}
                disabled={!canReviewCrop || isPreparingCrop || isRemoving}
              >
                Manual outline
              </button>
              {processedBlob ? (
                <button
                  type="button"
                  className="button button--full"
                  onClick={handleUseCutout}
                  disabled={!file || isPreparingCrop || isRemoving}
                >
                  Use cutout
                </button>
              ) : (
                <button
                  type="button"
                  className="button button--full"
                  onClick={() => void handleRemoveBackground()}
                  disabled={!canReviewCrop || isPreparingCrop || isRemoving}
                >
                  {isRemoving ? 'Removing…' : 'Remove background'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
