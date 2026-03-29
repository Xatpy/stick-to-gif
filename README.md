# StickToGif

StickToGif is a frontend-only meme tool for attaching an image overlay to a manually selected object inside an animated GIF. Everything runs locally in the browser: GIF decoding, OpenCV.js tracking, preview rendering, and GIF export.

## Stack

- React
- TypeScript
- Vite
- Canvas 2D
- `gifuct-js` for GIF decoding
- `@techstark/opencv-js` for feature tracking with optical flow
- `gifenc` for GIF export

## What it does

1. Upload a GIF
2. Decode frames in-browser
3. Upload an overlay image
4. Position, resize, and rotate the overlay on the first frame
5. Adjust the tracking rectangle on the first frame
6. Track the target across all frames
7. Preview the composed result
8. Export a new GIF locally

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
