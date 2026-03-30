/**
 * Truncate a filename with middle ellipsis, preserving the extension.
 * Example: "BRkS4T-very-long-name-tracked.gif" → "BRkS4T…tracked.gif"
 */
export function truncateFilename(name: string, max = 28): string {
  if (name.length <= max) {
    return name;
  }

  const dotIndex = name.lastIndexOf('.');
  const extension = dotIndex > 0 ? name.slice(dotIndex) : '';
  const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;

  const available = max - extension.length - 1; // 1 for the ellipsis character
  if (available < 4) {
    return name.slice(0, max - 1) + '…';
  }

  const headLength = Math.ceil(available / 2);
  const tailLength = available - headLength;

  return base.slice(0, headLength) + '…' + base.slice(-tailLength) + extension;
}
