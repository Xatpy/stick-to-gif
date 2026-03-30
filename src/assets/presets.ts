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
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot create canvas context');
  ctx.font = `${size * 0.75}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, size / 2, size / 2);
  return canvas;
}

let cachedPresets: OverlayAsset[] | null = null;

export function getPresets(): OverlayAsset[] {
  if (cachedPresets) return cachedPresets;

  const size = 128;
  cachedPresets = PRESETS.map((preset) => {
    const canvas = renderEmojiToCanvas(preset.emoji, size);
    return {
      name: preset.name,
      width: size,
      height: size,
      source: canvas,
      objectUrl: '',
    };
  });

  return cachedPresets;
}

export function getPresetNames(): string[] {
  return PRESETS.map((p) => p.name);
}
