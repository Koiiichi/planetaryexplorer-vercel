import alignmentTable from "@/data/alignment_corrections.json";

export interface AlignmentDynamicZoomEntry {
  zoom: number;
  lat_offset_deg?: number;
  lon_offset_deg?: number;
  pixel_offset?: { x: number; y: number };
}

export interface AlignmentLatBandEntry {
  min_lat: number;
  max_lat: number;
  lat_offset_deg?: number;
  lon_offset_deg?: number;
}

export interface AlignmentCorrection {
  lat_offset_deg?: number;
  lon_offset_deg?: number;
  pixel_offset?: { x: number; y: number };
  lat_scale?: number;
  lon_scale?: number;
  dynamic?: {
    zoom_levels?: AlignmentDynamicZoomEntry[];
    lat_bands?: AlignmentLatBandEntry[];
  };
  updated_at?: string;
}

type AlignmentDictionary = Record<string, AlignmentCorrection>;

const ALIGNMENT_DATA: AlignmentDictionary = alignmentTable as AlignmentDictionary;

export function getAlignmentCorrection(datasetId: string): AlignmentCorrection | undefined {
  return ALIGNMENT_DATA[datasetId];
}

export interface AlignmentRequest {
  datasetId: string;
  lat: number;
  lon: number;
  zoom?: number;
}

export interface AlignmentResult {
  lat: number;
  lon: number;
  pixelOffsetX: number;
  pixelOffsetY: number;
}

function resolveDynamicOffsets(
  correction: AlignmentCorrection | undefined,
  lat: number,
  zoom: number | undefined
) {
  let latOffset = correction?.lat_offset_deg ?? 0;
  let lonOffset = correction?.lon_offset_deg ?? 0;
  let pixelOffsetX = correction?.pixel_offset?.x ?? 0;
  let pixelOffsetY = correction?.pixel_offset?.y ?? 0;

  if (correction?.dynamic?.lat_bands && correction.dynamic.lat_bands.length > 0) {
    for (const band of correction.dynamic.lat_bands) {
      if (lat >= band.min_lat && lat <= band.max_lat) {
        latOffset += band.lat_offset_deg ?? 0;
        lonOffset += band.lon_offset_deg ?? 0;
      }
    }
  }

  if (zoom !== undefined && correction?.dynamic?.zoom_levels && correction.dynamic.zoom_levels.length > 0) {
    // Find two nearest entries to interpolate; assumes zoom_levels sorted asc
    const entries = correction.dynamic.zoom_levels.slice().sort((a, b) => a.zoom - b.zoom);
    let lower = entries[0];
    let upper = entries[entries.length - 1];
    for (const entry of entries) {
      if (entry.zoom <= zoom) {
        lower = entry;
      }
      if (entry.zoom >= zoom) {
        upper = entry;
        break;
      }
    }

    if (lower && upper) {
      const span = upper.zoom - lower.zoom || 1;
      const t = Math.max(0, Math.min(1, (zoom - lower.zoom) / span));
      const interp = (start?: number, end?: number) =>
        (start ?? 0) + t * ((end ?? 0) - (start ?? 0));

      latOffset += interp(lower.lat_offset_deg, upper.lat_offset_deg);
      lonOffset += interp(lower.lon_offset_deg, upper.lon_offset_deg);
      pixelOffsetX += interp(lower.pixel_offset?.x, upper.pixel_offset?.x);
      pixelOffsetY += interp(lower.pixel_offset?.y, upper.pixel_offset?.y);
    }
  }

  return { latOffset, lonOffset, pixelOffsetX, pixelOffsetY };
}

export function applyAlignmentCorrectionForward({
  datasetId,
  lat,
  lon,
  zoom,
}: AlignmentRequest): AlignmentResult {
  const correction = getAlignmentCorrection(datasetId);
  const { latOffset, lonOffset, pixelOffsetX, pixelOffsetY } = resolveDynamicOffsets(
    correction,
    lat,
    zoom
  );

  const latScale = correction?.lat_scale ?? 1;
  const lonScale = correction?.lon_scale ?? 1;

  return {
    lat: lat * latScale + latOffset,
    lon: lon * lonScale + lonOffset,
    pixelOffsetX,
    pixelOffsetY,
  };
}

export function applyAlignmentCorrectionInverse({
  datasetId,
  lat,
  lon,
  zoom,
}: AlignmentRequest): AlignmentResult {
  const correction = getAlignmentCorrection(datasetId);
  const { latOffset, lonOffset, pixelOffsetX, pixelOffsetY } = resolveDynamicOffsets(
    correction,
    lat,
    zoom
  );

  const latScale = correction?.lat_scale ?? 1;
  const lonScale = correction?.lon_scale ?? 1;

  return {
    lat: (lat - latOffset) / (latScale || 1),
    lon: (lon - lonOffset) / (lonScale || 1),
    pixelOffsetX: -pixelOffsetX,
    pixelOffsetY: -pixelOffsetY,
  };
}

