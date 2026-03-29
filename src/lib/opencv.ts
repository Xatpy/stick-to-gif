import type cvModule from '@techstark/opencv-js';
import { emitDebug, type DebugReporter } from './debug';

type OpenCvModule = typeof cvModule;
type OpenCvReadyModule = OpenCvModule & {
  then?: (callback: (module: OpenCvModule) => void) => unknown;
  calledRun?: boolean;
  onRuntimeInitialized?: () => void;
};

let pendingCv: Promise<OpenCvModule> | null = null;

declare global {
  interface Window {
    cv?: OpenCvReadyModule;
  }
}

function loadOpenCvScript() {
  const existing = document.querySelector<HTMLScriptElement>(
    'script[data-opencv-loader="true"]',
  );
  if (existing) {
    return existing;
  }

  const script = document.createElement('script');
  script.src = `${import.meta.env.BASE_URL}opencv.js`;
  script.async = true;
  script.dataset.opencvLoader = 'true';
  document.head.appendChild(script);
  return script;
}

function finalizeOpenCvModule(module: OpenCvReadyModule): OpenCvModule {
  if (typeof module.then === 'function') {
    try {
      Object.defineProperty(module, 'then', {
        value: undefined,
        configurable: true,
      });
    } catch {
      // Ignore if the property is not configurable in this runtime.
    }
  }

  return module as OpenCvModule;
}

export async function loadOpenCv(debugReporter?: DebugReporter) {
  if (!pendingCv) {
    pendingCv = (async (): Promise<OpenCvModule> => {
      try {
        const existingCv = window.cv;
        if (existingCv?.calledRun) {
          emitDebug(debugReporter, 'info', 'OpenCV already initialized.');
          return finalizeOpenCvModule(existingCv);
        }

        const script = loadOpenCvScript();
        emitDebug(
          debugReporter,
          'info',
          `Loading OpenCV script from ${import.meta.env.BASE_URL}opencv.js`,
        );

        await Promise.race([
          new Promise<void>((resolve, reject) => {
            const finishIfReady = () => {
              const candidate = window.cv;
              if (!candidate) {
                return false;
              }

              if (candidate.calledRun) {
                emitDebug(debugReporter, 'info', 'OpenCV runtime already running.');
                resolve();
                return true;
              }

              if (typeof candidate.then === 'function') {
                emitDebug(debugReporter, 'info', 'Waiting for OpenCV runtime promise.');
                candidate.then(() => resolve());
                return true;
              }

              emitDebug(debugReporter, 'info', 'Waiting for OpenCV onRuntimeInitialized.');
              candidate.onRuntimeInitialized = () => resolve();
              return true;
            };

            if (finishIfReady()) {
              return;
            }

            script.addEventListener(
              'load',
              () => {
                emitDebug(debugReporter, 'info', 'OpenCV script loaded.');
                if (!finishIfReady()) {
                  resolve();
                }
              },
              { once: true },
            );

            script.addEventListener(
              'error',
              () => {
                emitDebug(debugReporter, 'error', 'OpenCV script failed to load.');
                reject(new Error('Failed to load OpenCV.'));
              },
              { once: true },
            );
          }),
          new Promise<never>((_, reject) => {
            window.setTimeout(() => {
              reject(
                new Error(
                  'OpenCV took too long to initialize. Refresh the page and try again.',
                ),
              );
            }, 15000);
          }),
        ]);

        if (!window.cv) {
          emitDebug(debugReporter, 'error', 'OpenCV loaded but window.cv is missing.');
          throw new Error('OpenCV loaded incorrectly.');
        }

        emitDebug(debugReporter, 'info', 'OpenCV is ready.');
        return finalizeOpenCvModule(window.cv);
      } catch (error) {
        pendingCv = null;
        throw error;
      }
    })();
  }

  return pendingCv;
}
