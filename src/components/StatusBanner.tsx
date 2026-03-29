import type { StatusState } from '../types';
import type { DebugEntry } from '../lib/debug';

interface StatusBannerProps {
  status: StatusState;
  error: string | null;
  debugLog: DebugEntry[];
}

export function StatusBanner({ status, error, debugLog }: StatusBannerProps) {
  if (error) {
    return (
      <div className="status-banner is-error" role="alert">
        <strong>Something broke:</strong> {error}
        {debugLog.length > 0 && (
          <pre className="debug-log">{debugLog.map((entry) => `[${entry.timestamp}] ${entry.message}`).join('\n')}</pre>
        )}
      </div>
    );
  }

  if (status.stage === 'idle') {
    return (
      <div className="status-banner">
        <strong>Local-first:</strong> your GIF, overlay, tracking, preview, and export stay in this browser tab.
      </div>
    );
  }

  return (
    <div className="status-banner is-busy" role="status">
      <div className="status-banner__row">
        <strong>{status.message}</strong>
        <span>{Math.round(status.progress * 100)}%</span>
      </div>
      <div className="progress-bar" aria-hidden="true">
        <div style={{ width: `${status.progress * 100}%` }} />
      </div>
      {debugLog.length > 0 && (
        <pre className="debug-log">{debugLog.slice(-6).map((entry) => `[${entry.timestamp}] ${entry.message}`).join('\n')}</pre>
      )}
    </div>
  );
}
