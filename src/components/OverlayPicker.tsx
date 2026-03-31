import { useState } from 'react';
import { createEmojiOverlayAsset, getPresets } from '../assets/presets';
import { Modal } from './Modal';
import type { OverlayMode, OverlayAsset, TextOverlayStyle, BlurStyle } from '../types';

interface OverlayPickerProps {
  mode: OverlayMode | null;
  onModeChange: (mode: OverlayMode) => void;
  /* Sticker */
  onStickerUpload: (file: File) => void;
  onPresetPick: (asset: OverlayAsset) => void;
  stickerScale: number;
  onStickerScaleChange: (scale: number) => void;
  /* Text */
  textStyle: TextOverlayStyle;
  onTextStyleChange: (style: TextOverlayStyle) => void;
  textScale: number;
  onTextScaleChange: (scale: number) => void;
  /* Blur */
  blurStyle: BlurStyle;
  onBlurStyleChange: (style: BlurStyle) => void;
}

const TEXT_SWATCHES = [
  { color: '#ffffff', stroke: '#2b2118', label: 'White' },
  { color: '#1a1a1a', stroke: '#ffffff', label: 'Black' },
  { color: '#ffe234', stroke: '#2b2118', label: 'Yellow' },
  { color: '#ff4444', stroke: '#2b2118', label: 'Red' },
  { color: '#44dd66', stroke: '#2b2118', label: 'Green' },
  { color: '#4ea4ff', stroke: '#1d2c44', label: 'Blue' },
  { color: '#ff6bb5', stroke: '#4b2134', label: 'Pink' },
  { color: 'transparent', stroke: '#ffffff', label: 'Outline' },
];

const TEXT_FONT_PRESETS = [
  { label: 'Meme', family: 'Impact, "Arial Black", sans-serif' },
  { label: 'Rounded', family: '"Avenir Next", "Segoe UI", sans-serif' },
  { label: 'Serif', family: 'Georgia, "Times New Roman", serif' },
] as const;

const CUSTOM_EMOJI_OPTIONS = [
  '😀', '😂', '😍', '🥶', '🤯', '😭',
  '😎', '😈', '🤡', '👀', '💀', '🫠',
  '🔥', '✨', '💥', '💯', '⭐', '⚡',
  '❤️', '💚', '🫶', '👏', '👍', '👎',
  '🎉', '🚀', '🍿', '🧠', '🎯', '👑',
];

function getRangeProgressStyle(value: number, min: number, max: number) {
  const progress = ((value - min) / (max - min)) * 100;
  return { '--range-progress': `${progress}%` } as React.CSSProperties;
}

export function OverlayPicker({
  mode,
  onModeChange,
  onStickerUpload,
  onPresetPick,
  stickerScale,
  onStickerScaleChange,
  textStyle,
  onTextStyleChange,
  textScale,
  onTextScaleChange,
  blurStyle,
  onBlurStyleChange,
}: OverlayPickerProps) {
  const [emojiModalOpen, setEmojiModalOpen] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState('😀');
  const presets = getPresets();

  const commitCustomEmoji = () => {
    onPresetPick(createEmojiOverlayAsset(selectedEmoji, `Emoji ${selectedEmoji}`));
    setEmojiModalOpen(false);
  };

  return (
    <>
      <div className="overlay-picker">
        {/* Mode buttons */}
        <div className="mode-buttons">
          <button
            type="button"
            className={`mode-btn${mode === 'sticker' ? ' is-active' : ''}`}
            onClick={() => onModeChange('sticker')}
          >
            + Sticker
          </button>
          <button
            type="button"
            className={`mode-btn${mode === 'text' ? ' is-active' : ''}`}
            onClick={() => onModeChange('text')}
          >
            + Text
          </button>
          <button
            type="button"
            className={`mode-btn${mode === 'blur' ? ' is-active' : ''}`}
            onClick={() => onModeChange('blur')}
          >
            Blur
          </button>
        </div>

        {/* Sticker controls */}
        {mode === 'sticker' && (
          <div className="overlay-controls">
            <div className="overlay-sticker-actions">
              <label className="button button--sm overlay-upload-btn">
                Upload image
                <input
                  hidden
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onStickerUpload(file);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
              <button
                type="button"
                className="button button--secondary button--sm"
                onClick={() => setEmojiModalOpen(true)}
              >
                Pick emoji
              </button>
            </div>
            <label className="overlay-scale">
              <span>Sticker size</span>
              <input
                type="range"
                min={0.6}
                max={1.8}
                step={0.05}
                value={stickerScale}
                style={getRangeProgressStyle(stickerScale, 0.6, 1.8)}
                onChange={(e) => onStickerScaleChange(Number(e.target.value))}
              />
            </label>
            <div className="preset-grid">
              {presets.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  className="preset-btn"
                  onClick={() => onPresetPick(preset)}
                  aria-label={preset.name}
                >
                  <canvas
                    ref={(canvas) => {
                      if (!canvas) return;
                      canvas.width = 48;
                      canvas.height = 48;
                      const ctx = canvas.getContext('2d');
                      if (ctx) {
                        ctx.clearRect(0, 0, 48, 48);
                        ctx.drawImage(preset.source as CanvasImageSource, 0, 0, 48, 48);
                      }
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Text controls */}
        {mode === 'text' && (
          <div className="overlay-controls">
            <input
              type="text"
              className="text-input"
              placeholder="Your text here"
              value={textStyle.text}
              onChange={(e) => onTextStyleChange({ ...textStyle, text: e.target.value })}
            />
            <label className="overlay-scale">
              <span>Text size</span>
              <input
                type="range"
                min={0.6}
                max={1.8}
                step={0.05}
                value={textScale}
                style={getRangeProgressStyle(textScale, 0.6, 1.8)}
                onChange={(e) => onTextScaleChange(Number(e.target.value))}
              />
            </label>
            <div className="text-options-row">
              <div className="swatch-row">
                {TEXT_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.label}
                    type="button"
                    className={`swatch${textStyle.color === swatch.color ? ' is-active' : ''}`}
                    style={{
                      background: swatch.color === 'transparent' ? 'none' : swatch.color,
                      border: `2px solid ${swatch.color === 'transparent' ? '#aaa' : swatch.stroke}`,
                    }}
                    onClick={() =>
                      onTextStyleChange({
                        ...textStyle,
                        color: swatch.color,
                        strokeColor: swatch.stroke,
                      })
                    }
                    aria-label={swatch.label}
                  />
                ))}
              </div>
              <div className="text-style-controls" aria-label="Text style controls">
                <div className="weight-toggle">
                  <button
                    type="button"
                    className={`weight-btn${textStyle.fontWeight <= 400 ? ' is-active' : ''}`}
                    onClick={() => onTextStyleChange({ ...textStyle, fontWeight: 400 })}
                  >
                    Aa
                  </button>
                  <button
                    type="button"
                    className={`weight-btn${textStyle.fontWeight >= 700 ? ' is-active' : ''}`}
                    onClick={() => onTextStyleChange({ ...textStyle, fontWeight: 800 })}
                  >
                    <strong>Aa</strong>
                  </button>
                </div>
                <div className="text-style-row">
                  {TEXT_FONT_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      className={`text-style-btn${textStyle.fontFamily === preset.family ? ' is-active' : ''}`}
                      style={{ fontFamily: preset.family }}
                      onClick={() => onTextStyleChange({ ...textStyle, fontFamily: preset.family })}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Blur controls */}
        {mode === 'blur' && (
          <div className="overlay-controls">
            <label className="blur-slider">
              <span>Blur intensity</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={blurStyle.intensity}
                style={getRangeProgressStyle(blurStyle.intensity, 0, 1)}
                onChange={(e) => onBlurStyleChange({ intensity: Number(e.target.value) })}
              />
            </label>
          </div>
        )}
      </div>

      <Modal
        isOpen={emojiModalOpen}
        onClose={() => {
          setEmojiModalOpen(false);
        }}
        title="Pick an emoji"
      >
        <div className="emoji-picker">
          <p className="emoji-picker__hint">Pick an emoji to turn it into a tracked sticker.</p>
          <div className="emoji-picker__preview" aria-hidden="true">
            {selectedEmoji}
          </div>
          <div className="emoji-picker__grid" role="listbox" aria-label="Emoji options">
            {CUSTOM_EMOJI_OPTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`emoji-picker__option${selectedEmoji === emoji ? ' is-active' : ''}`}
                onClick={() => setSelectedEmoji(emoji)}
                aria-label={`Choose ${emoji}`}
                aria-pressed={selectedEmoji === emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="emoji-picker__actions">
            <button type="button" className="button button--secondary button--full" onClick={() => {
              setEmojiModalOpen(false);
            }}>
              Cancel
            </button>
            <button
              type="button"
              className="button button--full"
              onClick={commitCustomEmoji}
            >
              Use emoji
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
