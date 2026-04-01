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
2. Sample clip loads.
3. GIF import works.
4. MP4 import works.
5. MOV import works.
6. First frame displays correctly.
7. Target placement works.
8. Target resize works.
9. Tracking completes.
10. Sticker mode works.
11. Text mode works.
12. Blur mode works.
13. GIF export works.
14. WebP export works or is disabled clearly.
15. Native share sheet opens.
16. App recovers after an import failure.
17. App recovers after a tracking failure.
18. App recovers after an export failure.

## Stress Cases

Run these at least once per platform:

1. Near-limit video import.
2. Repeated export without restarting the app.
3. Background the app during tracking.
4. Background the app during export.
5. Lock and unlock the device during an active session.

## Notes

Capture:

1. Crashes.
2. Hangs.
3. Thermal or memory issues.
4. Codec-specific failures.
5. Worker or OpenCV bootstrap failures.
