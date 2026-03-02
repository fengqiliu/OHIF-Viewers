import * as cornerstone from '@cornerstonejs/core';
import type { CPRReformationOutput } from './cprReformationAlgorithm';

const cprImageCache = new Map<string, CPRReformationOutput>();

/**
 * Register the CPR custom image loader with Cornerstone3D.
 * Images are served via the 'cpr:' URI scheme.
 */
export function registerCPRImageLoader(): void {
  cornerstone.imageLoader.registerImageLoader('cpr', cprImageLoadFunction);
}

/**
 * Cache a CPR reformation result so the image loader can serve it.
 */
export function cacheCPRImage(
  imageId: string,
  reformationOutput: CPRReformationOutput
): void {
  cprImageCache.set(imageId, reformationOutput);
}

/**
 * Remove a cached CPR image.
 */
export function removeCPRImage(imageId: string): void {
  cprImageCache.delete(imageId);
}

/**
 * Custom image loader for CPR reformation images.
 */
function cprImageLoadFunction(imageId: string) {
  const promise = new Promise<Record<string, any>>((resolve, reject) => {
    const data = cprImageCache.get(imageId);
    if (!data) {
      reject(new Error(`CPR image not found: ${imageId}`));
      return;
    }

    const image = {
      imageId,
      minPixelValue: data.windowCenter - data.windowWidth / 2,
      maxPixelValue: data.windowCenter + data.windowWidth / 2,
      slope: 1,
      intercept: 0,
      windowCenter: data.windowCenter,
      windowWidth: data.windowWidth,
      rows: data.height,
      columns: data.width,
      height: data.height,
      width: data.width,
      color: false,
      columnPixelSpacing: data.columnSpacing,
      rowPixelSpacing: data.rowSpacing,
      sizeInBytes: data.pixelData.byteLength,
      getPixelData: () => data.pixelData,
    };

    resolve(image);
  });

  return { promise };
}
