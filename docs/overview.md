# StickToGif Overview

## What the app is

StickToGif is a single-purpose, frontend-only app for attaching a sticker, text overlay, or blur effect to a moving object inside a short animation.

It is designed around one fast local workflow:

1. load a source animation
2. mark the subject
3. track it
4. attach something to it
5. export

Everything runs locally on-device:

- GIF decoding
- MP4 frame sampling
- object tracking with OpenCV.js in a Web Worker
- overlay computation
- preview playback
- GIF and animated WebP export
- native mobile saved-creations library

No files are uploaded to a server.

## Supported input and output

### Input

- animated GIF files
- MP4 files
- pasted direct GIF URLs when the remote host allows browser-side fetches

### Output

- animated GIF
- animated WebP

### Current MP4 limits

- maximum duration: `15s`
- maximum file size: `30 MB`
- frame sampling rate: `15 FPS`

MP4 is input-only in this MVP. Export stays GIF/WebP.

## Core interaction model

The app uses a strict step-based flow:

### Step A: Input

- The user drops a GIF or MP4 into the source drop zone.
- A bundled sample GIF can be loaded immediately from the empty state.
- The app decodes the source locally and advances as soon as the first usable frame sequence is ready.

### Step B: Pick subject

- The canvas shows the first frame.
- The user taps or clicks the thing to track.
- A tracking box appears and can be moved or resized before tracking begins.
- The initial box is no longer a fixed default square; it is heuristically refined from the tapped point.

### Step C: Tracking

- The user selects `Track`.
- OpenCV.js finds feature points inside the selected region and follows them frame to frame with optical flow.
- Template matching assists tracking when feature confidence is weak.
- Progress is shown while the browser computes the tracked region history.
- Tracking executes in a worker instead of on the main thread.

### Step D: Attachment mode

Once tracking completes, the user can choose one of three modes:

1. **Sticker**
   Upload a custom image or choose a preset, then position it on frame one.
2. **Text**
   Add one text overlay with basic fill/stroke swatches and weight controls.
3. **Blur**
   Apply a mosaic-style blur over the tracked subject.

The selected effect is anchored to the tracked region using the first-frame placement as the reference.

### Step E: Preview and export

- The user previews the tracked result in-browser.
- On web, the final animation can be exported as GIF or animated WebP.
- On native mobile, the primary export format is GIF.
- Native mobile automatically saves successful exports into `My Creations`.
- Native mobile GIF export supports both save-only and save-then-share flows.

## Tracking behavior

Tracking uses `cv.goodFeaturesToTrack` plus `cv.calcOpticalFlowPyrLK`.

Behavior priorities:

- translation is required
- scale is conservative
- rotation is only used when motion looks stable
- smoothing reduces jitter
- low-confidence motion falls back toward the last stable estimate

The goal is stable meme tracking, not professional compositing accuracy.

## UI structure

The current app flow is organized around progressive steps:

- source input
- first-frame target setup
- tracking
- attachment selection
- export

The UI now includes:

- a visible 4-step progress indicator
- local back navigation between steps without forcing re-upload
- a short post-tracking reveal before moving into effect selection
- a mobile-safe canvas interaction fix for pointer capture during drag

Native mobile also adds:

- a bottom tab bar with `Create` and `My Creations`
- a simple on-device library of saved exports
- preview, re-share, and delete actions for saved creations

The tab shell and local library are mobile-only. The web app keeps the original single-flow editor layout.

The first frame is shown as soon as a source is loaded so the user can define the tracking target before committing to a sticker, text, or blur choice.

## Known limitations

- one tracked target per export
- one attachment mode active at a time
- MP4 input only, no MP4 export yet
- no trimming, timeline editing, or multi-object workflows
- tracking quality depends on visible texture and motion consistency
- GIF export uses browser-side palette quantization, so animated WebP may look cleaner on some sources on web
- worker/bootstrap behavior is sensitive enough that it is now covered by a dedicated smoke test
