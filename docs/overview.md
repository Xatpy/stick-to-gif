# StickToGif Overview

## What the app is

StickToGif is a single-purpose, frontend-only web app for attaching a sticker, text overlay, or blur effect to a moving object inside a short animation.

It is designed around one fast local workflow:

1. load a source animation
2. mark the subject
3. track it
4. attach something to it
5. export

Everything runs locally in the browser:

- GIF decoding
- MP4 frame sampling
- object tracking with OpenCV.js
- overlay computation
- preview playback
- GIF and animated WebP export

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
- The app decodes the source locally and advances as soon as the first usable frame sequence is ready.

### Step B: Pick subject

- The canvas shows the first frame.
- The user taps or clicks the thing to track.
- A tracking box appears and can be moved or resized before tracking begins.

### Step C: Tracking

- The user selects `Track`.
- OpenCV.js finds feature points inside the selected region and follows them frame to frame with optical flow.
- Progress is shown while the browser computes the tracked region history.

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
- The final animation is exported as GIF or animated WebP.

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

The first frame is shown as soon as a source is loaded so the user can define the tracking target before committing to a sticker, text, or blur choice.

## Known limitations

- one tracked target per export
- one attachment mode active at a time
- MP4 input only, no MP4 export yet
- no trimming, timeline editing, or multi-object workflows
- tracking quality depends on visible texture and motion consistency
- GIF export uses browser-side palette quantization, so animated WebP may look cleaner on some sources
