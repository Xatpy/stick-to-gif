import type { OverlayAsset } from '../types';

interface PresetDef {
  name: string;
  emoji: string;
  bgColor: string;
}

const PRESETS: PresetDef[] = [
  { name: 'Fire', emoji: '🔥', bgColor: 'transparent' },
  { name: 'Sparkles', emoji: '✨', bgColor: 'transparent' },
  { name: 'Sunglasses', emoji: '🕶️', bgColor: 'transparent' },
  { name: 'Question', emoji: '❓', bgColor: 'transparent' },
  { name: 'Checkmark', emoji: '✅', bgColor: 'transparent' },
  { name: 'Coin', emoji: '🪙', bgColor: 'transparent' },
];

function renderEmojiToCanvas(emoji: string, size: number): HTMLCanvasElement {
  const workingSize = size * 2;
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = workingSize;
  sourceCanvas.height = workingSize;
  const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!sourceCtx) throw new Error('Cannot create canvas context');
  sourceCtx.font = `${workingSize * 0.72}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  sourceCtx.textAlign = 'center';
  sourceCtx.textBaseline = 'middle';
  sourceCtx.fillText(emoji, workingSize / 2, workingSize / 2);

  const imageData = sourceCtx.getImageData(0, 0, workingSize, workingSize);
  const { data, width, height } = imageData;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha < 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot create canvas context');

  if (maxX < minX || maxY < minY) {
    return canvas;
  }

  const croppedWidth = maxX - minX + 1;
  const croppedHeight = maxY - minY + 1;
  const inset = Math.round(size * 0.14);
  const targetMax = size - inset * 2;
  const scale = Math.min(targetMax / croppedWidth, targetMax / croppedHeight);
  const drawWidth = croppedWidth * scale;
  const drawHeight = croppedHeight * scale;
  const drawX = (size - drawWidth) / 2;
  const drawY = (size - drawHeight) / 2;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.drawImage(
    sourceCanvas,
    minX,
    minY,
    croppedWidth,
    croppedHeight,
    drawX,
    drawY,
    drawWidth,
    drawHeight,
  );
  return canvas;
}

export function createEmojiOverlayAsset(emoji: string, name = 'Custom emoji'): OverlayAsset {
  const size = 128;
  const canvas = renderEmojiToCanvas(emoji, size);
  return {
    name,
    width: size,
    height: size,
    source: canvas,
    objectUrl: '',
  };
}

let cachedPresets: OverlayAsset[] | null = null;

export function getPresets(): OverlayAsset[] {
  if (cachedPresets) return cachedPresets;

  cachedPresets = PRESETS.map((preset) => {
    return createEmojiOverlayAsset(preset.emoji, preset.name);
  });

  return cachedPresets;
}

export function getPresetNames(): string[] {
  return PRESETS.map((p) => p.name);
}
