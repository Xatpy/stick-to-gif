import { useEffect, useRef } from 'react';

interface DropZoneProps {
  onFileSelected: (file: File) => void;
  onPasteUrl?: (url: string) => Promise<void> | void;
  onError?: (message: string) => void;
  label?: string;
  hint?: string;
  compact?: boolean;
}

export function DropZone({
  onFileSelected,
  onPasteUrl,
  onError,
  label = 'Drop a GIF, MP4, or MOV here',
  hint = 'or tap to choose from your files',
  compact = false,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const accept = 'image/gif,video/mp4,video/quicktime,.mov';

  useEffect(() => {
    if (!onPasteUrl) return;

    const handleWindowPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return;
      }

      const text = event.clipboardData?.getData('text/plain').trim();
      if (!text) return;

      try {
        const url = new URL(text);
        event.preventDefault();
        void onPasteUrl(url.toString());
      } catch {
        // Ignore non-URL clipboard content for keyboard paste shortcuts.
      }
    };

    window.addEventListener('paste', handleWindowPaste);
    return () => window.removeEventListener('paste', handleWindowPaste);
  }, [onPasteUrl]);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
    const isMp4 = file.type === 'video/mp4' || file.name.toLowerCase().endsWith('.mp4');
    const isMov = file.type === 'video/quicktime' || file.name.toLowerCase().endsWith('.mov');

    if (!isGif && !isMp4 && !isMov) {
      onError?.('Please select an animated GIF, MP4, or MOV file.');
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
      className={`drop-zone${compact ? ' drop-zone--compact' : ''}`}
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
        <p className="drop-zone__label">{label}</p>
        <p className="drop-zone__hint">{hint}</p>
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
