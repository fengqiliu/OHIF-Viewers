import SUPPORTED_TOOLS from './constants/supportedTools';
import getSOPInstanceAttributes from './utils/getSOPInstanceAttributes';
import { utils } from '@ohif/core';
import { getIsLocked } from './utils/getIsLocked';
import { getIsVisible } from './utils/getIsVisible';
import { getDisplayUnit } from './utils';

/**
 * Represents a mapping utility for CPR Path measurements.
 * CPR Paths are spline-based curves used to define centerlines for
 * Curved Planar Reformation (CPR) visualization.
 */
const CPRPath = {
  toAnnotation: measurement => {
    // Implementation for converting measurement to annotation
    // This will be used when loading saved measurements
  },

  /**
   * Maps cornerstone annotation event data to measurement service format.
   *
   * @param {Object} csToolsEventDetail - Cornerstone event data
   * @param {DisplaySetService} displaySetService - Service for managing display sets
   * @param {CornerstoneViewportService} CornerstoneViewportService - Service for managing viewports
   * @param {Function} getValueTypeFromToolType - Function to get value type from tool type
   * @param {CustomizationService} customizationService - Service for customization
   * @returns {Measurement | null} Measurement instance or null if invalid
   */
  toMeasurement: (
    csToolsEventDetail,
    displaySetService,
    CornerstoneViewportService,
    getValueTypeFromToolType,
    customizationService
  ) => {
    const { annotation } = csToolsEventDetail;
    const { metadata, data, annotationUID } = annotation;

    const isLocked = getIsLocked(annotationUID);
    const isVisible = getIsVisible(annotationUID);

    if (!metadata || !data) {
      console.warn('CPRPath tool: Missing metadata or data');
      return null;
    }

    const { toolName, referencedImageId, FrameOfReferenceUID } = metadata;
    const validToolType = SUPPORTED_TOOLS.includes(toolName);

    if (!validToolType) {
      throw new Error(`Tool ${toolName} not supported`);
    }

    const { SOPInstanceUID, SeriesInstanceUID, frameNumber, StudyInstanceUID } =
      getSOPInstanceAttributes(referencedImageId, displaySetService, annotation);

    let displaySet;
    if (SOPInstanceUID) {
      displaySet = displaySetService.getDisplaySetForSOPInstanceUID(
        SOPInstanceUID,
        SeriesInstanceUID
      );
    } else {
      displaySet = displaySetService.getDisplaySetsForSeries(SeriesInstanceUID)[0];
    }

    // Get CPR-specific configuration
    const cprConfig = data.cprConfig || {
      thickness: 5,
      samplingDensity: 0.5,
      mode: 'straightened',
    };

    // Calculate path length
    const pathLength = calculatePathLength(data.contour.polyline);

    const displayText = getDisplayText(pathLength, data.contour.polyline.length);

    return {
      uid: annotationUID,
      SOPInstanceUID,
      FrameOfReferenceUID,
      points: data.contour.polyline,
      textBox: data.handles.textBox,
      metadata,
      frameNumber,
      referenceSeriesUID: SeriesInstanceUID,
      referenceStudyUID: StudyInstanceUID,
      referencedImageId,
      toolName: metadata.toolName,
      displaySetInstanceUID: displaySet.displaySetInstanceUID,
      label: data.label,
      displayText: displayText,
      data: {
        pathLength,
        numPoints: data.contour.polyline.length,
        cprConfig,
      },
      type: 'CPRPath', // Custom type for CPR paths
      getReport: () => getColumnValueReport(annotation, pathLength),
      isLocked,
      isVisible,
      // Additional CPR-specific properties
      volumeId: displaySet.volumeId || '',
      studyInstanceUID: StudyInstanceUID,
      seriesInstanceUID: SeriesInstanceUID,
    };
  },
};

/**
 * Calculate the total length of a path defined by polyline points
 * @param {Array} polyline - Array of 3D points [[x, y, z], ...]
 * @returns {number} Total path length in mm
 */
function calculatePathLength(polyline) {
  if (!polyline || polyline.length < 2) {
    return 0;
  }

  let totalLength = 0;
  for (let i = 1; i < polyline.length; i++) {
    const p1 = polyline[i - 1];
    const p2 = polyline[i];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const dz = p2[2] - p1[2];
    const segmentLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
    totalLength += segmentLength;
  }

  return totalLength;
}

/**
 * Converts the measurement data to a format suitable for report generation.
 *
 * @param {object} annotation - The annotation object.
 * @param {number} pathLength - The calculated path length.
 * @returns {object} Report's content.
 */
function getColumnValueReport(annotation, pathLength) {
  const columns = [];
  const values = [];

  /** Add type */
  columns.push('AnnotationType');
  values.push('Cornerstone:CPRPath');

  /** Add path length */
  columns.push('PathLength');
  values.push(`${utils.roundNumber(pathLength, 2)} mm`);

  /** Add number of points */
  const { data } = annotation;
  columns.push('NumberOfPoints');
  values.push(data.contour.polyline.length);

  /** Add CPR configuration */
  if (data.cprConfig) {
    columns.push('Thickness');
    values.push(`${data.cprConfig.thickness} mm`);

    columns.push('SamplingDensity');
    values.push(`${data.cprConfig.samplingDensity} mm`);

    columns.push('Mode');
    values.push(data.cprConfig.mode);
  }

  /** Add FOR */
  const { metadata } = annotation;
  if (metadata.FrameOfReferenceUID) {
    columns.push('FrameOfReferenceUID');
    values.push(metadata.FrameOfReferenceUID);
  }

  /** Add points */
  if (data.contour.polyline) {
    columns.push('points');
    values.push(data.contour.polyline.map(p => p.join(' ')).join(';'));
  }

  return { columns, values };
}

/**
 * Retrieves the display text for a CPR path annotation.
 *
 * @param {number} pathLength - The path length in mm.
 * @param {number} numPoints - Number of points in the path.
 * @returns {Object} Display text with primary and secondary information.
 */
function getDisplayText(pathLength, numPoints) {
  const displayText = {
    primary: [],
    secondary: [],
  };

  const roundedLength = utils.roundNumber(pathLength || 0, 2);
  displayText.primary.push(`Length: ${roundedLength} mm`);
  displayText.secondary.push(`Points: ${numPoints}`);

  return displayText;
}

export default CPRPath;
