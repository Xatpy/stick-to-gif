# StickToGif Overview

## What the app is

StickToGif is a frontend-only web app for attaching an image overlay to an object inside an animated GIF.

The app is built for meme creation, not professional VFX work.

Everything runs locally in the browser:

- GIF decoding
- first-frame editing
- object tracking
- preview playback
- GIF export

No files are uploaded to a server.

## What the app does

The app lets a user:

1. Upload an animated GIF
2. Decode that GIF into individual frames in the browser
3. View the first frame in an editor immediately
4. Upload an overlay image
5. Position, resize, and rotate that overlay on the first frame
6. Draw or adjust a target rectangle around the object to track
7. Run object tracking across the rest of the GIF
8. Preview the tracked result as an animation
9. Export a new edited GIF

## Core interaction model

### Step 1: Load assets

- The user uploads a source GIF
- The user uploads an overlay image
- The app shows the loaded asset names and uses the GIF first frame as the editor background

### Step 2: Set up tracking

On the editor canvas:

- The mint rectangle represents the target area that will be tracked
- The overlay can be dragged to reposition it
- The yellow resize handle changes overlay size
- The floating rotation handle rotates the overlay
- A dashed grey line connects the target center to the overlay center as a visual preview of the tracking relationship

### Step 3: Track and preview

When the user clicks `Track`, the app:

- loads OpenCV.js in the browser
- prepares the first frame
- detects feature points inside the selected target rectangle
- tracks those points frame-to-frame with optical flow
- estimates translation and some conservative scale/rotation updates
- smooths the result to reduce jitter
- falls back toward the last stable region if confidence drops

The user can then preview the result and export a new GIF.

## Tracking behavior

Tracking is intentionally pragmatic:

- translation is the primary behavior
- scale is limited and conservative
- rotation is only used when point motion appears reliable
- smoothing is used to reduce jitter
- low-confidence tracking falls back toward the last stable state

The system is optimized for “good enough and funny” rather than perfect motion estimation.

## Export behavior

After tracking:

- each output frame is rendered to a canvas
- the original GIF frame and overlay are composited together
- the result is encoded back into a GIF in-browser
- the user downloads the final file directly from the browser

## UI structure

The current app is organized into three visible workflow stages:

1. `Step 1` loads the GIF and overlay
2. `Step 2` handles editor positioning and tracking
3. `Step 3` shows preview and export

Additional explanatory content is available through modal dialogs instead of always occupying screen space.

## Responsive behavior

The UI is designed to work on desktop and mobile:

- upload controls stack on smaller screens
- the editor becomes the primary focus area
- secondary details move into modals
- action buttons expand to fit smaller viewports more cleanly

## Known limitations

Current MVP limitations:

- single overlay only
- GIF only, no video input
- no backend or cloud save
- no multi-object tracking
- no advanced timeline editing
- tracking quality depends on visible texture and motion consistency
- GIF export uses browser-side palette quantization, so some quality loss is expected on difficult source material

## Intended use

StickToGif is meant for quick, local, browser-based edits where the user wants to stick a graphic onto a moving subject and get a usable exported GIF without leaving the browser.
