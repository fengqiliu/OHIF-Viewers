import { Types as OhifTypes, pubSubServiceInterface } from '@ohif/core';
import { computeCPRReformation, cacheCPRImage, removeCPRImage } from '../../utils/cpr';

const EVENTS = {
  CPR_PATH_CREATED: 'event::cprService:pathCreated',
  CPR_PATH_UPDATED: 'event::cprService:pathUpdated',
  CPR_PATH_DELETED: 'event::cprService:pathDeleted',
  CPR_REFORMATION_UPDATED: 'event::cprService:reformationUpdated',
};

type CPRPathData = {
  id: string;
  points: number[][]; // 3D points [x, y, z][]
  volumeId: string;
  studyInstanceUID: string;
  seriesInstanceUID: string;
};

type CPRConfig = {
  thickness: number; // mm
  samplingDensity: number; // mm
  mode: 'straightened';
};

type CPRReformationData = {
  pathId: string;
  config: CPRConfig;
  slices: string[]; // Image IDs
  pathLength: number;
  sliceSpacing: number;
  timestamp: number;
  imageId?: string; // Primary image ID for display
  width?: number;
  height?: number;
};

export default class CPRService {
  public static REGISTRATION = {
    name: 'cprService',
    altName: 'CPRService',
    create: ({ servicesManager }: OhifTypes.Extensions.ExtensionParams): CPRService => {
      return new CPRService(servicesManager);
    },
  };

  servicesManager: AppTypes.ServicesManager;
  measurementService: any;
  displaySetService: any;
  cornerstoneViewportService: any;

  private paths: Map<string, CPRPathData> = new Map();
  private reformations: Map<string, CPRReformationData> = new Map();

  /**
   * Service-specific
   */
  listeners: { [key: string]: Function[] };
  EVENTS: { [key: string]: string };

  constructor(servicesManager: AppTypes.ServicesManager) {
    const { measurementService, displaySetService, cornerstoneViewportService } =
      servicesManager.services;

    this.servicesManager = servicesManager;
    this.measurementService = measurementService;
    this.displaySetService = displaySetService;
    this.cornerstoneViewportService = cornerstoneViewportService;

    this.listeners = {};
    this.EVENTS = EVENTS;
    Object.assign(this, pubSubServiceInterface);

    this._init();
  }

  onModeExit() {
    this.destroy();
  }

  private _init() {
    // Subscribe to measurement service events to track CPR paths
    if (this.measurementService) {
      this.measurementService.subscribe(
        this.measurementService.EVENTS.MEASUREMENT_ADDED,
        this._onMeasurementAdded
      );
      this.measurementService.subscribe(
        this.measurementService.EVENTS.MEASUREMENT_UPDATED,
        this._onMeasurementUpdated
      );
      this.measurementService.subscribe(
        this.measurementService.EVENTS.MEASUREMENT_REMOVED,
        this._onMeasurementRemoved
      );
    }
  }

  private _onMeasurementAdded = ({ source, measurement }) => {
    // Check if this is a CPR path measurement
    if (measurement.type === 'CPRPath') {
      this._registerPathFromMeasurement(measurement);
    }
  };

  private _onMeasurementUpdated = ({ source, measurement }) => {
    if (measurement.type === 'CPRPath') {
      this._updatePathFromMeasurement(measurement);
    }
  };

  private _onMeasurementRemoved = ({ source, measurement }) => {
    if (measurement.type === 'CPRPath') {
      this.deletePath(measurement.id);
    }
  };

  private _registerPathFromMeasurement(measurement: any) {
    let volumeId = measurement.volumeId || '';

    // Fallback: resolve volume ID from display set
    if (!volumeId && measurement.displaySetInstanceUID) {
      volumeId = `cornerstoneStreamingImageVolume:${measurement.displaySetInstanceUID}`;
    }

    const pathData: CPRPathData = {
      id: measurement.id,
      points: measurement.points || [],
      volumeId,
      studyInstanceUID: measurement.studyInstanceUID || '',
      seriesInstanceUID: measurement.seriesInstanceUID || '',
    };

    this.paths.set(pathData.id, pathData);
    this._broadcastEvent(this.EVENTS.CPR_PATH_CREATED, { pathId: pathData.id, pathData });
  }

  private _updatePathFromMeasurement(measurement: any) {
    const existingPath = this.paths.get(measurement.id);
    if (existingPath) {
      existingPath.points = measurement.points || existingPath.points;
      this.paths.set(measurement.id, existingPath);

      // Invalidate reformation cache for this path
      this.reformations.delete(measurement.id);

      this._broadcastEvent(this.EVENTS.CPR_PATH_UPDATED, {
        pathId: measurement.id,
        pathData: existingPath
      });
    }
  }

  /**
   * Register a CPR path
   * @param pathId - Unique identifier for the path
   * @param pathData - Path data including points and metadata
   */
  public registerPath(pathId: string, pathData: CPRPathData): void {
    this.paths.set(pathId, pathData);
    this._broadcastEvent(this.EVENTS.CPR_PATH_CREATED, { pathId, pathData });
  }

  /**
   * Update an existing CPR path
   * @param pathId - Path identifier
   * @param newPathData - Updated path data
   */
  public updatePath(pathId: string, newPathData: Partial<CPRPathData>): void {
    const existingPath = this.paths.get(pathId);
    if (!existingPath) {
      console.warn(`CPR path ${pathId} not found`);
      return;
    }

    const updatedPath = { ...existingPath, ...newPathData };
    this.paths.set(pathId, updatedPath);

    // Invalidate reformation cache
    this.reformations.delete(pathId);

    this._broadcastEvent(this.EVENTS.CPR_PATH_UPDATED, { pathId, pathData: updatedPath });
  }

  /**
   * Delete a CPR path and its associated reformation
   * @param pathId - Path identifier
   */
  public deletePath(pathId: string): void {
    // Clean up cached reformation image
    const reformation = this.reformations.get(pathId);
    if (reformation?.imageId) {
      removeCPRImage(reformation.imageId);
    }

    this.paths.delete(pathId);
    this.reformations.delete(pathId);
    this._broadcastEvent(this.EVENTS.CPR_PATH_DELETED, { pathId });
  }

  /**
   * Get a CPR path by ID
   * @param pathId - Path identifier
   * @returns Path data or undefined
   */
  public getPath(pathId: string): CPRPathData | undefined {
    return this.paths.get(pathId);
  }

  /**
   * Get all registered CPR paths
   * @returns Array of all path data
   */
  public getAllPaths(): CPRPathData[] {
    return Array.from(this.paths.values());
  }

  /**
   * Create a CPR reformation from a path
   * @param pathId - Path identifier
   * @param config - Reformation configuration
   * @returns Promise resolving to reformation data
   */
  public async createReformation(
    pathId: string,
    config: CPRConfig
  ): Promise<CPRReformationData> {
    const pathData = this.paths.get(pathId);
    if (!pathData) {
      throw new Error(`CPR path ${pathId} not found`);
    }

    // Check cache first
    const cached = this.reformations.get(pathId);
    if (cached && this._configMatches(cached.config, config)) {
      return cached;
    }

    // Compute the perpendicular sample count from thickness and sampling density
    const perpendicularSamples = Math.max(
      2,
      Math.ceil(config.thickness / config.samplingDensity)
    );

    // Run the reformation algorithm
    const result = computeCPRReformation({
      pathPoints: pathData.points,
      volumeId: pathData.volumeId,
      samplingDensity: config.samplingDensity,
      thickness: config.thickness,
      perpendicularSamples,
    });

    // Generate a unique image ID and cache it for the image loader
    const imageId = `cpr:${pathId}_${Date.now()}`;
    cacheCPRImage(imageId, result);

    const reformationData: CPRReformationData = {
      pathId,
      config,
      slices: [imageId],
      pathLength: result.pathLength,
      sliceSpacing: config.samplingDensity,
      timestamp: Date.now(),
      imageId,
      width: result.width,
      height: result.height,
    };

    this.reformations.set(pathId, reformationData);
    this._broadcastEvent(this.EVENTS.CPR_REFORMATION_UPDATED, { pathId, reformationData });

    return reformationData;
  }

  /**
   * Update an existing reformation with new configuration
   * @param pathId - Path identifier
   * @param newConfig - New reformation configuration
   * @returns Promise resolving to updated reformation data
   */
  public async updateReformation(
    pathId: string,
    newConfig: CPRConfig
  ): Promise<CPRReformationData> {
    // Invalidate cache and regenerate
    this.reformations.delete(pathId);
    return this.createReformation(pathId, newConfig);
  }

  /**
   * Get reformation data for a path
   * @param pathId - Path identifier
   * @returns Reformation data or undefined
   */
  public getReformationData(pathId: string): CPRReformationData | undefined {
    return this.reformations.get(pathId);
  }

  private _configMatches(config1: CPRConfig, config2: CPRConfig): boolean {
    return (
      config1.thickness === config2.thickness &&
      config1.samplingDensity === config2.samplingDensity &&
      config1.mode === config2.mode
    );
  }

  public destroy() {
    // Clean up subscriptions
    if (this.measurementService) {
      this.measurementService.unsubscribe(
        this.measurementService.EVENTS.MEASUREMENT_ADDED,
        this._onMeasurementAdded
      );
      this.measurementService.unsubscribe(
        this.measurementService.EVENTS.MEASUREMENT_UPDATED,
        this._onMeasurementUpdated
      );
      this.measurementService.unsubscribe(
        this.measurementService.EVENTS.MEASUREMENT_REMOVED,
        this._onMeasurementRemoved
      );
    }

    // Clear data
    this.paths.clear();
    this.reformations.clear();
  }
}
