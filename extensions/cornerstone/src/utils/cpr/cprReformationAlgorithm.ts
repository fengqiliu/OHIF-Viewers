import { cache } from '@cornerstonejs/core';

export interface CPRReformationInput {
  pathPoints: number[][]; // 3D world-space points from spline polyline
  volumeId: string; // Cornerstone3D volume ID
  samplingDensity: number; // mm between samples along path
  thickness: number; // mm perpendicular extent (half on each side)
  perpendicularSamples: number; // number of samples across the perpendicular direction
}

export interface CPRReformationOutput {
  pixelData: Float32Array; // The reformed 2D image pixel data
  width: number; // Number of perpendicular samples (columns)
  height: number; // Number of samples along path (rows)
  pathLength: number; // Total path length in mm
  columnSpacing: number; // Spacing in perpendicular direction (mm/pixel)
  rowSpacing: number; // Spacing along path direction (mm/pixel)
  windowCenter: number;
  windowWidth: number;
}

type Vec3 = [number, number, number];

/**
 * Compute CPR (Curved Planar Reformation) from a volume along a spline path.
 *
 * Algorithm:
 * 1. Resample the path to uniform spacing
 * 2. Compute parallel transport frames along the path
 * 3. Sample perpendicular cross-sections using trilinear interpolation
 * 4. Assemble into a 2D straightened image
 */
export function computeCPRReformation(
  input: CPRReformationInput
): CPRReformationOutput {
  const { pathPoints, volumeId, samplingDensity, thickness, perpendicularSamples } = input;

  // Get volume from cache
  const volume = cache.getVolume(volumeId);
  if (!volume) {
    throw new Error(`Volume ${volumeId} not found in cache`);
  }

  const imageData = volume.imageData;
  const scalarData = volume.voxelManager
    ? volume.voxelManager.getCompleteScalarDataArray()
    : (volume as any).scalarData;
  const dimensions = volume.dimensions as [number, number, number];

  if (!scalarData || !imageData) {
    throw new Error('Volume has no scalar data or image data');
  }

  if (pathPoints.length < 2) {
    throw new Error('CPR path must have at least 2 points');
  }

  // Step 1: Resample path to uniform spacing
  const resampledPoints = resamplePath(pathPoints, samplingDensity);
  const pathLength = computePolylineLength(pathPoints);

  if (resampledPoints.length < 2) {
    throw new Error('Resampled path has fewer than 2 points');
  }

  // Step 2: Compute tangent vectors and parallel transport frames
  const tangents = computeTangents(resampledPoints);
  const { normals } = computeParallelTransportFrames(resampledPoints, tangents);

  // Step 3: Sample perpendicular cross-sections
  const height = resampledPoints.length; // rows = along path
  const width = perpendicularSamples; // columns = perpendicular
  const columnSpacing = thickness / Math.max(width - 1, 1);
  const halfThickness = thickness / 2;

  const pixelData = new Float32Array(width * height);
  let minVal = Infinity;
  let maxVal = -Infinity;

  for (let row = 0; row < height; row++) {
    const center = resampledPoints[row];
    const normal = normals[row];

    for (let col = 0; col < width; col++) {
      const t = -halfThickness + col * columnSpacing;

      // World position along the normal at this offset
      const worldPos: Vec3 = [
        center[0] + t * normal[0],
        center[1] + t * normal[1],
        center[2] + t * normal[2],
      ];

      // Convert world to index coordinates
      const indexPos = [0, 0, 0];
      imageData.worldToIndex(worldPos, indexPos);

      // Trilinear interpolation
      const value = trilinearInterpolate(
        scalarData,
        dimensions,
        indexPos[0],
        indexPos[1],
        indexPos[2]
      );

      pixelData[row * width + col] = value;

      if (value < minVal) {
        minVal = value;
      }
      if (value > maxVal) {
        maxVal = value;
      }
    }
  }

  // Compute window/level from data range
  const windowWidth = maxVal - minVal || 1;
  const windowCenter = minVal + windowWidth / 2;

  return {
    pixelData,
    width,
    height,
    pathLength,
    columnSpacing,
    rowSpacing: samplingDensity,
    windowCenter,
    windowWidth,
  };
}

// ============================================================
// Helper functions
// ============================================================

/**
 * Compute total length of a polyline defined by 3D points.
 */
function computePolylineLength(points: number[][]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += distance3D(points[i - 1], points[i]);
  }
  return length;
}

/**
 * Euclidean distance between two 3D points.
 */
function distance3D(a: number[], b: number[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Resample a polyline to uniform spacing along its length.
 */
function resamplePath(points: number[][], spacing: number): Vec3[] {
  const totalLength = computePolylineLength(points);
  if (totalLength < spacing) {
    return [
      [points[0][0], points[0][1], points[0][2]],
      [points[points.length - 1][0], points[points.length - 1][1], points[points.length - 1][2]],
    ];
  }

  const numSamples = Math.max(2, Math.floor(totalLength / spacing) + 1);
  const result: Vec3[] = [];

  let segIdx = 0;
  let segOffset = 0; // distance already consumed in current segment

  for (let i = 0; i < numSamples; i++) {
    const targetDist = (i / (numSamples - 1)) * totalLength;
    let accumulated = 0;

    // Walk segments to find the one containing targetDist
    segIdx = 0;
    for (segIdx = 0; segIdx < points.length - 1; segIdx++) {
      const segLen = distance3D(points[segIdx], points[segIdx + 1]);
      if (accumulated + segLen >= targetDist - 1e-10) {
        segOffset = targetDist - accumulated;
        break;
      }
      accumulated += segLen;
    }

    // Clamp to last segment
    if (segIdx >= points.length - 1) {
      segIdx = points.length - 2;
      segOffset = distance3D(points[segIdx], points[segIdx + 1]);
    }

    const segLen = distance3D(points[segIdx], points[segIdx + 1]);
    const t = segLen > 1e-10 ? segOffset / segLen : 0;

    const p0 = points[segIdx];
    const p1 = points[segIdx + 1];
    result.push([
      p0[0] + t * (p1[0] - p0[0]),
      p0[1] + t * (p1[1] - p0[1]),
      p0[2] + t * (p1[2] - p0[2]),
    ]);
  }

  return result;
}

/**
 * Compute normalized tangent vectors at each point using central differences.
 */
function computeTangents(points: Vec3[]): Vec3[] {
  const n = points.length;
  const tangents: Vec3[] = [];

  for (let i = 0; i < n; i++) {
    let dx: number, dy: number, dz: number;

    if (i === 0) {
      // Forward difference
      dx = points[1][0] - points[0][0];
      dy = points[1][1] - points[0][1];
      dz = points[1][2] - points[0][2];
    } else if (i === n - 1) {
      // Backward difference
      dx = points[n - 1][0] - points[n - 2][0];
      dy = points[n - 1][1] - points[n - 2][1];
      dz = points[n - 1][2] - points[n - 2][2];
    } else {
      // Central difference
      dx = points[i + 1][0] - points[i - 1][0];
      dy = points[i + 1][1] - points[i - 1][1];
      dz = points[i + 1][2] - points[i - 1][2];
    }

    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len > 1e-10) {
      tangents.push([dx / len, dy / len, dz / len]);
    } else {
      // Degenerate case: use previous tangent or default
      tangents.push(i > 0 ? [...tangents[i - 1]] : [1, 0, 0]);
    }
  }

  return tangents;
}

/**
 * Compute parallel transport frames (Bishop frames) along the path.
 * This avoids the discontinuities of Frenet-Serret frames at inflection points.
 */
function computeParallelTransportFrames(
  points: Vec3[],
  tangents: Vec3[]
): { normals: Vec3[]; binormals: Vec3[] } {
  const n = points.length;
  const normals: Vec3[] = [];
  const binormals: Vec3[] = [];

  // Choose initial normal perpendicular to first tangent
  const initialNormal = choosePerpendicularAxis(tangents[0]);
  normals.push(initialNormal);
  binormals.push(cross(tangents[0], initialNormal));

  for (let i = 1; i < n; i++) {
    const prevT = tangents[i - 1];
    const currT = tangents[i];

    // Rotation axis between consecutive tangents
    const rotAxis = cross(prevT, currT);
    const rotAxisLen = vecLength(rotAxis);

    let newNormal: Vec3;

    if (rotAxisLen > 1e-10) {
      // Normalize rotation axis
      const axis: Vec3 = [
        rotAxis[0] / rotAxisLen,
        rotAxis[1] / rotAxisLen,
        rotAxis[2] / rotAxisLen,
      ];

      // Rotation angle
      const dotVal = Math.min(1, Math.max(-1, dot(prevT, currT)));
      const angle = Math.acos(dotVal);

      // Rotate previous normal by this angle around the axis
      newNormal = rotateVector(normals[i - 1], axis, angle);
    } else {
      // Tangents are parallel, keep previous normal
      newNormal = [...normals[i - 1]];
    }

    // Ensure orthogonality by re-orthogonalizing
    const proj = dot(newNormal, currT);
    newNormal[0] -= proj * currT[0];
    newNormal[1] -= proj * currT[1];
    newNormal[2] -= proj * currT[2];
    const nLen = vecLength(newNormal);
    if (nLen > 1e-10) {
      newNormal[0] /= nLen;
      newNormal[1] /= nLen;
      newNormal[2] /= nLen;
    }

    normals.push(newNormal);
    binormals.push(cross(currT, newNormal));
  }

  return { normals, binormals };
}

/**
 * Choose an axis most perpendicular to the given vector.
 */
function choosePerpendicularAxis(v: Vec3): Vec3 {
  const absX = Math.abs(v[0]);
  const absY = Math.abs(v[1]);
  const absZ = Math.abs(v[2]);

  // Choose the axis least aligned with v
  let candidate: Vec3;
  if (absX <= absY && absX <= absZ) {
    candidate = [1, 0, 0];
  } else if (absY <= absX && absY <= absZ) {
    candidate = [0, 1, 0];
  } else {
    candidate = [0, 0, 1];
  }

  // Gram-Schmidt: make candidate perpendicular to v
  const d = dot(candidate, v);
  const perp: Vec3 = [
    candidate[0] - d * v[0],
    candidate[1] - d * v[1],
    candidate[2] - d * v[2],
  ];

  const len = vecLength(perp);
  return [perp[0] / len, perp[1] / len, perp[2] / len];
}

/**
 * Rotate vector around an axis by an angle (Rodrigues' rotation formula).
 */
function rotateVector(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const dotAV = dot(axis, v);
  const crossAV = cross(axis, v);

  return [
    v[0] * cosA + crossAV[0] * sinA + axis[0] * dotAV * (1 - cosA),
    v[1] * cosA + crossAV[1] * sinA + axis[1] * dotAV * (1 - cosA),
    v[2] * cosA + crossAV[2] * sinA + axis[2] * dotAV * (1 - cosA),
  ];
}

// ============================================================
// Vector math helpers
// ============================================================

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vecLength(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

// ============================================================
// Trilinear interpolation
// ============================================================

/**
 * Sample a volume using trilinear interpolation at fractional index coordinates.
 */
function trilinearInterpolate(
  scalarData: any,
  dimensions: [number, number, number],
  ix: number,
  iy: number,
  iz: number
): number {
  const [dimX, dimY, dimZ] = dimensions;

  // Floor indices
  const x0 = Math.floor(ix);
  const y0 = Math.floor(iy);
  const z0 = Math.floor(iz);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const z1 = z0 + 1;

  // Bounds check - return 0 if outside volume
  if (x0 < 0 || y0 < 0 || z0 < 0 || x1 >= dimX || y1 >= dimY || z1 >= dimZ) {
    return 0;
  }

  // Fractional parts
  const fx = ix - x0;
  const fy = iy - y0;
  const fz = iz - z0;

  // Index into flat array: x + y * dimX + z * dimX * dimY
  const sliceSize = dimX * dimY;

  const c000 = scalarData[x0 + y0 * dimX + z0 * sliceSize];
  const c100 = scalarData[x1 + y0 * dimX + z0 * sliceSize];
  const c010 = scalarData[x0 + y1 * dimX + z0 * sliceSize];
  const c110 = scalarData[x1 + y1 * dimX + z0 * sliceSize];
  const c001 = scalarData[x0 + y0 * dimX + z1 * sliceSize];
  const c101 = scalarData[x1 + y0 * dimX + z1 * sliceSize];
  const c011 = scalarData[x0 + y1 * dimX + z1 * sliceSize];
  const c111 = scalarData[x1 + y1 * dimX + z1 * sliceSize];

  // Interpolate along x
  const c00 = c000 * (1 - fx) + c100 * fx;
  const c10 = c010 * (1 - fx) + c110 * fx;
  const c01 = c001 * (1 - fx) + c101 * fx;
  const c11 = c011 * (1 - fx) + c111 * fx;

  // Interpolate along y
  const c0 = c00 * (1 - fy) + c10 * fy;
  const c1 = c01 * (1 - fy) + c11 * fy;

  // Interpolate along z
  return c0 * (1 - fz) + c1 * fz;
}
