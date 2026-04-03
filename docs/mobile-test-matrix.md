# Mobile Test Matrix

Use this document to record manual validation for the Capacitor mobile builds.

## Device Targets

Record at least:

1. One recent iPhone.
2. One older supported iPhone.
3. One recent Android device.
4. One mid-range Android device.

## Per-Device Metadata

For each device, record:

1. Device model.
2. OS version.
3. App build identifier.
4. Whether the run was simulator/emulator or physical device.

## Functional Checklist

Mark each item as `pass`, `fail`, or `not tested`.

1. App launches successfully.
2. Bottom tabs appear on native mobile.
3. `My Creations` opens successfully.
4. Sample clip loads.
5. GIF import works.
6. MP4 import works.
7. MOV import works.
8. First frame displays correctly.
9. Target placement works.
10. Target resize works.
11. Tracking completes.
12. Sticker mode works.
13. Text mode works.
14. Blur mode works.
15. `Save GIF` exports successfully.
16. Saved export appears in `My Creations`.
17. Saved creation preview opens.
18. Saved creation can be shared again.
19. Saved creation can be deleted.
20. Missing-file library entries fail gracefully and can still be removed.
21. Native share sheet opens from `Share GIF`.
22. App recovers after an import failure.
23. App recovers after a tracking failure.
24. App recovers after an export failure.

## Stress Cases

Run these at least once per platform:

1. Near-limit video import.
2. Repeated export without restarting the app.
3. Repeated save/share cycles without restarting the app.
4. Background the app during tracking.
5. Background the app during export.
6. Lock and unlock the device during an active session.

## Notes

Capture:

1. Crashes.
2. Hangs.
3. Thermal or memory issues.
4. Codec-specific failures.
5. Worker or OpenCV bootstrap failures.
