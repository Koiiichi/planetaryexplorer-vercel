export type LongitudeDirection = "east" | "west";
export type LongitudeDomain = "180" | "360";

export interface LongitudeConvention {
  direction?: LongitudeDirection;
  domain?: LongitudeDomain;
}

const DEFAULT_CONVENTION: Required<LongitudeConvention> = {
  direction: "east",
  domain: "360",
};

export function wrapLongitude360(value: number): number {
  if (!Number.isFinite(value)) return value;
  return ((value % 360) + 360) % 360;
}

export function wrapLongitude180(value: number): number {
  if (!Number.isFinite(value)) return value;
  return ((value + 180) % 360 + 360) % 360 - 180;
}

export function normalizeLongitude(
  value: number,
  convention: LongitudeConvention = DEFAULT_CONVENTION
): number {
  if (!Number.isFinite(value)) return value;
  const { direction, domain } = {
    ...DEFAULT_CONVENTION,
    ...convention,
  } as Required<LongitudeConvention>;

  let lon = value;

  if (domain === "360") {
    lon = wrapLongitude360(lon);
  } else {
    lon = wrapLongitude180(lon);
  }

  if (direction === "west") {
    if (domain === "360") {
      lon = wrapLongitude360(360 - lon);
    } else {
      lon = -lon;
    }
  }

  return wrapLongitude180(lon);
}

export function denormalizeLongitude(
  canonicalValue: number,
  convention: LongitudeConvention = DEFAULT_CONVENTION
): number {
  if (!Number.isFinite(canonicalValue)) return canonicalValue;
  const { direction, domain } = {
    ...DEFAULT_CONVENTION,
    ...convention,
  } as Required<LongitudeConvention>;

  let lon = wrapLongitude180(canonicalValue);

  if (direction === "west") {
    lon = -lon;
  }

  if (domain === "360") {
    lon = wrapLongitude360(lon);
  } else {
    lon = wrapLongitude180(lon);
  }

  return lon;
}

export function canonicalToDisplay(
  canonicalValue: number,
  mode: "east-360" | "east-180"
): number {
  const lon = wrapLongitude180(canonicalValue);
  if (mode === "east-360") {
    return wrapLongitude360(lon + 180);
  }
  return lon;
}

export function formatLongitude(
  canonicalValue: number,
  mode: "east-360" | "east-180" = "east-180"
): string {
  const lon = canonicalToDisplay(canonicalValue, mode);
  const suffix = mode === "east-360" ? "°E" : lon < 0 ? "°W" : "°E";
  const absValue = mode === "east-360" ? lon : Math.abs(lon);
  return `${absValue.toFixed(0)}${suffix}`;
}
