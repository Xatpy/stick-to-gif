# StickToGif

StickToGif is a frontend-only meme tool for attaching a sticker, text, or blur effect to a manually selected object inside a short animation. It accepts animated GIFs and short MP4 clips as input, then tracks the selected subject locally in the browser and exports the result as GIF or animated WebP.

## Stack

- React
- TypeScript
- Vite
- Canvas 2D
- `gifuct-js` for GIF decoding
- browser video decode via `HTMLVideoElement` + canvas frame sampling for MP4 input
- `@techstark/opencv-js` for feature tracking with optical flow
- `gifenc` for GIF export

## What it does

1. Upload a GIF or MP4
2. Decode the source into frames in-browser
3. Pick the target on the first frame
4. Track the target across the animation
5. Choose sticker, text, or blur mode
6. Position the effect on the first frame
7. Preview the composed result
8. Export a new GIF or animated WebP locally

## Source media limits

- GIF input: supported directly
- MP4 input: up to `15s` and up to `30 MB`
- MP4 frames are normalized to `15 FPS` before tracking and export
- GIF URL paste is supported when the remote host allows browser-side fetching
- MP4 URL paste is not supported in this MVP

## Tracking approach

- The user-defined target rectangle is the source of truth.
- Feature points are detected inside that region with `goodFeaturesToTrack`.
- Points are tracked frame-to-frame with `calcOpticalFlowPyrLK`.
- Motion is estimated from surviving point movement.
- Updates are smoothed to reduce jitter.
- Low-confidence steps fall back toward the last stable region.
- Rotation is only applied conservatively when the tracked points look reliable.

This is intentionally tuned for meme use, not professional motion tracking.

## Development

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## Notes

- OpenCV is lazy-loaded so the heavy tracking dependency only downloads when needed.
- No data is uploaded anywhere by the app.
- The tracking MVP prioritizes stable translation over aggressive rotation or scale changes.
- MP4 input reuses the same tracking/export pipeline by sampling video frames locally in the browser.
