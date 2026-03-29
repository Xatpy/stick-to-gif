import { useRef } from 'react';

interface UploadCardProps {
  title: string;
  description: string;
  accept: string;
  buttonLabel: string;
  fileName?: string | null;
  disabled?: boolean;
  onFileSelected: (file: File) => void;
  onPasteImage?: (file: File) => Promise<void> | void;
  onPasteError?: (message: string) => void;
  onPasteUrl?: (url: string) => Promise<void> | void;
}

export function UploadCard({
  title,
  description,
  accept,
  buttonLabel,
  fileName,
  disabled,
  onFileSelected,
  onPasteImage,
  onPasteError,
  onPasteUrl,
}: UploadCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const acceptedTypes = accept
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const matchesAccept = (mimeType: string) =>
    acceptedTypes.some((acceptedType) => {
      if (acceptedType.endsWith('/*')) {
        return mimeType.startsWith(acceptedType.slice(0, -1));
      }
      return mimeType === acceptedType;
    });

  const invalidPasteMessage = acceptedTypes.includes('image/gif')
    ? 'Clipboard does not contain a real GIF file. Some apps paste GIFs as static PNG images instead.'
    : 'Clipboard does not contain a supported image type.';
  const invalidUrlMessage = acceptedTypes.includes('image/gif')
    ? 'Clipboard text is not a usable direct GIF URL, or the remote server blocked browser access.'
    : 'Clipboard text is not a usable image URL, or the remote server blocked browser access.';
  const canPasteFromButton = Boolean(
    (onPasteImage && navigator.clipboard?.read) ||
      (onPasteUrl && navigator.clipboard?.readText),
  );

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) {
      onFileSelected(file);
    }
  };

  const extractClipboardImage = async () => {
    if (!onPasteImage || !navigator.clipboard?.read) {
      return;
    }

    const items = await navigator.clipboard.read();
    for (const item of items) {
      const matchedType =
        item.types.find((type) => matchesAccept(type)) ??
        item.types.find((type) => type.startsWith('image/') && matchesAccept(type));

      if (!matchedType) {
        continue;
      }

      const blob = await item.getType(matchedType);
      const extension = matchedType.split('/')[1] ?? 'png';
      const file = new File([blob], `pasted-overlay.${extension}`, {
        type: matchedType,
      });
      await onPasteImage(file);
      return;
    }

    throw new Error(invalidPasteMessage);
  };

  const extractClipboardUrl = async () => {
    if (!onPasteUrl || !navigator.clipboard?.readText) {
      throw new Error(invalidUrlMessage);
    }

    const text = (await navigator.clipboard.readText()).trim();
    if (!text) {
      throw new Error(invalidUrlMessage);
    }

    try {
      const url = new URL(text);
      await onPasteUrl(url.toString());
    } catch {
      throw new Error(invalidUrlMessage);
    }
  };

  return (
    <div
      className={`upload-card${disabled ? ' is-disabled' : ''}`}
      tabIndex={disabled ? -1 : 0}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (!disabled) {
          handleFiles(event.dataTransfer.files);
        }
      }}
      onPaste={(event) => {
        if (disabled || !onPasteImage) {
          return;
        }

        const imageItem = Array.from(event.clipboardData.items).find((item) =>
          matchesAccept(item.type),
        );

        const file = imageItem?.getAsFile();
        if (file) {
          event.preventDefault();
          void Promise.resolve(onPasteImage(file)).catch((error: unknown) => {
            onPasteError?.(
              error instanceof Error ? error.message : 'Unable to paste this image.',
            );
          });
          return;
        }

        const text = event.clipboardData.getData('text/plain').trim();
        if (text && onPasteUrl) {
          event.preventDefault();
          void Promise.resolve(onPasteUrl(text)).catch((error: unknown) => {
            onPasteError?.(
              error instanceof Error ? error.message : invalidUrlMessage,
            );
          });
        } else if (Array.from(event.clipboardData.items).some((item) => item.type.startsWith('image/'))) {
          event.preventDefault();
          onPasteError?.(invalidPasteMessage);
        }
      }}
    >
      <div className="upload-card__top">
        <div>
          <p className="eyebrow">{title}</p>
          <h3>{fileName ?? description}</h3>
          <p>
            {fileName
              ? description
              : onPasteImage
                ? 'Tap to choose, drop, or paste an image here'
                : 'Tap to choose or drop a file here'}
          </p>
        </div>
        <div className="upload-card__actions">
          <button
            type="button"
            className="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            {buttonLabel}
          </button>
          {onPasteImage && (
            <button
              type="button"
              className="button button--secondary"
              disabled={disabled || !canPasteFromButton}
              onClick={() => {
                void extractClipboardImage()
                  .catch(() => extractClipboardUrl())
                  .catch((error: unknown) => {
                    onPasteError?.(
                      error instanceof Error ? error.message : 'Unable to paste from clipboard.',
                    );
                  });
              }}
            >
              Paste
            </button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        hidden
        accept={accept}
        type="file"
        onChange={(event) => handleFiles(event.target.files)}
      />
    </div>
  );
}
