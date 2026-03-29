export type ProcessingStage =
  | 'idle'
  | 'decoding'
  | 'tracking'
  | 'exporting';

export interface GifFrame {
  index: number;
  delay: number;
  imageData: ImageData;
}

export interface DecodedGif {
  name: string;
  width: number;
  height: number;
  loopCount: number;
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

export interface TrackedRegion extends Rect {
  rotation: number;
}

export interface TrackingFrame {
  frameIndex: number;
  confidence: number;
  region: TrackedRegion;
  overlay: OverlayTransform;
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
