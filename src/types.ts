export type ProcessingStage =
  | 'idle'
  | 'decoding'
  | 'tracking'
  | 'exporting';

export type AppStep = 'input' | 'pick-subject' | 'tracking' | 'overlay' | 'export';

export type OverlayMode = 'sticker' | 'text' | 'blur';

export interface GifFrame {
  index: number;
  delay: number;
  blob: Blob;
}

export interface DecodedGif {
  name: string;
  width: number;
  height: number;
  sourceKind: 'gif' | 'video';
  loopCount: number;
  durationMs: number;
  frameRate?: number;
  frames: GifFrame[];
}

export interface OverlayAsset {
  name: string;
  width: number;
  height: number;
  source: CanvasImageSource;
  objectUrl: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverlayTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface TextOverlayStyle {
  enabled: boolean;
  text: string;
  color: string;
  strokeColor: string;
  fontFamily: string;
  fontWeight: number;
}

export interface BlurStyle {
  /** 0–1 range: 0 = light mosaic, 1 = heavy mosaic */
  intensity: number;
}

export interface TrackedRegion extends Rect {
  rotation: number;
}

export interface TrackingFrame {
  frameIndex: number;
  confidence: number;
  region: TrackedRegion;
  imageOverlay: OverlayTransform | null;
  textOverlay: OverlayTransform | null;
}

export interface StatusState {
  stage: ProcessingStage;
  message: string;
  progress: number;
}

export interface ProgressUpdate {
  progress: number;
  message: string;
}
