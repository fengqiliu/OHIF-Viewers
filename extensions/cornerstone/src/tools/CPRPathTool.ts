import { SplineROITool } from '@cornerstonejs/tools';

/**
 * CPR Path Tool - extends SplineROI for defining curved paths for CPR reformation
 * This tool allows users to draw smooth spline curves that will be used as centerlines
 * for Curved Planar Reformation (CPR) visualization.
 */
class CPRPathTool extends SplineROITool {
  static toolName = 'CPRPath';

  /**
   * Override addNewAnnotation to add CPR-specific configuration
   */
  addNewAnnotation = evt => {
    const annotation = super.addNewAnnotation(evt);

    if (annotation) {
      // Add CPR-specific metadata
      annotation.data.cprConfig = {
        thickness: 5, // mm - default thickness for reformation
        samplingDensity: 0.5, // mm - default sampling density along path
        mode: 'straightened', // reformation mode
      };

      // Mark this as a CPR path annotation
      annotation.metadata.toolName = CPRPathTool.toolName;
    }

    return annotation;
  };

  /**
   * Override _getTextLines to display CPR-specific information
   */
  _getTextLines(data, targetId) {
    const textLines = super._getTextLines(data, targetId);

    // Add CPR configuration info
    if (data.cprConfig) {
      textLines.push(`Thickness: ${data.cprConfig.thickness}mm`);
      textLines.push(`Sampling: ${data.cprConfig.samplingDensity}mm`);
    }

    return textLines;
  }
}

export default CPRPathTool;

/**
 * Callback function called when CPR path annotation is completed
 * This can be used to automatically trigger CPR generation or show configuration dialog
 */
export function onCompletedCPRPath(
  servicesManager: AppTypes.ServicesManager,
  csToolsEvent
) {
  const { cprService, uiNotificationService } = servicesManager.services;

  const annotationAddedEventDetail = csToolsEvent.detail;
  const { annotation } = annotationAddedEventDetail;

  // Register the path with CPR service
  if (cprService && annotation.data.contour?.polyline) {
    const pathData = {
      id: annotation.annotationUID,
      points: annotation.data.contour.polyline,
      volumeId: annotation.metadata.volumeId || '',
      studyInstanceUID: annotation.metadata.studyInstanceUID || '',
      seriesInstanceUID: annotation.metadata.seriesInstanceUID || '',
    };

    cprService.registerPath(annotation.annotationUID, pathData);

    // Show notification
    if (uiNotificationService) {
      uiNotificationService.show({
        title: 'CPR Path Created',
        message: 'CPR path has been created. Open CPR panel to generate reformation.',
        type: 'info',
        duration: 3000,
      });
    }
  }

  return Promise.resolve(true);
}
