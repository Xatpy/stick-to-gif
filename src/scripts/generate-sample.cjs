const { GIFEncoder, quantize, applyPalette } = require('gifenc');
const { writeFileSync } = require('fs');
const path = require('path');

const W = 200, H = 150, FRAMES = 30;
const encoder = GIFEncoder();

for (let f = 0; f < FRAMES; f++) {
  const rgba = new Uint8ClampedArray(W * H * 4);
  // Light warm background
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 240; rgba[i + 1] = 237; rgba[i + 2] = 230; rgba[i + 3] = 255;
  }
  // Bouncing red circle — good tracking target
  const t = f / FRAMES;
  const cx = 30 + Math.sin(t * Math.PI * 2) * 70 + 70;
  const cy = H / 2 + Math.sin(t * Math.PI * 4) * 20;
  const r = 18;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy < r * r) {
        const i = (y * W + x) * 4;
        rgba[i] = 220; rgba[i + 1] = 80; rgba[i + 2] = 60; rgba[i + 3] = 255;
      }
    }
  }
  const palette = quantize(rgba, 256);
  const indexed = applyPalette(rgba, palette);
  encoder.writeFrame(indexed, W, H, { palette, delay: 66, repeat: 0 });
}
encoder.finish();
const outPath = path.join(__dirname, '..', '..', 'public', 'sample.gif');
writeFileSync(outPath, new Uint8Array(encoder.bytesView()));
console.log('Written sample.gif:', (new Uint8Array(encoder.bytesView())).length, 'bytes');
