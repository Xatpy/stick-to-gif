import { Capacitor } from '@capacitor/core';
import {
  Directory,
  Filesystem,
  type AppendFileOptions,
  type WriteFileOptions,
} from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const CREATIONS_STORAGE_KEY = 'sticktogif:creations';
const CREATIONS_DIRECTORY = 'creations';

export interface SavedCreation {
  id: string;
  path: string;
  filename: string;
  type: string;
  createdAt: string;
}

interface SaveCreationOptions {
  blob: Blob;
  filename: string;
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function readStoredCreations() {
  if (typeof window === 'undefined') {
    return [] as SavedCreation[];
  }

  try {
    const raw = window.localStorage.getItem(CREATIONS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is SavedCreation => (
      item
      && typeof item.id === 'string'
      && typeof item.path === 'string'
      && typeof item.filename === 'string'
      && typeof item.type === 'string'
      && typeof item.createdAt === 'string'
    ));
  } catch {
    return [];
  }
}

function writeStoredCreations(items: SavedCreation[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(CREATIONS_STORAGE_KEY, JSON.stringify(items));
}

function blobSliceToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Unable to prepare the export file.'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unable to prepare the export file.'));
        return;
      }

      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };

    reader.readAsDataURL(blob);
  });
}

async function writeBlobInChunks(path: string, blob: Blob, directory: Directory) {
  const chunkSize = 49152;
  const writeOptionsBase = {
    path,
    directory,
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

function base64ToBlob(base64: string, mimeType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

async function getFileUri(path: string) {
  const { uri } = await Filesystem.getUri({
    path,
    directory: Directory.Data,
  });

  return uri;
}

export async function listSavedCreations() {
  return readStoredCreations().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function saveCreation({ blob, filename }: SaveCreationOptions) {
  const safeFilename = sanitizeFilename(filename);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `${CREATIONS_DIRECTORY}/${id}-${safeFilename}`;

  await writeBlobInChunks(path, blob, Directory.Data);

  const record: SavedCreation = {
    id,
    path,
    filename: safeFilename,
    type: blob.type || 'application/octet-stream',
    createdAt: new Date().toISOString(),
  };

  writeStoredCreations([record, ...readStoredCreations()]);
  return record;
}

export async function creationExists(creation: SavedCreation) {
  try {
    await Filesystem.stat({
      path: creation.path,
      directory: Directory.Data,
    });
    return true;
  } catch {
    return false;
  }
}

export async function getCreationPreviewUrl(creation: SavedCreation) {
  const fileUri = await getFileUri(creation.path);
  return Capacitor.convertFileSrc(fileUri);
}

export async function shareSavedCreation(creation: SavedCreation, title: string) {
  const fileUri = await getFileUri(creation.path);

  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Share')) {
    await Share.share({
      title,
      dialogTitle: title,
      files: [fileUri],
    });
    return;
  }

  const result = await Filesystem.readFile({
    path: creation.path,
    directory: Directory.Data,
  });

  const blob = result.data instanceof Blob
    ? result.data
    : base64ToBlob(result.data, creation.type);

  const file = new File([blob], creation.filename, { type: creation.type });

  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({
      files: [file],
      title,
    });
    return;
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = creation.filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000 * 60);
}

export async function deleteSavedCreation(creation: SavedCreation) {
  try {
    await Filesystem.deleteFile({
      path: creation.path,
      directory: Directory.Data,
    });
  } catch {
    // Allow cleaning up broken library entries even if the file is already gone.
  }

  writeStoredCreations(readStoredCreations().filter((item) => item.id !== creation.id));
}
