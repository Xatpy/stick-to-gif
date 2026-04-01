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
- `vitest` for unit tests
- `playwright` for smoke testing

## What it does

1. Upload a GIF or MP4
2. Or try a bundled sample clip immediately
3. Decode the source into frames in-browser
4. Pick the target on the first frame
5. Track the target across the animation
6. Choose sticker, text, or blur mode
7. Position the effect on the first frame
8. Preview the composed result
9. Export a new GIF or animated WebP locally

## UX flow

The app now uses a four-step guided flow:

1. Upload
2. Pick subject
3. Choose effect
4. Export

The source media stays loaded when moving backward between steps, so users can retarget without re-uploading the file.

## Source media limits

- GIF input: supported directly
- MP4 input: up to `15s` and up to `30 MB`
- MP4 frames are normalized to `15 FPS` before tracking and export
- GIF URL paste is supported when the remote host allows browser-side fetching
- MP4 URL paste is not supported in this MVP

## Tracking approach

- The user-defined target rectangle is the source of truth.
- Initial target placement is refined from the tapped point using local image-analysis heuristics instead of always using a fixed square.
- Feature points are detected inside that region with `goodFeaturesToTrack`.
- Points are tracked frame-to-frame with `calcOpticalFlowPyrLK`.
- Template matching is used as a fallback / assist when optical-flow confidence drops.
- Motion is estimated from surviving point movement.
- Updates are smoothed to reduce jitter.
- Low-confidence steps fall back toward the last stable region.
- Rotation is only applied conservatively when the tracked points look reliable.

Tracking runs in a Web Worker so OpenCV initialization and per-frame tracking no longer block the main UI thread.

This is intentionally tuned for meme use, not professional motion tracking.

## Development

```bash
npm install
npm run dev
npm test
npm run test:e2e
```

Build for production:

```bash
npm run build
npm run preview
```

Mobile/Capacitor workflow:

```bash
npm run check:mobile-secrets
npm run build:mobile
npm run cap:sync
npm run cap:ios
npm run cap:android
```

Mobile versioning:

```bash
npm run version:bump:patch
npm run version:bump:minor
npm run version:bump:major
```

`package.json` is the source of truth. Version bumps automatically sync:

- Android `versionName`
- Android `versionCode`
- iOS `MARKETING_VERSION`
- iOS `CURRENT_PROJECT_VERSION`

## Notes

- OpenCV is lazy-loaded so the heavy tracking dependency only downloads when needed.
- OpenCV now boots inside the tracking worker, and the app is configured for the `/stick-to-gif/` Vite base path.
- No data is uploaded anywhere by the app.
- The tracking MVP prioritizes stable translation over aggressive rotation or scale changes.
- MP4 input reuses the same tracking/export pipeline by sampling video frames locally in the browser.
- There is a hidden debug mode for worker/bootstrap diagnostics:

```text
?sticktogif_debug=1
```

or:

```js
localStorage.setItem('sticktogif:debug', '1')
```
