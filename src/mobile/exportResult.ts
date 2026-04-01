import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import type { AppendFileOptions, WriteFileOptions } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { emitDebug, type DebugReporter } from '../lib/debug';

interface NativeExportOptions {
  blob: Blob;
  filename: string;
  title: string;
  debugReporter?: DebugReporter;
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function blobSliceToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Unable to prepare the export for native sharing.'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unable to prepare the export for native sharing.'));
        return;
      }

      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };

    reader.readAsDataURL(blob);
  });
}

async function writeBlobInChunks(path: string, blob: Blob) {
  const chunkSize = 49152;
  const writeOptionsBase = {
    path,
    directory: Directory.Cache,
    recursive: true,
  };

  if (blob.size === 0) {
    await Filesystem.writeFile({
      ...writeOptionsBase,
      data: '',
    });
    return;
  }

  for (let offset = 0; offset < blob.size; offset += chunkSize) {
    const nextChunk = blob.slice(offset, Math.min(blob.size, offset + chunkSize));
    const data = await blobSliceToBase64(nextChunk);

    if (offset === 0) {
      const options: WriteFileOptions = {
        ...writeOptionsBase,
        data,
      };
      await Filesystem.writeFile(options);
      continue;
    }

    const options: AppendFileOptions = {
      ...writeOptionsBase,
      data,
    };
    await Filesystem.appendFile(options);
  }
}

export async function exportResultNatively({
  blob,
  filename,
  title,
  debugReporter,
}: NativeExportOptions) {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  if (!Capacitor.isPluginAvailable('Filesystem') || !Capacitor.isPluginAvailable('Share')) {
    throw new Error('Native export is unavailable because the required Capacitor plugins are missing.');
  }

  const safeFilename = sanitizeFilename(filename);
  const relativePath = `exports/${Date.now()}-${safeFilename}`;

  emitDebug(debugReporter, 'info', `Writing native export to ${relativePath}.`);

  await writeBlobInChunks(relativePath, blob);

  const { uri } = await Filesystem.getUri({
    path: relativePath,
    directory: Directory.Cache,
  });

  emitDebug(debugReporter, 'info', `Opening native share sheet for ${safeFilename}.`);

  await Share.share({
    title,
    dialogTitle: title,
    files: [uri],
  });

  return true;
}
