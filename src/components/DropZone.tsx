import { useRef } from 'react';

interface DropZoneProps {
  onFileSelected: (file: File) => void;
  onPasteUrl?: (url: string) => Promise<void> | void;
  onError?: (message: string) => void;
}

export function DropZone({ onFileSelected, onPasteUrl, onError }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const accept = 'image/gif,video/mp4';

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
    const isMp4 = file.type === 'video/mp4' || file.name.toLowerCase().endsWith('.mp4');

    if (!isGif && !isMp4) {
      onError?.('Please select an animated GIF or MP4 file.');
      return;
    }
    onFileSelected(file);
  };

  const handlePasteUrl = async () => {
    if (!onPasteUrl || !navigator.clipboard?.readText) return;

    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        onError?.('Clipboard is empty.');
        return;
      }
      const url = new URL(text);
      await onPasteUrl(url.toString());
    } catch {
      onError?.('Could not paste a valid URL from clipboard.');
    }
  };

  return (
    <div
      className="drop-zone"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        e.currentTarget.classList.add('drop-zone--over');
      }}
      onDragLeave={(e) => {
        e.currentTarget.classList.remove('drop-zone--over');
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.currentTarget.classList.remove('drop-zone--over');
        handleFiles(e.dataTransfer.files);
      }}
    >
      <div className="drop-zone__content">
        <span className="drop-zone__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M12 16.5a1 1 0 0 1-1-1V8.91l-2.3 2.29a1 1 0 1 1-1.4-1.42l4-4a1 1 0 0 1 1.4 0l4 4a1 1 0 0 1-1.4 1.42L13 8.9v6.6a1 1 0 0 1-1 1Z" />
            <path d="M6 18a1 1 0 0 1 0-2h12a1 1 0 1 1 0 2H6Z" />
          </svg>
        </span>
        <p className="drop-zone__label">Drop a GIF or MP4 here</p>
        <p className="drop-zone__hint">or tap to choose from your files</p>
      </div>
      {onPasteUrl && (
        <button
          type="button"
          className="drop-zone__paste"
          onClick={(e) => {
            e.stopPropagation();
            void handlePasteUrl();
          }}
        >
          or paste URL
        </button>
      )}
      <input
        ref={inputRef}
        hidden
        accept={accept}
        type="file"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
