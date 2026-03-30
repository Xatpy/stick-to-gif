import { useRef } from 'react';
import { getPresets } from '../assets/presets';
import type { OverlayMode, OverlayAsset, TextOverlayStyle, BlurStyle } from '../types';

interface OverlayPickerProps {
  mode: OverlayMode | null;
  onModeChange: (mode: OverlayMode) => void;
  /* Sticker */
  onStickerUpload: (file: File) => void;
  onPresetPick: (asset: OverlayAsset) => void;
  /* Text */
  textStyle: TextOverlayStyle;
  onTextStyleChange: (style: TextOverlayStyle) => void;
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
  { color: 'transparent', stroke: '#ffffff', label: 'Outline' },
];

export function OverlayPicker({
  mode,
  onModeChange,
  onStickerUpload,
  onPresetPick,
  textStyle,
  onTextStyleChange,
  blurStyle,
  onBlurStyleChange,
}: OverlayPickerProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const presets = getPresets();

  return (
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
          <button
            type="button"
            className="button button--sm"
            onClick={() => fileRef.current?.click()}
          >
            Upload image
          </button>
          <input
            ref={fileRef}
            hidden
            accept="image/png,image/jpeg,image/webp,image/gif"
            type="file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onStickerUpload(file);
            }}
          />
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
              onChange={(e) => onBlurStyleChange({ intensity: Number(e.target.value) })}
            />
          </label>
        </div>
      )}
    </div>
  );
}
