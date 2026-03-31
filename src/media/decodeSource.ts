import { decodeGif } from '../gif/decodeGif';
import type { DecodedGif, ProgressUpdate } from '../types';
import { decodeVideo } from './decodeVideo';

interface DecodeSourceOptions {
  onProgress?: (update: ProgressUpdate) => void;
}

function isGifFile(file: File) {
  return file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
}

function isMp4File(file: File) {
  return file.type === 'video/mp4' || file.name.toLowerCase().endsWith('.mp4');
}

function isMovFile(file: File) {
  return file.type === 'video/quicktime' || file.name.toLowerCase().endsWith('.mov');
}

export async function decodeSource(
  file: File,
  { onProgress }: DecodeSourceOptions = {},
): Promise<DecodedGif> {
  if (isGifFile(file)) {
    onProgress?.({
      progress: 0.15,
      message: 'Decoding GIF frames',
    });
    return decodeGif(file);
  }

  if (isMp4File(file) || isMovFile(file)) {
    return decodeVideo(file, { onProgress });
  }

  throw new Error('Please select an animated GIF, MP4, or MOV file.');
}
