/**
 * Custom type declarations for OHIF Viewer
 */

// Clipping state interface for patient table removal feature
export interface ClippingState {
  [viewportId: string]: {
    originalBounds: number[];
    clippedBounds: number[];
  };
}
