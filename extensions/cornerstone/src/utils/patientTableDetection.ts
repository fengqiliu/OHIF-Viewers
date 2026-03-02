import { vec3 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';

/**
 * Result of patient table detection containing clipping plane information
 */
export interface PatientTableDetectionResult {
  /**
   * Whether table was detected
   */
  detected: boolean;
  /**
   * Clipping plane position in world coordinates (for the table side)
   */
  clippingPlanePosition?: vec3;
  /**
   * Normal vector for the clipping plane (pointing inward to keep)
   */
  clippingPlaneNormal?: vec3;
  /**
   * Confidence score of detection (0-1)
   */
  confidence?: number;
}

/**
 * Configuration for patient table detection
 */
export interface PatientTableDetectionConfig {
  /**
   * Minimum HU value to consider as table (default: 500 for metal/plastic)
   */
  minHUThreshold: number;
  /**
   * Minimum width of table region in mm (default: 50mm)
   */
  minTableWidthMm: number;
  /**
   * Number of slices to sample for detection (default: 10)
   */
  sliceSamplingCount: number;
}

/**
 * Default configuration for patient table detection
 */
const DEFAULT_CONFIG: PatientTableDetectionConfig = {
  minHUThreshold: 500,
  minTableWidthMm: 50,
  sliceSamplingCount: 10,
};

/**
 * Detects the patient table position in a CT volume based on volume dimensions and spacing.
 * The patient table (bed) typically appears at one end of the volume (usually the inferior end).
 *
 * @param volume - The cornerstone volume to analyze
 * @param config - Optional configuration overrides
 * @returns Detection result with clipping plane information
 */
export function detectPatientTable(
  volume: Types.IVolume,
  config?: Partial<PatientTableDetectionConfig>
): PatientTableDetectionResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Get volume metadata
  const imageData = volume.imageData;
  const dimensions = imageData.getDimensions() as [number, number, number];
  const spacing = imageData.getSpacing() as [number, number, number];

  // Calculate the position of the patient table based on volume geometry
  // The table is typically at one end of the scan (either at the top or bottom in the Y direction)

  // Calculate the world position of the volume bounds
  const bounds = imageData.getBounds();
  const [xMin, xMax, yMin, yMax, zMin, zMax] = bounds;

  // For CT scans, the table is typically at the bottom (negative Y direction in LPS)
  // We'll use a heuristic: assume the table is at the bottom 10% of the volume

  // Determine if the table is at the top or bottom based on the volume dimensions
  const volumeHeight = yMax - yMin;

  // Typical table width is around 50-60cm, but this varies
  // We'll set the clipping position to remove the bottom 5-8cm depending on the volume size
  const tableThicknessEstimateMm = Math.min(80, volumeHeight * 0.1); // Estimate 10% of volume, max 80mm

  // The clipping position - we'll remove everything below this Y value
  // In DICOM LPS coordinate system, negative Y is typically towards the patient table
  const clippingY = yMin + tableThicknessEstimateMm;

  // Set up the world position and normal for the clipping plane
  const worldPosition = vec3.fromValues(0, clippingY, 0);
  const normal = vec3.fromValues(0, 1, 0); // Normal pointing up (keep everything above the table)

  // Confidence is moderate since we're using a heuristic
  const confidence = 0.7;

  return {
    detected: true,
    clippingPlanePosition: worldPosition,
    clippingPlaneNormal: normal,
    confidence,
  };
}

/**
 * Gets the bounds of the patient table based on volume dimensions and detected position
 * This returns values suitable for setting clipping planes in VTK
 *
 * @param volume - The volume to analyze
 * @param detectionResult - The detection result from detectPatientTable
 * @returns Bounds array [xMin, xMax, yMin, yMax, zMin, zMax]
 */
export function getTableClippingBounds(
  volume: Types.IVolume,
  detectionResult: PatientTableDetectionResult
): [number, number, number, number, number, number] | null {
  if (!detectionResult.detected || !detectionResult.clippingPlanePosition) {
    return null;
  }

  const imageData = volume.imageData;
  const bounds = imageData.getBounds();

  // Get the table position in world coordinates
  const tablePos = detectionResult.clippingPlanePosition;
  const normal = detectionResult.clippingPlaneNormal;

  // Return full bounds if no valid table detection
  if (!tablePos || !normal) {
    return bounds as [number, number, number, number, number, number];
  }

  // Calculate clipping bounds based on the plane position and normal
  // This will remove everything on the "table" side of the plane
  const [xMin, xMax, yMin, yMax, zMin, zMax] = bounds;

  // If normal is pointing up (Y positive), we clip the bottom
  // If normal is pointing down (Y negative), we clip the top
  if (normal[1] > 0) {
    // Clip from bottom (yMin to table position)
    return [xMin, xMax, tablePos[1], yMax, zMin, zMax];
  } else {
    // Clip from top (table position to yMax)
    return [xMin, xMax, yMin, tablePos[1], zMin, zMax];
  }
}

export default detectPatientTable;
