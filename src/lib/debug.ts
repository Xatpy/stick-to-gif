export type DebugLevel = 'info' | 'warn' | 'error';

export interface DebugEntry {
  timestamp: string;
  level: DebugLevel;
  message: string;
}

export type DebugReporter = (entry: DebugEntry) => void;

function timeStamp() {
  return new Date().toLocaleTimeString();
}

export function emitDebug(
  reporter: DebugReporter | undefined,
  level: DebugLevel,
  message: string,
) {
  const entry: DebugEntry = {
    timestamp: timeStamp(),
    level,
    message,
  };

  const prefix = `[StickToGif ${entry.timestamp}]`;
  if (level === 'error') {
    console.error(prefix, message);
  } else if (level === 'warn') {
    console.warn(prefix, message);
  } else {
    console.log(prefix, message);
  }

  reporter?.(entry);
}
