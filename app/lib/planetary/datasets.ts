import { PlanetaryBodyKey } from "./constants";
import { LongitudeConvention } from "./geodesy";

export type DatasetKind = "base" | "overlay" | "hires" | "elevation" | "temporal";

export interface TemporalRange {
  start: string;
  end: string;
  intervalIso: string;
  format: string;
}

export interface DatasetProjectionMetadata {
  type: "simple-cylindrical";
  centralMeridianDeg: number;
  primeMeridianOffsetDeg: number;
  lonConvention: LongitudeConvention;
  radiusMeters?: number;
}

export interface DatasetTilingMetadata {
  scheme: "wmts" | "xyz";
  yAxis: "north-down" | "south-up";
  tileSize: number;
  minZoom: number;
  maxZoom: number;
}

export interface DatasetMetadata {
  id: string;
  body: PlanetaryBodyKey;
  title: string;
  kind: DatasetKind;
  template: string;
  compatibilityKey: string;
  projection: DatasetProjectionMetadata;
  tiling: DatasetTilingMetadata;
  attribution?: string;
  revision?: string;
  default?: boolean;
  tags?: string[];
  overlayGroup?: "hires" | "elevation" | "science";
  temporal?: TemporalRange;
}

const TREK_COMPAT_KEY = (body: PlanetaryBodyKey) => `${body}-simplecyl-256`;

export const SOLAR_SYSTEM_DATASETS: DatasetMetadata[] = [
  // Moon
  {
    id: "moon:lro_wac_global",
    body: "moon",
    title: "LRO WAC Global Mosaic",
    kind: "base",
    template: "https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{row}/{col}.jpg",
    compatibilityKey: TREK_COMPAT_KEY("moon"),
    projection: {
      type: "simple-cylindrical",
      centralMeridianDeg: 0,
      primeMeridianOffsetDeg: 0,
      lonConvention: "east-360",
    },
    tiling: {
      scheme: "wmts",
      yAxis: "north-down",
      tileSize: 256,
      minZoom: 0,
      maxZoom: 6,
    },
    default: true,
    tags: ["global", "albedo"],
  },
  {
    id: "moon:lro_nac_apollo",
    body: "moon",
    title: "LRO NAC Apollo Landing Sites",
    kind: "hires",
    overlayGroup: "hires",
    template: "https://trek.nasa.gov/tiles/Moon/EQ/LRO_NAC_ApolloLandingSites_100cm/1.0.0/default/default028mm/{z}/{row}/{col}.jpg",
    compatibilityKey: TREK_COMPAT_KEY("moon"),
    projection: {
      type: "simple-cylindrical",
      centralMeridianDeg: 0,
      primeMeridianOffsetDeg: 0,
      lonConvention: "east-360",
    },
    tiling: {
      scheme: "wmts",
      yAxis: "north-down",
      tileSize: 256,
      minZoom: 2,
      maxZoom: 12,
    },
    tags: ["apollo", "hires"],
  },
  {
    id: "moon:lro_lola_elevation",
    body: "moon",
    title: "LRO LOLA Elevation (Colorized)",
    kind: "elevation",
    overlayGroup: "elevation",
    template: "https://trek.nasa.gov/tiles/Moon/EQ/LRO_LOLA_ClrShade_Global_128ppd_v04/1.0.0/default/default028mm/{z}/{row}/{col}.png",
    compatibilityKey: TREK_COMPAT_KEY("moon"),
    projection: {
      type: "simple-cylindrical",
      centralMeridianDeg: 0,
      primeMeridianOffsetDeg: 0,
      lonConvention: "east-360",
    },
    tiling: {
      scheme: "wmts",
      yAxis: "north-down",
      tileSize: 256,
      minZoom: 0,
      maxZoom: 9,
    },
    tags: ["elevation", "lola"],
  },
  {
    id: "moon:lro_diviner_rock",
    body: "moon",
    title: "LRO Diviner Rock Abundance",
    kind: "overlay",
    overlayGroup: "science",
    template: "https://trek.nasa.gov/tiles/Moon/EQ/LRO_Diviner_Derived_RockAbundance_Global_128ppd_v01/1.0.0/default/default028mm/{z}/{row}/{col}.png",
    compatibilityKey: TREK_COMPAT_KEY("moon"),
    projection: {
      type: "simple-cylindrical",
      centralMeridianDeg: 0,
      primeMeridianOffsetDeg: 0,
      lonConvention: "east-360",
    },
    tiling: {
      scheme: "wmts",
      yAxis: "north-down",
      tileSize: 256,
      minZoom: 0,
      maxZoom: 8,
    },
  },
  {
    id: "moon:grail_gravity",
    body: "moon",
    title: "GRAIL Free-air Gravity",
    kind: "overlay",
    overlayGroup: "science",
    template: "https://trek.nasa.gov/tiles/Moon/EQ/GRAIL_LGRS_Freair_Gravity_Global_128ppd_v03/1.0.0/default/default028mm/{z}/{row}/{col}.png",
    compatibilityKey: TREK_COMPAT_KEY("moon"),
    projection: {
      type: "simple-cylindrical",
      centralMeridianDeg: 0,
      primeMeridianOffsetDeg: 0,
      lonConvention: "east-360",
    },
    tiling: {
      scheme: "wmts",
      yAxis: "north-down",
      tileSize: 256,
      minZoom: 0,
      maxZoom: 8,
    },
  },

  // Mars
  {
    id: "mars:mars_mgs_mola",
    body: "mars",
    title: "MGS MOLA Colorized Shaded Relief",
    kind: "base",
    template: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/{z}/{row}/{col}.jpg",
    compatibilityKey: TREK_COMPAT_KEY("mars"),
    projection: {
      type: "simple-cylindrical",
      centralMeridianDeg: 0,
      primeMeridianOffsetDeg: 0,
      lonConvention: "east-360",
    },
    tiling: {
      scheme: "wmts",
      yAxis: "north-down",
      tileSize: 256,
      minZoom: 0,
      maxZoom: 8,
    },
    default: true,
  },
  {
    id: "mars:mars_viking_mosaic",
    body: "mars",
    title: "Viking MDIM 2.1 Global Mosaic",
    kind: "base",
    template: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{row}/{col}.jpg",
    compatibilityKey: TREK_COMPAT_KEY("mars"),
    projection: {
      type: "simple-cylindrical",
      centralMeridianDeg: 0,
      primeMeridianOffsetDeg: 0,
      lonConvention: "east-360",
    },
    tiling: {
      scheme: "wmts",
      yAxis: "north-down",
      tileSize: 256,
      minZoom: 0,
      maxZoom: 8,
    },
  },
  {
    id: "mars:mars_hirise",
    body: "mars",
    title: "HiRISE High Resolution Imagery",
    kind: "hires",
    overlayGroup: "hires",
    template: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_HiRISE_Mosaic_Global_256ppd/1.0.0/default/default028mm/{z}/{row}/{col}.jpg",
    compatibilityKey: TREK_COMPAT_KEY("mars"),
    projection: {
      type: "simple-cylindrical",
      centralMeridianDeg: 0,
      primeMeridianOffsetDeg: 0,
      lonConvention: "east-360",
    },
    tiling: {
      scheme: "wmts",
      yAxis: "north-down",
      tileSize: 256,
      minZoom: 0,
      maxZoom: 12,
    },
  },
  {
    id: "mars:mars_ctx_mosaic",
    body: "mars",
    title: "MRO CTX Global Mosaic",
    kind: "overlay",
    overlayGroup: "science",
    template: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_MRO_CTX_mosaic_beta01_200ppd/1.0.0/default/default028mm/{z}/{row}/{col}.jpg",
    compatibilityKey: TREK_COMPAT_KEY("mars"),
    projection: {
      type: "simple-cylindrical",
      centralMeridianDeg: 0,
      primeMeridianOffsetDeg: 0,
      lonConvention: "east-360",
    },
    tiling: {
      scheme: "wmts",
      yAxis: "north-down",
      tileSize: 256,
      minZoom: 0,
      maxZoom: 9,
    },
  },
  {
    id: "mars:mars_thermal_inertia",
    body: "mars",
    title: "TES Thermal Inertia",
    kind: "overlay",
    overlayGroup: "science",
    template: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_TES_ThermalInertia_mosaic_global_32ppd_v02/1.0.0/default/default028mm/{z}/{row}/{col}.png",
    compatibilityKey: TREK_COMPAT_KEY("mars"),
    projection: {
      type: "simple-cylindrical",
      centralMeridianDeg: 0,
      primeMeridianOffsetDeg: 0,
      lonConvention: "east-360",
    },
    tiling: {
      scheme: "wmts",
      yAxis: "north-down",
      tileSize: 256,
      minZoom: 0,
      maxZoom: 7,
    },
  },

  // Mercury
  {
    id: "mercury:messenger_mdis_basemap",
    body: "mercury",
    title: "MESSENGER MDIS Basemap",
    kind: "base",
    template: "https://trek.nasa.gov/tiles/Mercury/EQ/Mercury_MESSENGER_MDIS_Basemap_EnhancedColor_Mosaic_Global_665m/1.0.0/default/default028mm/{z}/{row}/{col}.jpg",
    compatibilityKey: TREK_COMPAT_KEY("mercury"),
    projection: {
      type: "simple-cylindrical",
      centralMeridianDeg: 0,
      primeMeridianOffsetDeg: 0,
      lonConvention: "east-360",
    },
    tiling: {
      scheme: "wmts",
      yAxis: "north-down",
      tileSize: 256,
      minZoom: 1,
      maxZoom: 7,
    },
    default: true,
  },
  {
    id: "mercury:messenger_global_mosaic",
    body: "mercury",
    title: "MESSENGER Global Mosaic",
    kind: "base",
    template: "https://trek.nasa.gov/tiles/Mercury/EQ/MESSENGER_MDIS_Mosaic_Global_166m_v02/1.0.0/default/default028mm/{z}/{row}/{col}.jpg",
    compatibilityKey: TREK_COMPAT_KEY("mercury"),
    projection: {
      type: "simple-cylindrical",
      centralMeridianDeg: 0,
      primeMeridianOffsetDeg: 0,
      lonConvention: "east-360",
    },
    tiling: {
      scheme: "wmts",
      yAxis: "north-down",
      tileSize: 256,
      minZoom: 1,
      maxZoom: 8,
    },
  },
  {
    id: "mercury:messenger_bdr",
    body: "mercury",
    title: "MESSENGER BDR Mosaic",
    kind: "overlay",
    overlayGroup: "hires",
    template: "https://trek.nasa.gov/tiles/Mercury/EQ/MESSENGER_MDIS_BDR_Mosaic_Global_166m_v01/1.0.0/default/default028mm/{z}/{row}/{col}.jpg",
    compatibilityKey: TREK_COMPAT_KEY("mercury"),
    projection: {
      type: "simple-cylindrical",
      centralMeridianDeg: 0,
      primeMeridianOffsetDeg: 0,
      lonConvention: "east-360",
    },
    tiling: {
      scheme: "wmts",
      yAxis: "north-down",
      tileSize: 256,
      minZoom: 1,
      maxZoom: 8,
    },
  },
  {
    id: "mercury:messenger_elevation",
    body: "mercury",
    title: "MLA Elevation Model",
    kind: "elevation",
    overlayGroup: "elevation",
    template: "https://trek.nasa.gov/tiles/Mercury/EQ/MESSENGER_MLA_DEM_Global_665m_v01/1.0.0/default/default028mm/{z}/{row}/{col}.png",
    compatibilityKey: TREK_COMPAT_KEY("mercury"),
    projection: {
      type: "simple-cylindrical",
      centralMeridianDeg: 0,
      primeMeridianOffsetDeg: 0,
      lonConvention: "east-360",
    },
    tiling: {
      scheme: "wmts",
      yAxis: "north-down",
      tileSize: 256,
      minZoom: 1,
      maxZoom: 7,
    },
  },
  {
    id: "mercury:messenger_slope",
    body: "mercury",
    title: "MLA Slope Map",
    kind: "overlay",
    overlayGroup: "science",
    template: "https://trek.nasa.gov/tiles/Mercury/EQ/MESSENGER_MLA_Slopes_Global_665m_v01/1.0.0/default/default028mm/{z}/{row}/{col}.png",
    compatibilityKey: TREK_COMPAT_KEY("mercury"),
    projection: {
      type: "simple-cylindrical",
      centralMeridianDeg: 0,
      primeMeridianOffsetDeg: 0,
      lonConvention: "east-360",
    },
    tiling: {
      scheme: "wmts",
      yAxis: "north-down",
      tileSize: 256,
      minZoom: 1,
      maxZoom: 7,
    },
  },
];

export function getDatasetsForBody(body: PlanetaryBodyKey): DatasetMetadata[] {
  return SOLAR_SYSTEM_DATASETS.filter((dataset) => dataset.body === body);
}

export function getDatasetById(id: string): DatasetMetadata | undefined {
  return SOLAR_SYSTEM_DATASETS.find((dataset) => dataset.id === id);
}

export function getDefaultDatasetForBody(body: PlanetaryBodyKey): DatasetMetadata | undefined {
  return SOLAR_SYSTEM_DATASETS.find((dataset) => dataset.body === body && dataset.default);
}

export function getDatasetsByKind(body: PlanetaryBodyKey, kind: DatasetKind): DatasetMetadata[] {
  return SOLAR_SYSTEM_DATASETS.filter((dataset) => dataset.body === body && dataset.kind === kind);
}

export function areDatasetsCompatible(primaryId: string, secondaryId: string): boolean {
  const primary = getDatasetById(primaryId);
  const secondary = getDatasetById(secondaryId);
  if (!primary || !secondary) return false;
  return primary.compatibilityKey === secondary.compatibilityKey;
}

