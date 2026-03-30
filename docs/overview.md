# StickToGif Overview

## What the app is

StickToGif is a single-purpose, frontend-only web app for pinning an image, text, or blur effect onto a moving object inside an animated GIF.

The app is built to be fast and frictionless. Its entire value proposition is getting the "magic moment" of tracking as fast as possible.

Everything runs locally in the browser:

- GIF decoding
- object tracking (via OpenCV.js)
- post-hoc overlay computation
- preview playback
- GIF and WebP export

No files are uploaded to a server.

## Core interaction model

The app uses a strict 5-step linear flow (A→E), forcing the user to track the subject *before* setting up any overlays.

### Step A: Input

- The user drops a GIF or pastes a URL into a full-canvas DropZone.
- The app automatically advances as soon as the GIF loads.

### Step B: Pick Subject

- The canvas shows the first frame of the GIF.
- The user taps or clicks to place a tracking box.
- The tracking box is resizable via corner handles or pinch-to-zoom on mobile.

### Step C: Tracking

- When the user selects `Track`, the app uses optical flow (OpenCV.js) to track the feature points inside the box across all frames.
- A minimal progress bar appears on the canvas.
- No overlays are present during this step.

### Step D: Overlay

Once tracking completes, the preview automatically plays, showing the tracking box following the subject. The user can now pick one of three overlay modes:

1. **Sticker**: Upload a custom image or pick from built-in SVG presets.
2. **Text**: Add a text overlay with basic color svatches and weight controls.
3. **Blur/Mosaic**: Apply a pixelated mosaic effect over the tracked region with an intensity slider.

Because the object is already tracked, the app computes the overlay matrices post-hoc using the stored region history.

### Step E: Export

- The user previews the final result and exports a new edited GIF or WebP.
- Rendering happens entirely in-browser.

## UI structure & Responsive behavior

The UI is built genuinely **mobile-first**:

- **Desktop (≥768px)**: Split-screen view with a fixed sidebar on the left and a large, centered canvas on the right.
- **Mobile (<768px)**: The canvas fills the top of the viewport. Controls live in a slide-up "Bottom Sheet" that preserves canvas space.
- All interactive elements (buttons, tracking handles, color swatches) use touch targets of at least 44×44px.
- The app has no modals or accordions — controls are contextually presented based on the current step.

## Tracking behavior

Tracking relies on `cv.calcOpticalFlowPyrLK`:

- translation is the primary behavior
- scale is limited and conservative
- rotation is only used when point motion appears highly reliable
- smoothing is used to reduce jitter
- low-confidence tracking falls back toward the last stable state

The system is optimized for “good enough and funny” rather than perfect motion estimation.

## Known limitations

- single overlay only per export
- GIF input only (video export scaffolded but input parsing deferred)
- no backend or community sharing
- no multi-object tracking
- no advanced timeline editing
- tracking quality depends on visible texture and motion consistency
- GIF export relies on simple browser-side palette quantization (WebP provides a higher quality alternative)
