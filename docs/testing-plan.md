# StickToGif Testing Plan

## Goal

Add a small, high-signal test strategy that protects the risky parts of the app without turning the project into testing infrastructure work.

This plan is intentionally narrow.

The two main risks we want to cover are:

1. deployment/runtime breakage
2. tracking/math regressions

Everything else is secondary for now.

## Current Status

The first testing pass described here is now partially implemented:

- `vitest` is installed and running
- pure-logic tests exist for motion, overlay layout, math, and image analysis
- a narrow `EditorCanvas` regression test covers the pointer-capture drag fix
- a Playwright smoke test covers sample loading, base-path handling, worker startup, and OpenCV bootstrap
- media pipeline tests cover a few targeted error paths

This document still reflects the intended testing scope, but the items above are no longer just planned.

## What We Will Test First

### 1. Pure logic tests with `vitest`

These are the highest-value tests because they are deterministic, fast, and target the code most likely to regress when tuning thresholds or tracking behavior.

Primary targets:

- [src/tracking/motion.ts](/Users/jaime/workspace/stickToGif/src/tracking/motion.ts)
- [src/tracking/overlayLayout.ts](/Users/jaime/workspace/stickToGif/src/tracking/overlayLayout.ts)
- [src/utils/math.ts](/Users/jaime/workspace/stickToGif/src/utils/math.ts)
- [src/utils/imageAnalysis.ts](/Users/jaime/workspace/stickToGif/src/utils/imageAnalysis.ts)

Initial test cases:

- `estimateMotion` returns expected translation for synthetic point sets.
- `estimateMotion` returns expected scale and bounded rotation for synthetic transformed point sets.
- `blendRegion` and `blendOverlay` interpolate predictably.
- `computeOverlayLayout` and `buildOverlayFromRegion` preserve relative placement.
- `clampRectToBounds` handles out-of-bounds and inverted rectangles correctly.
- `getDefaultTargetRect` selects a tighter region for a clear synthetic object than for a flat region.
- `refineRectFromLocalRegion` returns `null` for low-contrast or ambiguous cases.
- Low-confidence overlay/layout behavior remains stable over repeated frames.
- `EditorCanvas` keeps dragging active across `pointerleave` when pointer capture is still held, and releases correctly on `pointercancel`.

### 2. One Playwright smoke test

This should be the first end-to-end test, not something deferred until later.

The purpose is to protect against deployment-sensitive breakage, especially issues involving:

- Vite base path handling
- worker loading
- OpenCV asset loading
- sample asset loading

The first smoke test should cover:

1. serve the app under the configured `/stick-to-gif/` base path
2. load the sample GIF
3. tap a subject
4. start tracking
5. verify that tracking begins successfully and the app does not crash
6. verify that tracking advances past the worker bootstrap stage and does not stall on OpenCV runtime initialization

Specific regression to protect:

- worker loads `opencv.js` from the correct base-path URL
- OpenCV runtime becomes ready inside the worker
- the app advances beyond `Loading OpenCV runtime in worker` instead of hanging indefinitely

That one test should catch the class of failures that have already happened in this project.

This smoke test is now implemented.

## Minimal Follow-Up Tests

If we add anything after the first pass, it should stay narrow.

### Media pipeline error-path tests

If Phase 1 and the smoke test are in place, the next useful tests are small failure-path checks for our own code, not happy-path tests of third-party decoders.

Targets:

- [src/gif/decodeGif.ts](/Users/jaime/workspace/stickToGif/src/gif/decodeGif.ts)
- [src/media/decodeVideo.ts](/Users/jaime/workspace/stickToGif/src/media/decodeVideo.ts)
- [src/gif/exportGif.ts](/Users/jaime/workspace/stickToGif/src/gif/exportGif.ts)
- [src/webp/exportWebp.ts](/Users/jaime/workspace/stickToGif/src/webp/exportWebp.ts)

Only add tests for:

- MP4 over size limit throws the expected user-facing error.
- unreadable/truncated input surfaces an error rather than hanging.
- export throws on frame-count mismatch.
- successful GIF export returns a non-empty blob.

These media error-path checks are now implemented in a minimal form.

## What We Are Explicitly Not Testing Yet

To avoid unnecessary complexity, do not invest in these yet:

- broad component integration coverage
- render-condition tests for simple UI flags
- snapshot-heavy UI tests
- deep tests of OpenCV internals
- large browser matrices
- happy-path decoder invariants that mostly test `gifuct-js` or browser media APIs

## Why This Scope

StickToGif is still small and changes quickly.

At this stage, heavy test coverage would create more maintenance drag than safety.

The highest-return coverage is:

- pure logic that we tune directly
- one real smoke path that proves the deployed app can load assets and start tracking

That gives us a practical floor of safety without slowing down iteration.

## Recommended Execution Order

1. Add `vitest`.
2. Add unit tests for tracking math, overlay math, and image analysis.
3. Add one Playwright smoke test for base path + sample + worker tracking start.
4. Only after that, consider a few media error-path tests if regressions justify them.

## Definition Of Done For The First Testing Pass

The first pass is sufficient when:

- pure motion/layout/image-analysis logic has regression protection
- one deployed workflow can run in CI under the configured base path
- worker and asset loading failures are caught automatically

That is enough for the current stage of the project.
