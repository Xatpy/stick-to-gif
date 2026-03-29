import { useEffect, useMemo, useRef, useState } from 'react';
import { drawComposedFrame } from '../render/drawComposedFrame';
import type { DecodedGif, OverlayAsset, TrackingFrame } from '../types';

interface PreviewPlayerProps {
  gif: DecodedGif;
  overlay: OverlayAsset;
  trackingFrames: TrackingFrame[];
}

export function PreviewPlayer({
  gif,
  overlay,
  trackingFrames,
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
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    canvas.width = gif.width;
    canvas.height = gif.height;

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const trackingFrame = trackingFrames[frameIndex];
    if (!trackingFrame) {
      return;
    }

    drawComposedFrame({
      context,
      frame: gif.frames[frameIndex]!.imageData,
      overlay: overlay.source,
      transform: trackingFrame.overlay,
    });
  }, [frameIndex, gif, overlay, trackingFrames]);

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
    <div className="preview-player">
      <div className="editor-canvas">
        <canvas ref={canvasRef} />
      </div>
      <div className="preview-controls">
        <button
          type="button"
          className="button"
          onClick={() => setIsPlaying((value) => !value)}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => {
            startedAtRef.current = 0;
            setFrameIndex(0);
          }}
        >
          Restart
        </button>
        <input
          type="range"
          min={0}
          max={gif.frames.length - 1}
          value={frameIndex}
          onChange={(event) => setFrameIndex(Number(event.target.value))}
        />
        <span>
          Frame {frameIndex + 1}/{gif.frames.length}
        </span>
      </div>
    </div>
  );
}
