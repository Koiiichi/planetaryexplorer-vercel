export type PlanetaryBodyKey =
  | "moon"
  | "mars"
  | "mercury"
  | "ceres"
  | "vesta";

export type LongitudeDirection = "east" | "west";
export type LongitudeDomain = 180 | 360;

export interface PlanetaryBodyDefinition {
  id: PlanetaryBodyKey;
  name: string;
  meanRadiusMeters: number;
  flattening: number;
  primeMeridianOffsetDeg: number;
  defaultLongitudeDirection: LongitudeDirection;
  defaultLongitudeDomain: LongitudeDomain;
}

export const PLANETARY_BODIES: Record<PlanetaryBodyKey, PlanetaryBodyDefinition> = {
  moon: {
    id: "moon",
    name: "Moon",
    meanRadiusMeters: 1737400, // IAU 2018 mean radius
    flattening: 0,
    primeMeridianOffsetDeg: 0,
    defaultLongitudeDirection: "east",
    defaultLongitudeDomain: 360,
  },
  mars: {
    id: "mars",
    name: "Mars",
    meanRadiusMeters: 3389500,
    flattening: 0,
    primeMeridianOffsetDeg: 0,
    defaultLongitudeDirection: "east",
    defaultLongitudeDomain: 360,
  },
  mercury: {
    id: "mercury",
    name: "Mercury",
    meanRadiusMeters: 2439700,
    flattening: 0,
    primeMeridianOffsetDeg: 0,
    defaultLongitudeDirection: "east",
    defaultLongitudeDomain: 360,
  },
  ceres: {
    id: "ceres",
    name: "Ceres",
    meanRadiusMeters: 473000,
    flattening: 0,
    primeMeridianOffsetDeg: 0,
    defaultLongitudeDirection: "east",
    defaultLongitudeDomain: 360,
  },
  vesta: {
    id: "vesta",
    name: "Vesta",
    meanRadiusMeters: 262700,
    flattening: 0,
    primeMeridianOffsetDeg: 0,
    defaultLongitudeDirection: "east",
    defaultLongitudeDomain: 360,
  },
};

export function getPlanetaryBodyDefinition(body: PlanetaryBodyKey): PlanetaryBodyDefinition {
  return PLANETARY_BODIES[body];
}

