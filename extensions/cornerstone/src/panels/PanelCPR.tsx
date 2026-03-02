import React, { useState, useEffect, useCallback } from 'react';
import { useSystem } from '@ohif/core/src';

type CPRPathItem = {
  id: string;
  points: number[][];
  volumeId: string;
};

type CPRConfig = {
  thickness: number;
  samplingDensity: number;
  mode: 'straightened';
};

type ReformationInfo = {
  pathId: string;
  imageId?: string;
  pathLength: number;
  width?: number;
  height?: number;
};

export default function PanelCPR() {
  const { commandsManager, servicesManager } = useSystem();
  const { cprService } = servicesManager.services;

  const [paths, setPaths] = useState<CPRPathItem[]>([]);
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
  const [config, setConfig] = useState<CPRConfig>({
    thickness: 5,
    samplingDensity: 0.5,
    mode: 'straightened',
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [reformationInfo, setReformationInfo] =
    useState<ReformationInfo | null>(null);

  // Subscribe to CPRService events
  useEffect(() => {
    if (!cprService) {
      return;
    }

    const updatePaths = () => {
      setPaths(cprService.getAllPaths());
    };

    updatePaths();

    const subs = [
      cprService.subscribe(cprService.EVENTS.CPR_PATH_CREATED, updatePaths),
      cprService.subscribe(cprService.EVENTS.CPR_PATH_UPDATED, updatePaths),
      cprService.subscribe(cprService.EVENTS.CPR_PATH_DELETED, () => {
        updatePaths();
        setReformationInfo(null);
      }),
      cprService.subscribe(
        cprService.EVENTS.CPR_REFORMATION_UPDATED,
        ({ reformationData }) => {
          setReformationInfo({
            pathId: reformationData.pathId,
            imageId: reformationData.imageId,
            pathLength: reformationData.pathLength,
            width: reformationData.width,
            height: reformationData.height,
          });
        }
      ),
    ];

    return () => subs.forEach(s => s.unsubscribe());
  }, [cprService]);

  const handleGenerate = useCallback(async () => {
    if (!selectedPathId) {
      return;
    }
    setIsGenerating(true);
    try {
      await commandsManager.run('generateCPRReformation', {
        pathId: selectedPathId,
        config,
      });
    } catch (err) {
      console.error('CPR generation failed:', err);
    } finally {
      setIsGenerating(false);
    }
  }, [selectedPathId, config, commandsManager]);

  const handleDisplay = useCallback(() => {
    if (!reformationInfo?.imageId) {
      return;
    }
    commandsManager.run('displayCPRReformation', {
      imageId: reformationInfo.imageId,
    });
  }, [reformationInfo, commandsManager]);

  const handleDeletePath = useCallback(
    (pathId: string) => {
      if (cprService) {
        cprService.deletePath(pathId);
        if (selectedPathId === pathId) {
          setSelectedPathId(null);
          setReformationInfo(null);
        }
      }
    },
    [cprService, selectedPathId]
  );

  if (!cprService) {
    return (
      <div className="ohif-scrollbar flex flex-col overflow-y-auto p-4">
        <p className="text-muted-foreground text-sm">
          CPR Service is not available.
        </p>
      </div>
    );
  }

  return (
    <div className="ohif-scrollbar flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="bg-primary-dark border-secondary-light border-b px-4 py-3">
        <h3 className="text-primary-light text-base font-semibold">
          Curved Planar Reformation
        </h3>
      </div>

      {/* Path List */}
      <div className="px-4 py-3">
        <div className="text-primary-light mb-2 text-sm font-medium">
          CPR Paths ({paths.length})
        </div>
        {paths.length === 0 ? (
          <p className="text-primary-light/60 text-xs">
            No CPR paths. Use the CPR Path tool to draw a path on a volume.
          </p>
        ) : (
          <div className="space-y-1">
            {paths.map((path, idx) => (
              <div
                key={path.id}
                className={`flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-sm ${
                  selectedPathId === path.id
                    ? 'bg-primary-light/20 text-primary-light'
                    : 'text-primary-light/80 hover:bg-primary-light/10'
                }`}
                onClick={() => setSelectedPathId(path.id)}
              >
                <span>Path {idx + 1} ({path.points.length} pts)</span>
                <button
                  className="text-primary-light/50 hover:text-red-500 ml-2 text-xs"
                  onClick={e => {
                    e.stopPropagation();
                    handleDeletePath(path.id);
                  }}
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Configuration */}
      {selectedPathId && (
        <div className="border-secondary-light border-t px-4 py-3">
          <div className="text-primary-light mb-2 text-sm font-medium">
            Configuration
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-primary-light/80 mb-1 block text-xs">
                Thickness: {config.thickness} mm
              </label>
              <input
                type="range"
                min={1}
                max={20}
                step={0.5}
                value={config.thickness}
                onChange={e =>
                  setConfig(prev => ({
                    ...prev,
                    thickness: parseFloat(e.target.value),
                  }))
                }
                className="w-full"
              />
            </div>
            <div>
              <label className="text-primary-light/80 mb-1 block text-xs">
                Sampling Density: {config.samplingDensity} mm
              </label>
              <input
                type="range"
                min={0.1}
                max={2}
                step={0.1}
                value={config.samplingDensity}
                onChange={e =>
                  setConfig(prev => ({
                    ...prev,
                    samplingDensity: parseFloat(e.target.value),
                  }))
                }
                className="w-full"
              />
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      {selectedPathId && (
        <div className="border-secondary-light border-t px-4 py-3">
          <div className="space-y-2">
            <button
              className="bg-primary-main hover:bg-primary-main/80 text-white w-full rounded px-3 py-2 text-sm disabled:opacity-50"
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? 'Generating...' : 'Generate CPR'}
            </button>
            {reformationInfo?.imageId &&
              reformationInfo.pathId === selectedPathId && (
                <button
                  className="border-primary-main text-primary-light hover:bg-primary-main/20 w-full rounded border px-3 py-2 text-sm"
                  onClick={handleDisplay}
                >
                  Display in Viewport
                </button>
              )}
          </div>
        </div>
      )}

      {/* Reformation Info */}
      {reformationInfo && reformationInfo.pathId === selectedPathId && (
        <div className="border-secondary-light border-t px-4 py-3">
          <div className="text-primary-light mb-1 text-sm font-medium">
            Reformation Info
          </div>
          <div className="text-primary-light/60 space-y-0.5 text-xs">
            <p>Path Length: {reformationInfo.pathLength.toFixed(1)} mm</p>
            <p>
              Image Size: {reformationInfo.width} x {reformationInfo.height}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
