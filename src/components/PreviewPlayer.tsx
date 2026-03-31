import { useEffect, useMemo, useRef, useState } from 'react';
import { drawComposedFrame } from '../render/drawComposedFrame';
import type { BlurStyle, DecodedGif, OverlayAsset, TextOverlayStyle, TrackingFrame } from '../types';

interface PreviewPlayerProps {
  gif: DecodedGif;
  overlay: OverlayAsset | null;
  textStyle?: TextOverlayStyle | null;
  trackingFrames: TrackingFrame[];
  blurStyle?: BlurStyle | null;
  /** Whether to show a progress bar at the bottom of the canvas */
  progressValue?: number;
}

export function PreviewPlayer({
  gif,
  overlay,
  textStyle,
  trackingFrames,
  blurStyle,
  progressValue,
}: PreviewPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);

  const frameDurations = useMemo(
    () => gif.frames.map((frame) => Math.max(20, frame.delay)),
    [gif.frames],
  );

  useEffect(() => {
    setFrameIndex(0);
    setIsPlaying(true);
  }, [gif, trackingFrames]);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = gif.width;
    canvas.height = gif.height;

    const context = canvas.getContext('2d');
    if (!context) return;

    const trackingFrame = trackingFrames[frameIndex];
    if (!trackingFrame) return;

    createImageBitmap(gif.frames[frameIndex]!.blob)
      .then((bitmap) => {
        if (cancelled) {
          bitmap.close();
          return;
        }

        drawComposedFrame({
          context,
          frame: bitmap,
          width: gif.width,
          height: gif.height,
          overlay: overlay?.source,
          imageTransform: trackingFrame.imageOverlay,
          textStyle,
          textTransform: trackingFrame.textOverlay,
          blurRegion: blurStyle ? trackingFrame.region : null,
          blurStyle,
        });

        // Draw tracking box outline when no overlay is applied (magic moment preview)
        if (!overlay && !textStyle?.enabled && !blurStyle) {
          const region = trackingFrame.region;
          context.strokeStyle = '#55f0c0';
          context.lineWidth = 2;
          context.setLineDash([10, 8]);
          context.strokeRect(region.x, region.y, region.width, region.height);
          context.setLineDash([]);
        }

        bitmap.close();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [frameIndex, gif, overlay, textStyle, trackingFrames, blurStyle]);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      return;
    }

    const tick = (timestamp: number) => {
      if (!startedAtRef.current) {
        startedAtRef.current = timestamp;
      }

      const elapsed = timestamp - startedAtRef.current;
      const delay = frameDurations[frameIndex] ?? 60;

      if (elapsed >= delay) {
        startedAtRef.current = timestamp;
        setFrameIndex((current) => (current + 1) % gif.frames.length);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      startedAtRef.current = 0;
    };
  }, [frameDurations, frameIndex, gif.frames.length, isPlaying]);

  return (
    <>
      <div className="canvas-stage">
        <canvas ref={canvasRef} />
        {progressValue != null && progressValue > 0 && progressValue < 1 && (
          <div className="canvas-progress">
            <div className="canvas-progress__fill" style={{ width: `${progressValue * 100}%` }} />
          </div>
        )}
      </div>
      <div className="playback-bar">
        <button
          type="button"
          className="playback-bar__btn"
          onClick={() => setIsPlaying((v) => !v)}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button
          type="button"
          className="playback-bar__btn"
          onClick={() => {
            startedAtRef.current = 0;
            setFrameIndex(0);
          }}
          aria-label="Restart"
        >
          ↺
        </button>
        <input
          type="range"
          min={0}
          max={gif.frames.length - 1}
          value={frameIndex}
          onChange={(e) => setFrameIndex(Number(e.target.value))}
        />
        <span className="playback-bar__frame">
          {frameIndex + 1}/{gif.frames.length}
        </span>
      </div>
    </>
  );
}
