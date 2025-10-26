export type BodyKey =
  | "earth"
  | "milky_way"
  | "moon"
  | "mars"
  | "mercury"
  | "ceres"
  | "vesta"
  | "unknown";

export type LonConvention = "EAST_180" | "EAST_360";

export interface BodyProjectionMetadata {
  key: BodyKey;
  displayName: string;
  radiusKm: number;
  nativeLonConvention: LonConvention;
  centralMeridian: number;
  notes?: string;
}

export interface AlignmentCorrection {
  pixelOffset?: { x: number; y: number };
}

const BODY_METADATA: Record<BodyKey, BodyProjectionMetadata> = {
  earth: {
    key: "earth",
    displayName: "Earth",
    radiusKm: 6371,
    nativeLonConvention: "EAST_180",
    centralMeridian: 0,
    notes: "WGS84 geographic (used for reference only)",
  },
  milky_way: {
    key: "milky_way",
    displayName: "Milky Way",
    radiusKm: 1,
    nativeLonConvention: "EAST_180",
    centralMeridian: 0,
    notes: "Placeholder – treated as equirectangular imagery",
  },
  moon: {
    key: "moon",
    displayName: "Moon",
    radiusKm: 1737.4,
    nativeLonConvention: "EAST_360",
    centralMeridian: 0,
    notes: "IAU 2018 simple cylindrical (0–360°E)",
  },
  mars: {
    key: "mars",
    displayName: "Mars",
    radiusKm: 3389.5,
    nativeLonConvention: "EAST_360",
    centralMeridian: 0,
    notes: "IAU 2000 simple cylindrical (0–360°E)",
  },
  mercury: {
    key: "mercury",
    displayName: "Mercury",
    radiusKm: 2439.7,
    nativeLonConvention: "EAST_360",
    centralMeridian: 0,
    notes: "MESSENGER simple cylindrical (0–360°E)",
  },
  ceres: {
    key: "ceres",
    displayName: "Ceres",
    radiusKm: 469.7,
    nativeLonConvention: "EAST_360",
    centralMeridian: 0,
  },
  vesta: {
    key: "vesta",
    displayName: "Vesta",
    radiusKm: 262.7,
    nativeLonConvention: "EAST_360",
    centralMeridian: 0,
  },
  unknown: {
    key: "unknown",
    displayName: "Unknown",
    radiusKm: 1,
    nativeLonConvention: "EAST_180",
    centralMeridian: 0,
  },
};

export const DEFAULT_ALIGNMENT_CORRECTIONS: Readonly<Record<string, AlignmentCorrection>> = {
  // Placeholders for future calibration. Keys can be full layer ids or `body:<name>`.
  "body:moon": { pixelOffset: { x: 0, y: 0 } },
  "body:mars": { pixelOffset: { x: 0, y: 0 } },
  "body:mercury": { pixelOffset: { x: 0, y: 0 } },
};

const CORRECTION_STORAGE_KEY = "planetary-explorer:alignment-corrections";

export function getBodyProjectionMetadata(body: BodyKey): BodyProjectionMetadata {
  return BODY_METADATA[body] ?? BODY_METADATA.unknown;
}

export function wrapCanonicalLongitude(lon: number): number {
  return ((lon + 180) % 360 + 360) % 360 - 180;
}

export function normalizeLatitude(lat: number): number {
  if (!Number.isFinite(lat)) return 0;
  return Math.max(-90, Math.min(90, lat));
}

export function normalizeLongitude(lon: number, convention: LonConvention): number {
  if (!Number.isFinite(lon)) return 0;
  if (convention === "EAST_360") {
    return ((lon % 360) + 360) % 360;
  }
  return wrapCanonicalLongitude(lon);
}

export function toCanonicalLongitude(lon: number, from: LonConvention): number {
  if (from === "EAST_360") {
    const normalized = normalizeLongitude(lon, "EAST_360");
    return normalized > 180 ? normalized - 360 : normalized;
  }
  return wrapCanonicalLongitude(lon);
}

export function fromCanonicalLongitude(lon: number, to: LonConvention): number {
  const canonical = wrapCanonicalLongitude(lon);
  if (to === "EAST_360") {
    return ((canonical % 360) + 360) % 360;
  }
  return canonical;
}

export function convertLongitude(lon: number, from: LonConvention, to: LonConvention): number {
  const canonical = toCanonicalLongitude(lon, from);
  return fromCanonicalLongitude(canonical, to);
}

export function inferLongitudeConvention(lon: number): LonConvention {
  if (!Number.isFinite(lon)) {
    return "EAST_180";
  }
  if (lon > 180 || lon < -180) {
    return "EAST_360";
  }
  return "EAST_180";
}

export function formatLatitude(lat: number, decimals = 2): string {
  const clamped = normalizeLatitude(lat);
  const suffix = clamped >= 0 ? "°N" : "°S";
  return `${Math.abs(clamped).toFixed(decimals)}${suffix}`;
}

export function formatLongitude(
  lon: number,
  options: { convention: LonConvention; decimals?: number } = { convention: "EAST_180" }
): string {
  const { convention, decimals = 2 } = options;
  const canonical = wrapCanonicalLongitude(lon);
  if (convention === "EAST_360") {
    const east = fromCanonicalLongitude(canonical, "EAST_360");
    return `${east.toFixed(decimals)}°E`;
  }
  const normalized = fromCanonicalLongitude(canonical, "EAST_180");
  const suffix = normalized >= 0 ? "°E" : "°W";
  return `${Math.abs(normalized).toFixed(decimals)}${suffix}`;
}

export function lonLatToImagePoint(
  lon: number,
  lat: number,
  body: BodyKey,
  dims: { width: number; height: number },
  options: { sourceConvention?: LonConvention; correction?: AlignmentCorrection | null } = {}
): { x: number; y: number } {
  const { sourceConvention = "EAST_180", correction } = options;
  const metadata = getBodyProjectionMetadata(body);

  const canonicalLon = toCanonicalLongitude(lon, sourceConvention);
  const adjustedLon = wrapCanonicalLongitude(canonicalLon - metadata.centralMeridian);
  const lonForImage = fromCanonicalLongitude(adjustedLon, metadata.nativeLonConvention);

  const latCanonical = normalizeLatitude(lat);

  let xNormalized: number;
  if (metadata.nativeLonConvention === "EAST_360") {
    xNormalized = normalizeLongitude(lonForImage, "EAST_360") / 360;
  } else {
    xNormalized = (normalizeLongitude(lonForImage, "EAST_180") + 180) / 360;
  }
  xNormalized = ((xNormalized % 1) + 1) % 1;

  const yNormalized = (90 - latCanonical) / 180;

  let x = xNormalized * dims.width;
  let y = yNormalized * dims.height;

  if (correction?.pixelOffset) {
    x += correction.pixelOffset.x;
    y += correction.pixelOffset.y;
  }

  return { x, y };
}

export function loadStoredCorrections(): Record<string, AlignmentCorrection> {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(CORRECTION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, AlignmentCorrection>;
    return parsed ?? {};
  } catch (err) {
    console.warn("Failed to load alignment corrections from storage", err);
    return {};
  }
}

export function saveStoredCorrections(map: Record<string, AlignmentCorrection>): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(CORRECTION_STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn("Failed to persist alignment corrections", err);
  }
}

export function getAlignmentCorrectionForLayer(
  layerId: string | null | undefined,
  body: BodyKey,
  corrections: Record<string, AlignmentCorrection>
): AlignmentCorrection | null {
  if (!corrections) return null;
  if (layerId && corrections[layerId]) {
    return corrections[layerId];
  }
  const bodyKey = `body:${body}`;
  if (corrections[bodyKey]) {
    return corrections[bodyKey];
  }
  return null;
}

