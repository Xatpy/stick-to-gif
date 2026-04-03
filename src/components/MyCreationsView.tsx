import type { SavedCreation } from '../creations/storage';
import { Modal } from './Modal';

export interface SavedCreationListItem extends SavedCreation {
  previewUrl: string | null;
  isMissing: boolean;
}

interface MyCreationsViewProps {
  creations: SavedCreationListItem[];
  isLoading: boolean;
  selectedCreation: SavedCreationListItem | null;
  onOpen: (creation: SavedCreationListItem) => void;
  onClosePreview: () => void;
  onShare: (creation: SavedCreationListItem) => void;
  onDelete: (creation: SavedCreationListItem) => void;
}

function formatCreatedAt(createdAt: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(createdAt));
  } catch {
    return createdAt;
  }
}

export function MyCreationsView({
  creations,
  isLoading,
  selectedCreation,
  onOpen,
  onClosePreview,
  onShare,
  onDelete,
}: MyCreationsViewProps) {
  const selectedLabel = selectedCreation ? formatCreatedAt(selectedCreation.createdAt) : '';

  return (
    <>
      <section className="library-screen" aria-label="My Creations">
        <div className="library-screen__header">
          <div>
            <h1 className="library-screen__title">My Creations</h1>
            <p className="library-screen__subtitle">Saved on this device</p>
          </div>
        </div>

        {isLoading ? (
          <div className="library-empty">
            <p>Loading…</p>
          </div>
        ) : creations.length === 0 ? (
          <div className="library-empty">
            <p>No creations yet</p>
            <p>Your exported GIFs and clips will appear here</p>
          </div>
        ) : (
          <div className="library-grid">
            {creations.map((creation) => (
              <article key={creation.id} className="creation-card">
                <button
                  type="button"
                  className="creation-card__preview"
                  onClick={() => onOpen(creation)}
                >
                  {creation.previewUrl && !creation.isMissing ? (
                    creation.type.startsWith('video/') ? (
                      <video src={creation.previewUrl} muted playsInline />
                    ) : (
                      <img src={creation.previewUrl} alt={`Creation from ${formatCreatedAt(creation.createdAt)}`} />
                    )
                  ) : (
                    <span className="creation-card__missing">Preview unavailable</span>
                  )}
                </button>

                <div className="creation-card__meta">
                  <p className="creation-card__date">{formatCreatedAt(creation.createdAt)}</p>
                  {creation.isMissing && (
                    <p className="creation-card__warning">File missing</p>
                  )}
                </div>

                <div className="creation-card__actions">
                  <button type="button" className="button button--secondary button--sm" onClick={() => onOpen(creation)}>
                    Open
                  </button>
                  <button type="button" className="button button--secondary button--sm" onClick={() => onShare(creation)}>
                    Share
                  </button>
                  <button type="button" className="button button--secondary button--sm" onClick={() => onDelete(creation)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <Modal
        isOpen={Boolean(selectedCreation)}
        onClose={onClosePreview}
        title="Preview"
      >
        {selectedCreation && (
          <div className="creation-preview">
            <div className="creation-preview__media">
              {selectedCreation.previewUrl && !selectedCreation.isMissing ? (
                selectedCreation.type.startsWith('video/') ? (
                  <video src={selectedCreation.previewUrl} controls playsInline />
                ) : (
                  <img src={selectedCreation.previewUrl} alt={`Creation from ${selectedLabel}`} />
                )
              ) : (
                <div className="creation-preview__missing">This file is no longer available on this device.</div>
              )}
            </div>
            <p className="creation-preview__date">{selectedLabel}</p>
          </div>
        )}
      </Modal>
    </>
  );
}
