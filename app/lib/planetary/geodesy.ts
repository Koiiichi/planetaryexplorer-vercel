import { applyAlignmentCorrectionForward, applyAlignmentCorrectionInverse } from "./alignments";
import { PLANETARY_BODIES, PlanetaryBodyKey } from "./constants";

export type LongitudeConvention = "east-180" | "east-360" | "west-360";

export interface SimpleCylindricalProjection {
  type: "simple-cylindrical";
  body: PlanetaryBodyKey;
  centralMeridianDeg: number;
  primeMeridianOffsetDeg: number;
  lonDirection: "east" | "west";
  lonDomain: 180 | 360;
  radiusMeters?: number;
  nativeConvention?: LongitudeConvention;
}

export interface ProjectionContext {
  datasetId: string;
  projection: SimpleCylindricalProjection;
}

export interface PixelDimensions {
  width: number;
  height: number;
}

export interface CoordinateTransformOptions {
  targetConvention?: LongitudeConvention;
  applyCorrections?: boolean;
  zoomLevel?: number;
}

export interface NormalizedCoordinate {
  u: number; // 0..1 east-west
  v: number; // 0..1 north-south (0 = north pole)
  pixelOffsetX: number;
  pixelOffsetY: number;
}

export interface GeoCoordinate {
  lat: number;
  lon: number; // east-positive in requested convention
}

export function wrapLongitude180(value: number): number {
  const wrapped = ((value + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 ? 180 : wrapped;
}

export function wrapLongitude360(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function convertLongitude(
  value: number,
  from: LongitudeConvention,
  to: LongitudeConvention
): number {
  if (from === to) {
    switch (to) {
      case "east-180":
        return wrapLongitude180(value);
      case "east-360":
      case "west-360":
        return wrapLongitude360(value);
    }
  }

  const east180 = toEast180(value, from);
  return fromEast180(east180, to);
}

export function normalizeLongitude(value: number, convention: LongitudeConvention): number {
  return convertLongitude(value, convention, convention);
}

function toEast180(value: number, from: LongitudeConvention): number {
  switch (from) {
    case "east-180":
      return wrapLongitude180(value);
    case "east-360": {
      const wrapped = wrapLongitude360(value);
      return wrapped > 180 ? wrapped - 360 : wrapped;
    }
    case "west-360": {
      const wrapped = wrapLongitude360(value);
      return wrapLongitude180(-wrapped);
    }
    default:
      return wrapLongitude180(value);
  }
}

function fromEast180(value: number, to: LongitudeConvention): number {
  const east180 = wrapLongitude180(value);
  switch (to) {
    case "east-180":
      return east180;
    case "east-360": {
      const adjusted = east180 < 0 ? east180 + 360 : east180;
      return wrapLongitude360(adjusted);
    }
    case "west-360": {
      return wrapLongitude360(-east180);
    }
    default:
      return east180;
  }
}

export function createDefaultProjection(body: PlanetaryBodyKey): SimpleCylindricalProjection {
  const def = PLANETARY_BODIES[body];
  return {
    type: "simple-cylindrical",
    body,
    centralMeridianDeg: 0,
    primeMeridianOffsetDeg: def.primeMeridianOffsetDeg,
    lonDirection: def.defaultLongitudeDirection,
    lonDomain: def.defaultLongitudeDomain,
    radiusMeters: def.meanRadiusMeters,
    nativeConvention: def.defaultLongitudeDomain === 360 ? "east-360" : "east-180",
  };
}

export function latLonToNormalized(
  latDeg: number,
  lonDeg: number,
  context: ProjectionContext,
  options?: CoordinateTransformOptions
): NormalizedCoordinate {
  const { projection, datasetId } = context;
  const zoomLevel = options?.zoomLevel;
  const applyCorrections = options?.applyCorrections !== false;

  const lonCanonical = wrapLongitude180(lonDeg);
  const latClamped = Math.max(-90, Math.min(90, latDeg));

  const corrected = applyCorrections
    ? applyAlignmentCorrectionForward({
        datasetId,
        lat: latClamped,
        lon: lonCanonical,
        zoom: zoomLevel,
      })
    : { lat: latClamped, lon: lonCanonical, pixelOffsetX: 0, pixelOffsetY: 0 };

  const lonPrimeAdjusted = wrapLongitude180(corrected.lon - projection.primeMeridianOffsetDeg);
  const lonRelative = wrapLongitude180(lonPrimeAdjusted - projection.centralMeridianDeg);

  // Always convert to east-positive 0..360 for texture coordinates to keep x increasing eastward.
  const lon360 = convertLongitude(lonRelative, "east-180", "east-360");
  const u = lon360 / 360;
  const v = (90 - corrected.lat) / 180;

  return {
    u,
    v,
    pixelOffsetX: corrected.pixelOffsetX,
    pixelOffsetY: corrected.pixelOffsetY,
  };
}

export function latLonToPixel(
  latDeg: number,
  lonDeg: number,
  context: ProjectionContext,
  dimensions: PixelDimensions,
  options?: CoordinateTransformOptions
): { x: number; y: number } {
  const normalized = latLonToNormalized(latDeg, lonDeg, context, options);
  const x = normalized.u * dimensions.width + normalized.pixelOffsetX;
  const y = normalized.v * dimensions.height + normalized.pixelOffsetY;
  return { x, y };
}

export function pixelToLatLon(
  x: number,
  y: number,
  context: ProjectionContext,
  dimensions: PixelDimensions,
  options?: CoordinateTransformOptions
): GeoCoordinate {
  const { projection, datasetId } = context;
  const zoomLevel = options?.zoomLevel;
  const applyCorrections = options?.applyCorrections !== false;
  const targetConvention = options?.targetConvention ?? "east-180";

  const u = x / dimensions.width;
  const v = y / dimensions.height;

  const lonRelative = convertLongitude(u * 360, "east-360", "east-180");
  const lonPrimeAdjusted = wrapLongitude180(
    lonRelative + projection.centralMeridianDeg
  );
  const lonCanonical = wrapLongitude180(
    lonPrimeAdjusted + projection.primeMeridianOffsetDeg
  );
  const latCanonical = 90 - v * 180;

  if (!applyCorrections) {
    const lonTarget = convertLongitude(lonCanonical, "east-180", targetConvention);
    return { lat: latCanonical, lon: lonTarget };
  }

  const inverted = applyAlignmentCorrectionInverse({
    datasetId,
    lat: latCanonical,
    lon: lonCanonical,
    zoom: zoomLevel,
  });

  const lat = inverted.lat;
  const lon = convertLongitude(inverted.lon, "east-180", targetConvention);

  return { lat, lon };
}
