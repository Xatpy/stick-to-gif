import type { OverlayTransform, TextOverlayStyle } from '../types';

function wrapLines(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const rawLines = text.split('\n');
  const lines: string[] = [];

  for (const rawLine of rawLines) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let currentLine = words[0] ?? '';
    for (let index = 1; index < words.length; index += 1) {
      const next = `${currentLine} ${words[index]}`;
      if (context.measureText(next).width <= maxWidth) {
        currentLine = next;
      } else {
        lines.push(currentLine);
        currentLine = words[index] ?? '';
      }
    }
    lines.push(currentLine);
  }

  return lines;
}

export function drawTextOverlay(
  context: CanvasRenderingContext2D,
  transform: OverlayTransform,
  style: TextOverlayStyle,
) {
  if (!style.enabled || !style.text.trim()) {
    return;
  }

  const fontSize = Math.max(14, transform.height * 0.58);
  const lineHeight = fontSize * 1.08;

  context.save();
  context.translate(transform.x, transform.y);
  context.rotate(transform.rotation);
  context.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.miterLimit = 2;

  const lines = wrapLines(context, style.text, Math.max(40, transform.width));
  const totalHeight = lines.length * lineHeight;
  const startY = -totalHeight / 2 + lineHeight / 2;

  context.strokeStyle = style.strokeColor;
  context.fillStyle = style.color;
  context.lineWidth = Math.max(3, fontSize * 0.16);

  lines.forEach((line, index) => {
    const y = startY + index * lineHeight;
    context.strokeText(line, 0, y, transform.width);
    context.fillText(line, 0, y, transform.width);
  });

  context.restore();
}
