// app/components/TileViewer.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
// @ts-ignore - @mapbox/togeojson doesn't have types
import toGeoJSON from "@mapbox/togeojson";
import type { FeatureCollection, Point } from "geojson";
import InfoPanel from './InfoPanel';
import {
  canonicalToDisplay,
  normalizeLongitude,
  wrapLongitude180,
  formatLongitude,
} from "../lib/coordinates";

type BodyKey =
  | "earth"
  | "milky_way"
  | "moon"
  | "mars"
  | "mercury"
  | "ceres"
  | "vesta"
  | "unknown";

type DatasetListItem = {
  id: string;
  title: string;
  body?: string | null;
};

type ViewerConfigResponse = {
  id: string;
  title: string;
  tile_url_template: string;
  min_zoom: number;
  max_zoom: number;
  tile_size: number;
  projection?: string | null;
  attribution?: string | null;
  body?: string | null;
};

type PlanetFeature = {
  name: string;
  lat: number;
  lon: number;
  diamkm?: number;
};

type LongitudeDebugMode = "east-180" | "east-360";

type LongitudeConvention = {
  direction: "east" | "west";
  domain: "180" | "360";
};

const BODY_LONGITUDE_CONVENTIONS: Record<BodyKey, LongitudeConvention> = {
  earth: { direction: "east", domain: "360" },
  milky_way: { direction: "east", domain: "360" },
  moon: { direction: "east", domain: "360" },
  mars: { direction: "east", domain: "360" },
  mercury: { direction: "east", domain: "360" },
  ceres: { direction: "east", domain: "360" },
  vesta: { direction: "east", domain: "360" },
  unknown: { direction: "east", domain: "360" },
};

const BODY_RADII_KM: Record<BodyKey, number> = {
  earth: 6371,
  milky_way: 6371,
  moon: 1737.4,
  mars: 3389.5,
  mercury: 2439.7,
  ceres: 469.7,
  vesta: 262.7,
  unknown: 6371,
};

const REFERENCE_FEATURES: Record<BodyKey, Array<{ name: string; lat: number; lon: number }>> = {
  earth: [],
  milky_way: [],
  moon: [
    { name: "Tycho", lat: -43.31, lon: -11.36 },
    { name: "Copernicus", lat: 9.62, lon: -20.08 },
    { name: "Clavius", lat: -58.76, lon: -14.62 },
  ],
  mars: [
    { name: "Olympus Mons", lat: 18.65, lon: normalizeLongitude(-134, { direction: "east", domain: "180" }) },
    { name: "Valles Marineris", lat: -14.6, lon: normalizeLongitude(-75, { direction: "east", domain: "180" }) },
    { name: "Gale Crater", lat: -5.4, lon: normalizeLongitude(137.8, { direction: "east", domain: "180" }) },
  ],
  mercury: [
    { name: "Caloris Planitia", lat: 30.0, lon: normalizeLongitude(-160, { direction: "east", domain: "180" }) },
    { name: "Rembrandt", lat: -33.0, lon: normalizeLongitude(-87.0, { direction: "east", domain: "180" }) },
    { name: "Rachmaninoff", lat: 27.0, lon: normalizeLongitude(-57.0, { direction: "east", domain: "180" }) },
  ],
  ceres: [],
  vesta: [],
  unknown: [],
};

// --- local TREK templates (fallback / examples) ----------------------
type TemporalRange = {
  start: string;
  end: string;
  interval: string; // ISO 8601 duration (P1D = daily, P1M = monthly)
  format: string;   // date format for URL substitution
};

const TREK_TEMPLATES: Record<
  BodyKey,
  Array<{ id: string; title: string; template: string; example?: string; type?: "base" | "overlay" | "temporal"; temporalRange?: TemporalRange }>
> = {
  // Earth layers - NASA and reliable sources
  earth: [
    {
      id: "openstreetmap",
      title: "OpenStreetMap",
      template: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      type: "base"
    },
    {
      id: "satellite_arcgis",
      title: "ArcGIS World Imagery",
      template: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      type: "base"
    },
    {
      id: "modis_terra_temporal",
      title: "MODIS Terra True Color (temporal)",
      template: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg",
      type: "temporal",
      temporalRange: {
        start: "2000-02-24",
        end: new Date().toISOString().split('T')[0],
        interval: "P1D",
        format: "YYYY-MM-DD"
      }
    },
    {
      id: "modis_aqua_temporal", 
      title: "MODIS Aqua True Color (temporal)",
      template: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Aqua_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg",
      type: "temporal",
      temporalRange: {
        start: "2002-07-04",
        end: new Date().toISOString().split('T')[0],
        interval: "P1D",
        format: "YYYY-MM-DD"
      }
    },
    {
      id: "terrain_arcgis",
      title: "ArcGIS Terrain",
      template: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}",
      type: "base"
    }
  ],
  moon: [
    {
      id: "lro_wac_global",
      title: "LRO WAC Global Mosaic",
      template: "https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{row}/{col}.jpg",
      type: "base",
    },
    {
      id: "lro_nac_apollo",
      title: "LRO NAC Apollo Landing Sites",
      template: "https://trek.nasa.gov/tiles/Moon/EQ/LRO_NAC_ApolloLandingSites_100cm/1.0.0/default/default028mm/{z}/{row}/{col}.jpg",
      type: "base",
    },
    {
      id: "lro_lola_elevation",
      title: "LRO LOLA Colorized Elevation",
      template: "https://trek.nasa.gov/tiles/Moon/EQ/LRO_LOLA_ClrShade_Global_128ppd_v04/1.0.0/default/default028mm/{z}/{row}/{col}.png",
      type: "overlay",
    },
    {
      id: "lro_diviner_rock",
      title: "LRO Diviner Rock Abundance",
      template: "https://trek.nasa.gov/tiles/Moon/EQ/LRO_Diviner_Derived_RockAbundance_Global_128ppd_v01/1.0.0/default/default028mm/{z}/{row}/{col}.png",
      type: "overlay",
    },
    {
      id: "grail_gravity",
      title: "GRAIL Gravity Field",
      template: "https://trek.nasa.gov/tiles/Moon/EQ/GRAIL_LGRS_Freair_Gravity_Global_128ppd_v03/1.0.0/default/default028mm/{z}/{row}/{col}.png",
      type: "overlay",
    },
  ],
  mars: [
    {
      id: "mars_mgs_mola",
      title: "Mars MGS MOLA Colorized Shaded Relief",
      template: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/{z}/{row}/{col}.jpg",
      type: "base",
    },
    {
      id: "mars_viking_mosaic",
      title: "Mars Viking MDIM 2.1 Global Mosaic",
      template: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{row}/{col}.jpg",
      type: "base",
    },
    {
      id: "mars_hirise",
      title: "Mars HiRISE High Resolution Imagery",
      template: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_HiRISE_Mosaic_Global_256ppd/1.0.0/default/default028mm/{z}/{row}/{col}.jpg",
      type: "overlay",
    },
    {
      id: "mars_ctx_mosaic",
      title: "Mars CTX Global Mosaic",
      template: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_MRO_CTX_mosaic_beta01_200ppd/1.0.0/default/default028mm/{z}/{row}/{col}.jpg",
      type: "overlay",
    },
    {
      id: "mars_thermal_inertia",
      title: "Mars TES Thermal Inertia",
      template: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_TES_ThermalInertia_mosaic_global_32ppd_v02/1.0.0/default/default028mm/{z}/{row}/{col}.png",
      type: "overlay",
    },
  ],
  mercury: [
    {
      id: "messenger_mdis_basemap",
      title: "MESSENGER MDIS Basemap",
      template: "https://trek.nasa.gov/tiles/Mercury/EQ/Mercury_MESSENGER_MDIS_Basemap_EnhancedColor_Mosaic_Global_665m/1.0.0/default/default028mm/{z}/{row}/{col}.jpg",
      type: "base",
    },
    {
      id: "messenger_global_mosaic",
      title: "MESSENGER Global Mosaic",
      template: "https://trek.nasa.gov/tiles/Mercury/EQ/MESSENGER_MDIS_Mosaic_Global_166m_v02/1.0.0/default/default028mm/{z}/{row}/{col}.jpg",
      type: "base",
    },
    {
      id: "messenger_bdr",
      title: "MESSENGER BDR Mosaic",
      template: "https://trek.nasa.gov/tiles/Mercury/EQ/MESSENGER_MDIS_BDR_Mosaic_Global_166m_v01/1.0.0/default/default028mm/{z}/{row}/{col}.jpg",
      type: "base",
    },
    {
      id: "messenger_elevation",
      title: "MLA Elevation Model",
      template: "https://trek.nasa.gov/tiles/Mercury/EQ/MESSENGER_MLA_DEM_Global_665m_v01/1.0.0/default/default028mm/{z}/{row}/{col}.png",
      type: "overlay",
    },
    {
      id: "messenger_slope",
      title: "MLA Slope Map",
      template: "https://trek.nasa.gov/tiles/Mercury/EQ/MESSENGER_MLA_Slopes_Global_665m_v01/1.0.0/default/default028mm/{z}/{row}/{col}.png",
      type: "overlay",
    },
  ],
  ceres: [
    {
      id: "ceres_dawn_hamo",
      title: "Ceres Dawn FC HAMO",
      template: "https://trek.nasa.gov/tiles/Ceres/EQ/Ceres_Dawn_FC_HAMO_ClrShade_DLR_Global_60ppd_Oct2016/1.0.0/default/default028mm/{z}/{row}/{col}.jpg",
      type: "base",
    },
    {
      id: "ceres_dawn_lamo",
      title: "Ceres Dawn FC LAMO",
      template: "https://trek.nasa.gov/tiles/Ceres/EQ/Ceres_Dawn_FC_LAMO_ClrShade_DLR_Global_60ppd_Oct2016/1.0.0/default/default028mm/{z}/{row}/{col}.jpg",
      type: "base",
    },
    {
      id: "ceres_elevation",
      title: "Ceres Dawn Elevation Model",
      template: "https://trek.nasa.gov/tiles/Ceres/EQ/Ceres_Dawn_HAMO_DEM_DLR_Global_60ppd_Oct2016/1.0.0/default/default028mm/{z}/{row}/{col}.png",
      type: "overlay",
    },
    {
      id: "ceres_gravity",
      title: "Ceres Gravity Field",
      template: "https://trek.nasa.gov/tiles/Ceres/EQ/Ceres_Dawn_Gravity_Global_665m_v01/1.0.0/default/default028mm/{z}/{row}/{col}.png",
      type: "overlay",
    },
  ],
  vesta: [
    {
      id: "vesta_dawn_hamo",
      title: "Vesta Dawn FC HAMO",
      template: "https://trek.nasa.gov/tiles/Vesta/EQ/Vesta_Dawn_FC_HAMO_ClrShade_DLR_Global_60ppd_Oct2016/1.0.0/default/default028mm/{z}/{row}/{col}.jpg",
      type: "base",
    },
    {
      id: "vesta_dawn_lamo",
      title: "Vesta Dawn FC LAMO",
      template: "https://trek.nasa.gov/tiles/Vesta/EQ/Vesta_Dawn_FC_LAMO_ClrShade_DLR_Global_60ppd_Oct2016/1.0.0/default/default028mm/{z}/{row}/{col}.jpg",
      type: "base",
    },
    {
      id: "vesta_elevation",
      title: "Vesta Dawn Elevation Model",
      template: "https://trek.nasa.gov/tiles/Vesta/EQ/Vesta_Dawn_HAMO_DEM_DLR_Global_60ppd_Oct2016/1.0.0/default/default028mm/{z}/{row}/{col}.png",
      type: "overlay",
    },
  ],
  milky_way: [],
  unknown: [],
};

// backend config
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";
const backendBase = backendUrl ? backendUrl.replace(/\/$/, "") : "";

// --- component -------------------------------------------------------
interface TileViewerProps {
  externalSearchQuery?: string;
  onSearchChange?: (search: string) => void;
  initialBody?: string;
  initialLat?: number;
  initialLon?: number;
  initialZoom?: number;
  hideUI?: boolean;
  selectedDataset?: string;
  splitViewEnabled?: boolean;
  splitLayerId?: string;
  osdToolbarVisible?: boolean;
  onFeatureSelected?: (feature: any) => void;
  projectionDebugEnabled?: boolean;
  longitudeDebugMode?: LongitudeDebugMode;
}

export default function TileViewer({
  externalSearchQuery,
  onSearchChange,
  initialBody,
  initialLat,
  initialLon,
  initialZoom,
  hideUI = false,
  selectedDataset,
  splitViewEnabled,
  splitLayerId,
  osdToolbarVisible,
  onFeatureSelected,
  projectionDebugEnabled = false,
  longitudeDebugMode = "east-180",
}: TileViewerProps) {
  // refs and viewer instances
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const compareViewerRef = useRef<HTMLDivElement | null>(null);
  const viewerObjRef = useRef<any | null>(null);
  const compareViewerObjRef = useRef<any | null>(null);
  const pulseOverlayRef = useRef<HTMLElement | null>(null);
  const debugOverlaysRef = useRef<{ grid?: HTMLElement; markers: HTMLElement[] }>({ markers: [] });
  // Track whether external body has been synced at least once
  // If we have an external body prop at mount, consider it already synced
  const hasExternalBodySynced = useRef<boolean>(initialBody !== undefined);

  // state
  const [isClient, setIsClient] = useState(false);
  const [datasets, setDatasets] = useState<DatasetListItem[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [layerConfig, setLayerConfig] = useState<ViewerConfigResponse | null>(null);
  const [selectedBody, setSelectedBody] = useState<BodyKey>(
    initialBody ? (initialBody as BodyKey) : "moon"
  ); // Initialize from prop or default to moon
  const [selectedOverlayId, setSelectedOverlayId] = useState<string>("");
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.5);
  const [viewMode, setViewMode] = useState<"single" | "split" | "overlay">("single");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [features, setFeatures] = useState<PlanetFeature[]>([]);
  
  // Sync split view mode with parent prop
  useEffect(() => {
    if (splitViewEnabled !== undefined) {
      setViewMode(splitViewEnabled ? "split" : "single");
      console.log('[TileViewer3] View mode changed:', splitViewEnabled ? "split" : "single");
    }
  }, [splitViewEnabled]);
  
  // Sync split layer selection with parent prop
  useEffect(() => {
    if (splitLayerId !== undefined) {
      setSelectedOverlayId(splitLayerId);
      console.log('[TileViewer3] Split layer changed:', splitLayerId);
    }
  }, [splitLayerId]);
  
  // Sync dataset selection with parent prop
  useEffect(() => {
    if (selectedDataset && selectedDataset !== "default") {
      // Dataset is in format "body:layerId", set it directly
      if (selectedDataset.includes(":")) {
        setSelectedLayerId(selectedDataset);
      } else {
        // Legacy format - try to infer body from current selection
        const fullId = `${selectedBody}:${selectedDataset}`;
        setSelectedLayerId(fullId);
      }
      console.log('[TileViewer3] Dataset changed:', selectedDataset);
    }
  }, [selectedDataset, selectedBody]);
  const [searchText, setSearchText] = useState<string>(externalSearchQuery ?? "");
  const [isSearching, setIsSearching] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<any>(null);
  const [searchProvider, setSearchProvider] = useState<string | undefined>();
  const [aiDescription, setAiDescription] = useState<string | undefined>();
  const [searchSuggestions, setSearchSuggestions] = useState<Array<{ name: string; body: string; category: string }>>([]);

  console.log('[TileViewer3 RENDER] initialBody:', initialBody, 'selectedBody:', selectedBody, 'selectedLayerId:', selectedLayerId, 'hasExternalBodySynced:', hasExternalBodySynced.current);

  // sync external search - including empty string to clear search
  useEffect(() => {
    if (externalSearchQuery !== undefined) {
      setSearchText(externalSearchQuery);
    }
  }, [externalSearchQuery]);

  // Enhanced search with backend AI integration
  useEffect(() => {
    if (searchText.trim() && searchText.length > 2) {
      const debounceTimer = setTimeout(async () => {
        setIsSearching(true);
        try {
          // Try backend AI search first
          await searchWithBackend(searchText.trim());
        } catch (error) {
          console.warn('Backend search failed, falling back to local search:', error);
          // Fallback to local search
          switch (selectedBody) {
            case "earth":
              searchEarthLocations(searchText.trim());
              break;
            case "moon":
              loadMoonGazetteer();
              break;
            case "mars":
              queryMarsCraterDB();
              break;
            case "mercury":
              loadMercuryGazetteer();
              break;
            case "ceres":
              loadCeresGazetteer();
              break;
            case "vesta":
              loadVestaGazetteer();
              break;
          }
        } finally {
          setIsSearching(false);
        }
      }, 500); // 500ms debounce
      
      return () => clearTimeout(debounceTimer);
    } else if (!searchText.trim()) {
      setFeatures([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, selectedBody]);

  // client-side detection to prevent hydration mismatch
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Handle initial navigation parameters from PhotoSphereGallery
  useEffect(() => {
    if (initialBody) {
      setSelectedBody(initialBody as BodyKey);
    }
  }, [initialBody]);

  // Clear selected layer when body changes and auto-select first available
  useEffect(() => {
    if (datasets.length > 0) {
      const currentBodyLayers = datasets.filter(d => d.body === selectedBody);
      if (currentBodyLayers.length > 0) {
        // If current layer is not for the selected body, clear it and select first available
        const currentLayer = datasets.find(d => d.id === selectedLayerId);
        if (!currentLayer || currentLayer.body !== selectedBody) {
          setSelectedLayerId(currentBodyLayers[0].id);
          setSelectedOverlayId("");
        }
      } else {
        // No layers for this body, clear selections
        setSelectedLayerId("");
        setSelectedOverlayId("");
      }
    }
  }, [selectedBody, datasets, selectedLayerId]);

  // load datasets list from backend if configured (optional)
  useEffect(() => {
    // Use TREK_TEMPLATES as primary source (fallback to backend if needed)
    if (true) { // Always use local templates for now
      // no backend configured — fallback to TREK_TEMPLATES as dataset list
      const fallback: DatasetListItem[] = [];
      (Object.keys(TREK_TEMPLATES) as BodyKey[]).forEach((body) => {
        TREK_TEMPLATES[body].forEach((d) => {
          fallback.push({ id: `${body}:${d.id}`, title: `${d.title}`, body });
        });
      });
      setDatasets(fallback);
      // Auto-select first layer for current body if none selected
      const currentBodyLayers = fallback.filter(d => d.body === selectedBody);
      if (currentBodyLayers.length > 0 && !selectedLayerId) {
        console.log(`Auto-selecting layer for ${selectedBody}:`, currentBodyLayers[0].id);
        setSelectedLayerId(currentBodyLayers[0].id);
      } else if (currentBodyLayers.length === 0) {
        console.warn(`No layers available for body: ${selectedBody}`);
        // If current body has no layers, fallback to first available body
        const anyLayers = fallback.filter(d => d.body && d.body !== selectedBody);
        if (anyLayers.length > 0) {
          console.log(`Falling back to first available body: ${anyLayers[0].body}`);
          setSelectedBody(anyLayers[0].body as BodyKey);
        }
      }
      return;
    }

    let mounted = true;
    (async function load() {
      try {
        const resp = await fetch(`${backendBase}/viewer/layers`);
        if (!mounted) return;
        if (!resp.ok) {
          console.warn("Failed to load datasets from backend:", resp.status);
          return;
        }
        const data = await resp.json();
        setDatasets(data);
        // Don't auto-select first dataset - let the selectedBody useEffect handle it
        // if (data.length > 0 && !selectedLayerId) setSelectedLayerId(data[0].id);
      } catch (err) {
        console.error("Error loading datasets:", err);
      }
    })();

    return () => { mounted = false; };
  }, [selectedLayerId, selectedBody]);

  // Load layer config (either from backend or from local TREK_TEMPLATES)
  useEffect(() => {
    console.log('[TileViewer3] Layer config loading - selectedLayerId:', selectedLayerId);
    let mounted = true;
    if (!selectedLayerId) {
      console.log('[TileViewer3] No selectedLayerId - clearing layer config');
      setLayerConfig(null);
      return;
    }

    (async () => {
      // If backend configured and selectedLayerId appears to be backend id, fetch it
      if (backendBase && !selectedLayerId.includes(":")) {
        try {
          const resp = await fetch(`${backendBase}/viewer/layers/${selectedLayerId}`);
          if (!mounted) return;
          if (!resp.ok) {
            console.warn("Failed to load layer config:", resp.status);
            setLayerConfig(null);
            return;
          }
          const cfg = await resp.json();
          setLayerConfig(cfg);
          // Don't override selectedBody from config - it's controlled externally
          // const body = (cfg.body || "unknown").toLowerCase() as BodyKey;
          // setSelectedBody(body);
          return;
        } catch (err) {
          console.error("Error loading layer config from backend:", err);
        }
      }

      // fallback: parse our TREK_TEMPLATES selection string `body:id` or id
      const [maybeBody, maybeId] = selectedLayerId.split(":");
      let foundTemplate;
      if (maybeId) {
        const bodyKey = (maybeBody as BodyKey) || "unknown";
        foundTemplate = TREK_TEMPLATES[bodyKey]?.find((t) => t.id === maybeId);
        if (foundTemplate) {
          console.log('[TileViewer3] Found TREK template:', selectedLayerId, 'for body:', bodyKey);
          // build a minimal layerConfig from template
          let tileTemplate = foundTemplate.template;
          
          // Handle temporal templates with date substitution
          if (foundTemplate.type === "temporal" && selectedDate) {
            const formattedDate = formatDateForTemplate(selectedDate, foundTemplate);
            tileTemplate = tileTemplate.replace(/{date}/g, formattedDate);
          }
          
          const cfg: ViewerConfigResponse = {
            id: selectedLayerId,
            title: foundTemplate.title,
            tile_url_template: tileTemplate,
            min_zoom: 0,
            max_zoom: 8,
            tile_size: 256,
            body: maybeBody,
          };
          if (!mounted) return;
          console.log('[TileViewer3] Setting layer config:', cfg.id, cfg.title);
          setLayerConfig(cfg);
          // Don't override selectedBody from config - it's controlled externally
          // setSelectedBody(maybeBody as BodyKey);
          return;
        }
      } else {
        // maybe selectedLayerId is just template id (search all bodies)
        for (const body of Object.keys(TREK_TEMPLATES) as BodyKey[]) {
          const t = TREK_TEMPLATES[body].find((x) => x.id === selectedLayerId);
          if (t) {
            foundTemplate = t;
            // Handle temporal templates with date substitution
            let tileTemplate = t.template;
            if (t.type === "temporal" && selectedDate) {
              const formattedDate = formatDateForTemplate(selectedDate, t);
              tileTemplate = tileTemplate.replace(/{date}/g, formattedDate);
            }
            
            const cfg: ViewerConfigResponse = {
              id: selectedLayerId,
              title: t.title,
              tile_url_template: tileTemplate,
              min_zoom: 0,
              max_zoom: 8,
              tile_size: 256,
              body,
            };
            if (!mounted) return;
            console.log(`Setting template layerConfig for ${selectedLayerId}:`, cfg);
            setLayerConfig(cfg);
            // Don't override selectedBody from config - it's controlled externally
            // setSelectedBody(body);
            return;
          }
        }
      }

      // If nothing found, clear
      if (!mounted) setLayerConfig(null);
    })();

    return () => { mounted = false; };
  }, [selectedLayerId, selectedDate]);

  // When selectedBody changes, auto-load features (Moon Gazetteer or Mars Robbins)
  useEffect(() => {
    console.log('[TileViewer3] Feature loading - selectedBody:', selectedBody);
    // Clear features immediately to avoid showing wrong body's features
    setFeatures([]);
    
    if (selectedBody === "moon") {
      console.log('[TileViewer3] Loading Moon features...');
      loadMoonGazetteer();
    } else if (selectedBody === "mars") {
      console.log('[TileViewer3] Loading Mars features...');
      queryMarsCraterDB();
    } else {
      console.log('[TileViewer3] No features for body:', selectedBody);
      // Features already cleared above
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBody]);

  // Keep openseadragon import in effect (client-only) - ONLY for backend-sourced configs
  useEffect(() => {
    console.log('[TileViewer3] OpenSeadragon viewer effect - layerConfig:', layerConfig?.id, layerConfig?.title);
    let viewer: OpenSeadragon.Viewer | null = null;
    let osd: typeof import("openseadragon") | null = null;
    let mounted = true;

    (async () => {
      if (!layerConfig) {
        console.log('[TileViewer3] No layerConfig - skipping viewer creation');
        return;
      }
      console.log('[TileViewer3] Creating OpenSeadragon viewer for:', layerConfig.id);
      const OSDModule = await import("openseadragon");
      osd = (OSDModule.default ?? OSDModule) as typeof import("openseadragon");
      if (!viewerRef.current || !mounted) return;
      
      // Clear any existing content to prevent conflicts
      viewerRef.current.innerHTML = "";

      // Set maxLevel and tileSize for the tiling scheme
      const minZoom = layerConfig.min_zoom;
      const maxLevel = layerConfig.max_zoom - layerConfig.min_zoom;
      const tileSize = layerConfig.tile_size;
      // For standard web map tiles, both width and height use 2^maxLevel
      const width = tileSize * Math.pow(2, maxLevel);
      const height = tileSize * Math.pow(2, maxLevel);

      const tileSource: OpenSeadragon.TileSourceOptions = {
        width,
        height,
        tileSize,
        minLevel: 0,
        maxLevel,
        getTileUrl: function (level: number, x: number, y: number) {
          const maxTiles = Math.pow(2, level);

          // Handle horizontal wrapping
          x = ((x % maxTiles) + maxTiles) % maxTiles;

          // Constrain vertical position
          if (y < 0 || y >= maxTiles) return "";

          const z = level + minZoom;
          return layerConfig.tile_url_template
            .replace("{z}", String(z))
            .replace("{x}", String(x))
            .replace("{y}", String(y))
            .replace("{col}", String(x))
            .replace("{row}", String(y));
        },
      };

      viewer = new osd.Viewer({
        element: viewerRef.current,
        prefixUrl: "https://cdn.jsdelivr.net/npm/openseadragon@latest/build/openseadragon/images/",
        showNavigator: false,  // Hide by default for cleaner Google Earth-style interface
        showZoomControl: false,
        showHomeControl: false,
        showFullPageControl: false,
        showRotationControl: false,
        tileSources: [tileSource as any],
        gestureSettingsMouse: { clickToZoom: false },
        constrainDuringPan: true,
        homeFillsViewer: true,
        visibilityRatio: 0.5,
        minZoomImageRatio: 0.8,
        maxZoomPixelRatio: 2.0,
        defaultZoomLevel: 1,
        wrapHorizontal: true,
        wrapVertical: false,
        immediateRender: true,
        preserveImageSizeOnResize: true,
        animationTime: 0,
        springStiffness: 5,
        maxImageCacheCount: 200
      });

      console.log('[TileViewer3] OpenSeadragon viewer created successfully with tile source');
      viewerObjRef.current = viewer;
    })();

    return () => {
      console.log('[TileViewer3] OpenSeadragon viewer cleanup - destroying viewer');
      mounted = false;
      if (viewer) {
        // Clear all overlays before destroying
        try {
          viewer.clearOverlays();
        } catch (e) {
          console.warn("Could not clear overlays during cleanup:", e);
        }
        viewer.destroy();
      }
    };
  }, [layerConfig]);

  // Handle initial navigation to coordinates from PhotoSphereGallery
  useEffect(() => {
    if (initialLat !== undefined && initialLon !== undefined && viewerObjRef.current) {
      const viewer = viewerObjRef.current;
      
      // Wait a bit for viewer to be fully initialized
      setTimeout(() => {
        try {
          // For OpenSeadragon viewers, we need to convert lat/lon to image coordinates
          // This is a simplified conversion - for more accuracy, we'd need the specific projection
          const normalizedX = (initialLon + 180) / 360; // Convert -180/180 to 0/1
          const normalizedY = (90 - initialLat) / 180; // Convert -90/90 to 0/1 (flipped for image coordinates)
          
          const imageRect = viewer.world.getItemAt(0).getBounds();
          const targetX = imageRect.x + (normalizedX * imageRect.width);
          const targetY = imageRect.y + (normalizedY * imageRect.height);
          
          const targetPoint = new viewer.Point(targetX, targetY);
          const targetZoom = initialZoom ? Math.max(0, initialZoom - 5) : 2; // Convert tile zoom to viewer zoom
          
          viewer.viewport.panTo(targetPoint);
          viewer.viewport.zoomTo(targetZoom);
        } catch (error) {
          console.warn("Could not navigate to initial coordinates:", error);
        }
      }, 1000);
    }
  }, [initialLat, initialLon, initialZoom, layerConfig]);

  // Split/overlay viewer functionality
  // Initialize and sync viewers
  useEffect(() => {
    let mounted = true;
    let osdModule: any = null;
    let mainViewer: any = null;
    let compareViewer: any = null;

    const cleanup = () => {
      try {
        if (mainViewer) {
          removeProjectionDebug(mainViewer);
        }
        if (mainViewer) { mainViewer.destroy(); mainViewer = null; }
      } catch {
        // ignore
      }
      try {
        if (compareViewer) { compareViewer.destroy(); compareViewer = null; }
      } catch {
        // ignore
      }
      viewerObjRef.current = null;
      compareViewerObjRef.current = null;
    };

    (async () => {
      // Only run template-based viewer for template-based configs (selectedLayerId contains ":")
      // OR when we have no layerConfig at all
      if (!selectedLayerId?.includes(":")) {
        cleanup();
        return;
      }
      
      if (!layerConfig) {
        cleanup();
        return;
      }

      try {
        const OSDModule = await import("openseadragon");
        osdModule = OSDModule.default ?? OSDModule;

        // wait one tick for DOM
        await new Promise((r) => setTimeout(r, 0));
        if (!mounted) return;

        // destroy any existing viewers
        cleanup();

        // create tileSource object appropriate for OpenSeadragon
        const minZoom = layerConfig.min_zoom ?? 0;
        const maxZoom = layerConfig.max_zoom ?? 8;
        const tileSize = layerConfig.tile_size ?? 256;
        const zoomLevels = Math.max(0, maxZoom - minZoom);

        // For standard web map tiles, both dimensions use the same formula
        const virtualWidth = tileSize * Math.pow(2, zoomLevels);
        const virtualHeight = tileSize * Math.pow(2, zoomLevels);

        // tile URL template from layerConfig
        const template = layerConfig.tile_url_template;
        
        // Create a template object for comparison logic
        const foundTemplate = {
          template: layerConfig.tile_url_template,
          type: "base" as const
        };

        const tileSource: any = {
          width: virtualWidth,
          height: virtualHeight,
          tileSize,
          minLevel: 0,
          maxLevel: zoomLevels,
          getTileUrl: function (level: number, x: number, y: number) {
            // Map OpenSeadragon level (0..maxLevel) -> WMTS z (minZoom..maxZoom)
            const z = level + minZoom;
            // compute wrapping & row/col counts at that z
            const maxTiles = Math.pow(2, level);

            // wrap x horizontally
            const wrappedX = ((x % maxTiles) + maxTiles) % maxTiles;
            // if y outside range, return empty string (OS will skip)
            if (y < 0 || y >= maxTiles) return "";

            let finalY = y;
            const finalX = wrappedX;
            
            // Special handling for NASA GIBS (uses TMS coordinate system)
            if (template.includes('gibs.earthdata.nasa.gov')) {
              // GIBS uses TMS where Y is flipped: y_tms = (2^z - 1) - y_xyz
              // Use actual zoom level z, not OpenSeadragon level
              finalY = Math.pow(2, z) - 1 - y;
            }

            // template might use {z}/{row}/{col} or {z}/{y}/{x} or {z}/{col}/{row}
            return template
              .replace(/{z}/g, String(z))
              .replace(/{row}/g, String(finalY))
              .replace(/{col}/g, String(finalX))
              .replace(/{x}/g, String(finalX))
              .replace(/{y}/g, String(finalY));
          },
        };

        // Create main viewer
        if (!viewerRef.current) return;
        
        // Clear any existing content to prevent conflicts  
        viewerRef.current.innerHTML = "";
        mainViewer = new osdModule({
          element: viewerRef.current,
          prefixUrl: "https://cdn.jsdelivr.net/npm/openseadragon@latest/build/openseadragon/images/",
          tileSources: [tileSource],
          showNavigator: osdToolbarVisible || false,  // Controlled by Advanced settings
          showZoomControl: osdToolbarVisible || false,
          showHomeControl: osdToolbarVisible || false, 
          showFullPageControl: osdToolbarVisible || false,
          gestureSettingsMouse: { clickToZoom: false },
          constrainDuringPan: true,
          homeFillsViewer: true,
          visibilityRatio: 0.5,
          wrapHorizontal: true,
          wrapVertical: false,
          animationTime: 0.25,
        });

        viewerObjRef.current = mainViewer;

        // Add overlays (like center crosshair) when open
        mainViewer.addHandler("open", function () {
          addCenterCrosshair(mainViewer);
        });

        // Add double-click handler for reverse search
        mainViewer.addHandler("canvas-double-click", function (event: any) {
          if (!event.quick) {
            // Get viewport point from click position
            const viewportPoint = mainViewer.viewport.pointFromPixel(event.position);
            const imagePoint = mainViewer.viewport.viewportToImageCoordinates(viewportPoint);
            
            // Convert to lat/lon
            const imageWidth = mainViewer.world.getItemAt(0).source.dimensions.x;
            const imageHeight = mainViewer.world.getItemAt(0).source.dimensions.y;
            
            const lon = (imagePoint.x / imageWidth) * 360 - 180;
            const lat = 90 - (imagePoint.y / imageHeight) * 180;
            
            console.log('[Reverse Search] Double-click at:', { lat, lon, body: selectedBody });
            
            // Find nearest feature
            handleReverseSearch(lat, lon, selectedBody);
          }
        });

        // If split or overlay mode, create compare viewer
        const overlayTemplate = selectedOverlayId
          ? (TREK_TEMPLATES[selectedBody] || []).find((t) => t.id === selectedOverlayId)
          : null;
        
        // For split mode, use the overlay template if selected, otherwise use the main template
        // For overlay mode, require an overlay template
        const compareTemplate = overlayTemplate || (viewMode === "split" ? foundTemplate : null);

        console.log("Debug viewer creation:", {
          viewMode,
          selectedOverlayId,
          overlayTemplate: !!overlayTemplate,
          foundTemplate: !!foundTemplate,
          compareTemplate: !!compareTemplate,
          shouldCreateCompare: (viewMode === "split" || viewMode === "overlay") && compareTemplate
        });

        if ((viewMode === "split" || viewMode === "overlay") && compareTemplate) {
          if (!compareViewerRef.current) {
            console.error("Compare viewer container not found");
          } else {
            // Build compare viewer tile source using compareTemplate
            const compareTileSource: any = {
              width: virtualWidth,
              height: virtualHeight,
              tileSize,
              minLevel: 0,
              maxLevel: zoomLevels,
              getTileUrl(level: number, x: number, y: number) {
                const z = level + minZoom;
                const maxTiles = Math.pow(2, level);
                const wrappedX = ((x % maxTiles) + maxTiles) % maxTiles;
                if (y < 0 || y >= maxTiles) return "";
                
                let finalY = y;
                const finalX = wrappedX;
                
                let url = compareTemplate.template;
                if (compareTemplate.type === "temporal" && selectedDate) {
                  const formattedDate = formatDateForTemplate(selectedDate, compareTemplate);
                  url = url.replace("{date}", formattedDate);
                }
                
                // Special handling for NASA GIBS (uses TMS coordinate system)
                if (url.includes('gibs.earthdata.nasa.gov')) {
                  // GIBS uses TMS where Y is flipped: y_tms = (2^z - 1) - y_xyz
                  finalY = Math.pow(2, z) - 1 - y;
                }
                
                return url
                  .replace(/{z}/g, String(z))
                  .replace(/{row}/g, String(finalY))
                  .replace(/{col}/g, String(finalX))
                  .replace(/{x}/g, String(finalX))
                  .replace(/{y}/g, String(finalY));
              },
            };

            compareViewer = new osdModule({
              element: compareViewerRef.current,
              prefixUrl: "https://cdn.jsdelivr.net/npm/openseadragon@latest/build/openseadragon/images/",
              tileSources: [compareTileSource],
              showNavigator: false,  // Always hide in compare mode
              showZoomControl: false,
              showHomeControl: false,
              showFullPageControl: false,
              gestureSettingsMouse: { clickToZoom: false },
              constrainDuringPan: true,
              homeFillsViewer: true,
              visibilityRatio: 0.5,
              wrapHorizontal: true,
            });

            compareViewerObjRef.current = compareViewer;

            // Sync viewers with guards to prevent infinite recursion
            let isUpdating = false;
            const sync = (src: any, dst: any, id: string) => {
              if (!src || !dst) return;
              const handler = () => {
                if (isUpdating) return; // Prevent infinite recursion
                
                try {
                  isUpdating = true;
                  const center = src.viewport.getCenter();
                  const zoom = src.viewport.getZoom();
                  
                  // Use immediate=false to prevent triggering events during sync
                  dst.viewport.panTo(center, false);
                  dst.viewport.zoomTo(zoom, null, false);
                } catch (error) {
                  console.error(`Error syncing viewer ${id}:`, error);
                } finally {
                  // Reset the flag after a short delay to allow the sync to complete
                  setTimeout(() => { isUpdating = false; }, 10);
                }
              };
              src.addHandler("pan", handler);
              src.addHandler("zoom", handler);
              // return cleanup
              return () => {
                src.removeHandler("pan", handler);
                src.removeHandler("zoom", handler);
              };
            };

            // attach bidirectional sync
            sync(mainViewer, compareViewer, "main->compare");
            sync(compareViewer, mainViewer, "compare->main");

            // set overlay opacity if in overlay mode (use world item)
            try {
              if (viewMode === "overlay" && compareViewer.world.getItemAt(0)) {
                compareViewer.world.getItemAt(0).setOpacity(overlayOpacity);
              }
            } catch {
              // ignore
            }

            // ensure we remove handlers on cleanup (we'll call cleanup() below)
            // store cleanups in local closures
          }
        } // end overlay

      } catch (err) {
        console.error("Error creating OpenSeadragon viewers:", err);
      }
    })();

    return () => {
      mounted = false;
      try { if (viewerObjRef.current) viewerObjRef.current.destroy(); } catch {}
      try { if (compareViewerObjRef.current) compareViewerObjRef.current.destroy(); } catch {}
      viewerObjRef.current = null;
      compareViewerObjRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBody, selectedLayerId, selectedOverlayId, viewMode, selectedDate, layerConfig]);

  useEffect(() => {
    let cancelled = false;

    const ensureDebug = () => {
      if (!projectionDebugEnabled) {
        removeProjectionDebug();
        return true;
      }

      const viewer = viewerObjRef.current;
      if (!viewer) {
        return false;
      }

      try {
        attachProjectionDebug(viewer, selectedBody as BodyKey, longitudeDebugMode);
        return true;
      } catch (err) {
        console.warn("Failed to attach projection debug overlays", err);
        return false;
      }
    };

    if (!ensureDebug() && projectionDebugEnabled) {
      const interval = window.setInterval(() => {
        if (cancelled) {
          window.clearInterval(interval);
          return;
        }
        if (ensureDebug()) {
          window.clearInterval(interval);
        }
      }, 300);

      return () => {
        cancelled = true;
        window.clearInterval(interval);
        if (!projectionDebugEnabled) {
          removeProjectionDebug();
        }
      };
    }

    return () => {
      cancelled = true;
      if (!projectionDebugEnabled) {
        removeProjectionDebug();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectionDebugEnabled, longitudeDebugMode, selectedBody, layerConfig]);

  // Update OSD toolbar visibility dynamically
  useEffect(() => {
    if (viewerObjRef.current) {
      if (viewerObjRef.current.navigator?.element) {
        viewerObjRef.current.navigator.element.style.display = osdToolbarVisible ? 'block' : 'none';
      }
      if (viewerObjRef.current.zoomInButton?.element) {
        viewerObjRef.current.zoomInButton.element.style.display = osdToolbarVisible ? 'block' : 'none';
      }
      if (viewerObjRef.current.zoomOutButton?.element) {
        viewerObjRef.current.zoomOutButton.element.style.display = osdToolbarVisible ? 'block' : 'none';
      }
      if (viewerObjRef.current.homeButton?.element) {
        viewerObjRef.current.homeButton.element.style.display = osdToolbarVisible ? 'block' : 'none';
      }
      if (viewerObjRef.current.fullPageButton?.element) {
        viewerObjRef.current.fullPageButton.element.style.display = osdToolbarVisible ? 'block' : 'none';
      }
      console.log('[TileViewer3] OSD toolbar visibility changed:', osdToolbarVisible);
    }
  }, [osdToolbarVisible]);

  // Update overlay opacity when it changes
  useEffect(() => {
    if (viewMode !== "overlay") return;
    const cmp = compareViewerObjRef.current;
    if (!cmp) return;
    try {
      const item = cmp.world.getItemAt(0);
      if (item && item.setOpacity) item.setOpacity(overlayOpacity);
    } catch {
      // ignore
    }
  }, [overlayOpacity, viewMode]);

  // Helper to format dates for different APIs
  function formatDateForTemplate(date: string, template: any): string {
    if (!date || !template.temporalRange) return date;
    
    const format = template.temporalRange.format;
    switch (format) {
      case "YYYY-MM-DD":
        return date; // Already in correct format
      case "YYYYMMDD":
        return date.replace(/-/g, "");
      case "YYYY/MM/DD":
        return date.replace(/-/g, "/");
      default:
        return date;
    }
  }

  // USGS Gazetteer KML/KMZ example links are available from the USGS "KML and Shapefile downloads" page.
  // Example KMZ (center points) for Moon and Mars (listed on USGS downloads page):
  // - Moon center points (KMZ):
  //   https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MOON_nomenclature_center_pts.kmz
  // - Mars center points (KMZ):
  //   https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MARS_nomenclature_center_pts.kmz
  // (Those downloads are documented on the USGS Gazetteer downloads page.)
  // See Sources at the bottom for the official page link.

  // Fetch and parse a KMZ (USGS Gazetteer center points) and convert to GeoJSON (togeojson)
  async function fetchGazetteerKMZ(kmzUrl: string, body: BodyKey): Promise<PlanetFeature[]> {
    try {
      // If backend proxy set, use it to avoid CORS problems; otherwise try direct fetch
      const fetchUrl = backendBase ? `${backendBase}/proxy/kmz?url=${encodeURIComponent(kmzUrl)}` : kmzUrl;
      const r = await fetch(fetchUrl);
      if (!r.ok) {
        console.warn("KMZ fetch failed", r.status, r.statusText);
        return [];
      }
      const arrayBuffer = await r.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      const kmlEntryName = Object.keys(zip.files).find((n) => n.toLowerCase().endsWith(".kml"));
      if (!kmlEntryName) {
        console.warn("No KML inside KMZ");
        return [];
      }
      const kmlText = await zip.files[kmlEntryName].async("text");
      const parser = new DOMParser();
      const kmlDoc = parser.parseFromString(kmlText, "application/xml");
      const geojson = (toGeoJSON as any).kml(kmlDoc) as FeatureCollection;
      const pts: PlanetFeature[] = [];
      for (const feat of geojson.features ?? []) {
        if (!feat.geometry || feat.geometry.type !== "Point") continue;
        const [lon, lat] = (feat.geometry as Point).coordinates;
        const canonicalLon = normalizeLongitude(
          Number(lon),
          BODY_LONGITUDE_CONVENTIONS[body] ?? BODY_LONGITUDE_CONVENTIONS.unknown
        );
        pts.push({
          name: (feat.properties as any)?.name || (feat.properties as any)?.Name || "unnamed",
          lat: Number(lat),
          lon: canonicalLon,
        });
      }
      return pts;
    } catch (err) {
      console.error("Error parsing KMZ:", err);
      return [];
    }
  }

  async function loadMoonGazetteer() {
    const moonKmz = "https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MOON_nomenclature_center_pts.kmz";
    const pts = await fetchGazetteerKMZ(moonKmz, "moon");
    setFeatures(pts.slice(0, 500));
  }

  async function queryMarsCraterDB() {
    // First try USGS center points KMZ to populate names
    const marsKmz = "https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MARS_nomenclature_center_pts.kmz";
    const ptsFromKmz = await fetchGazetteerKMZ(marsKmz, "mars");
    // then fetch Robbins crater DB via pygeoapi
    const base = "https://astrogeology.usgs.gov/pygeoapi/collections/mars/robbinsv1/items?f=json&limit=500";
    try {
      const resp = await fetch(base);
      if (!resp.ok) {
        console.warn("pygeoapi fetch failed", resp.status);
        // fallback to kmz points
        setFeatures(ptsFromKmz.slice(0, 500));
        return;
      }
      const j = await resp.json();
      const items = (j.features ?? []).map((f: any) => {
        const lat = f.properties?.lat;
        const lon = f.properties?.lon_e;
        if (typeof lat !== "number" || typeof lon !== "number") return null;
        const canonicalLon = normalizeLongitude(lon, BODY_LONGITUDE_CONVENTIONS.mars);
        return {
          name: f.properties?.craterid || f.properties?.name || "crater",
          lat,
          lon: canonicalLon,
          diamkm: f.properties?.diamkm,
        } as PlanetFeature;
      }).filter(Boolean) as PlanetFeature[];

      // merge with kmz names (prefer pygeoapi for craters)
      const merged = items.concat(ptsFromKmz).slice(0, 1000);
      setFeatures(merged);
    } catch (err) {
      console.error("Error fetching Mars crater DB:", err);
      setFeatures(ptsFromKmz.slice(0, 500));
    }
  }

  // Enhanced search with backend integration
  async function searchWithBackend(query: string) {
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });
      
      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.found) {
        const { body, center, feature, provider, ai_description } = result;

        const bodyKey = (body ?? selectedBody) as BodyKey;
        const canonicalLon = normalizeLongitude(
          center.lon,
          BODY_LONGITUDE_CONVENTIONS[bodyKey] ?? BODY_LONGITUDE_CONVENTIONS.unknown
        );

        if (body !== selectedBody) {
          setSelectedBody(body);
        }
        
        setSearchProvider(provider);
        setAiDescription(ai_description);
        setSearchSuggestions([]);
        
        const searchFeature = {
          name: feature.name,
          lat: center.lat,
          lon: canonicalLon,
          category: feature.category,
          diameter_km: feature.diameter_km
        };

        setFeatures([searchFeature]);

        setTimeout(() => {
          flyToLocation(canonicalLon, center.lat, 6, searchFeature);
        }, 1000);
        
        console.log('ui.flow', 'search_completed', {
          query,
          result: feature.name,
          provider: provider || 'unknown'
        });
      } else {
        setFeatures([]);
        setSearchProvider(undefined);
        setAiDescription(undefined);
        setSearchSuggestions(result.suggestions || []);
        console.log('No results found for query:', query, 'Suggestions:', result.suggestions?.length || 0);
      }
    } catch (error) {
      console.error('Search API error:', error);
      throw error;
    }
  }

  async function searchEarthLocations(query: string) {
    if (!query.trim()) return;
    
    try {
      // Use Nominatim (OpenStreetMap) geocoding API for Earth locations
      const encodedQuery = encodeURIComponent(query.trim());
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=20&addressdetails=1`
      );
      
      if (!resp.ok) {
        console.warn("Nominatim geocoding failed:", resp.status);
        return;
      }
      
      const results = await resp.json();
      const locations: PlanetFeature[] = results.map((item: any) => ({
        name: item.display_name,
        lat: parseFloat(item.lat),
        lon: normalizeLongitude(parseFloat(item.lon), BODY_LONGITUDE_CONVENTIONS.earth),
        type: item.type,
        class: item.class
      }));
      
      setFeatures(locations);
    } catch (err) {
      console.error("Error searching Earth locations:", err);
    }
  }

  async function loadMercuryGazetteer() {
    const mercuryKmz = "https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MERCURY_nomenclature_center_pts.kmz";
    const pts = await fetchGazetteerKMZ(mercuryKmz, "mercury");
    setFeatures(pts.slice(0, 500));
  }

  async function loadCeresGazetteer() {
    const ceresKmz = "https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/CERES_nomenclature_center_pts.kmz";
    const pts = await fetchGazetteerKMZ(ceresKmz, "ceres");
    setFeatures(pts.slice(0, 500));
  }

  async function loadVestaGazetteer() {
    const vestaKmz = "https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/VESTA_nomenclature_center_pts.kmz";
    const pts = await fetchGazetteerKMZ(vestaKmz, "vesta");
    setFeatures(pts.slice(0, 500));
  }

  // ---------- overlays / helpers ----------
  function addCenterCrosshair(viewer: any) {
    if (!viewer) return;
    try {
      const centerEl = document.createElement("div");
      centerEl.className = "osd-center-crosshair";
      centerEl.style.cssText = `
        width: 18px;
        height: 18px;
        border: 2px solid rgba(255,255,255,0.9);
        border-radius: 50%;
        pointer-events: none;
        transform: translate(-50%, -50%);
      `;
      // place at viewport center
      viewer.addOverlay({
        element: centerEl,
        location: viewer.viewport.getCenter(),
        placement: "CENTER",
        checkResize: false,
      });
    } catch (err) {
      console.error("addCenterCrosshair error:", err);
    }
  }

  function removeProjectionDebug(viewerInstance?: any) {
    const activeViewer = viewerInstance ?? viewerObjRef.current;
    if (!activeViewer) return;

    const { grid, markers } = debugOverlaysRef.current;
    if (grid) {
      try {
        activeViewer.removeOverlay(grid);
      } catch (err) {
        console.warn("Failed to remove grid overlay", err);
      }
    }
    markers?.forEach((marker) => {
      try {
        activeViewer.removeOverlay(marker);
      } catch (err) {
        console.warn("Failed to remove reference marker", err);
      }
    });
    debugOverlaysRef.current = { markers: [] };
  }

  function createGridOverlayElement(mode: LongitudeDebugMode): HTMLElement {
    const lonLines: string[] = [];
    const latLines: string[] = [];
    for (let lon = 0; lon <= 360; lon += 1) {
      const isMajor = lon % 10 === 0;
      const opacity = isMajor ? 0.45 : 0.18;
      const width = isMajor ? 0.6 : 0.3;
      lonLines.push(
        `<line x1="${lon}" y1="0" x2="${lon}" y2="180" stroke="rgba(122, 188, 255, ${opacity})" stroke-width="${width}" />`
      );
    }
    for (let lat = 0; lat <= 180; lat += 1) {
      const isMajor = (lat % 10) === 0;
      const opacity = isMajor ? 0.4 : 0.16;
      const width = isMajor ? 0.6 : 0.3;
      latLines.push(
        `<line x1="0" y1="${lat}" x2="360" y2="${lat}" stroke="rgba(122, 188, 255, ${opacity})" stroke-width="${width}" />`
      );
    }

    const lonLabels: number[] = [];
    if (mode === "east-360") {
      for (let value = 0; value <= 360; value += 30) {
        lonLabels.push(value);
      }
    } else {
      for (let value = -180; value <= 180; value += 30) {
        lonLabels.push(value);
      }
    }

    const latLabels = [-90, -60, -30, 0, 30, 60, 90];
    const labelFragments: string[] = [];

    lonLabels.forEach((value) => {
      const canonical = mode === "east-360" ? value - 180 : value;
      const x = canonicalToDisplay(canonical, "east-360");
      labelFragments.push(
        `<text x="${x}" y="6" class="pe-grid-label">${mode === "east-360" ? `${value}°E` : formatLongitude(canonical, mode)}</text>`
      );
    });

    latLabels.forEach((latValue) => {
      const y = 90 - latValue;
      const label = `${Math.abs(latValue)}°${latValue < 0 ? "S" : latValue > 0 ? "N" : ""}`;
      labelFragments.push(`<text x="354" y="${y + 4}" class="pe-grid-label" text-anchor="end">${label}</text>`);
    });

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 360 180");
    svg.classList.add("pe-grid-overlay");
    svg.innerHTML = `${lonLines.join("")}${latLines.join("")}${labelFragments.join("")}`;
    return svg as unknown as HTMLElement;
  }

  function createReferenceMarkerElement(
    name: string,
    canonicalLon: number,
    lat: number,
    mode: LongitudeDebugMode
  ): HTMLElement {
    const container = document.createElement("div");
    container.className = "pe-reference-marker";
    const coords = `${formatLongitude(canonicalLon, mode)} · ${lat.toFixed(1)}°`;
    container.innerHTML = `
      <div class="pe-reference-marker__ring"></div>
      <div class="pe-reference-marker__label">
        <span class="pe-reference-marker__name">${name}</span>
        <span class="pe-reference-marker__coords">${coords}</span>
      </div>
    `;
    return container;
  }

  function attachProjectionDebug(viewer: any, body: BodyKey, mode: LongitudeDebugMode) {
    removeProjectionDebug(viewer);

    const osdGlobal = (window as any).OpenSeadragon;
    if (!osdGlobal) {
      console.warn("OpenSeadragon global not available for debug overlay");
      return;
    }

    const item = viewer.world.getItemAt(0);
    if (!item) {
      console.warn("No world item for debug overlay");
      return;
    }

    const dimensions = item.source?.dimensions || item.source || {};
    const imgW = dimensions.x || dimensions.width;
    const imgH = dimensions.y || dimensions.height;
    if (!imgW || !imgH) {
      console.warn("Missing image dimensions for debug overlay");
      return;
    }

    const gridElement = createGridOverlayElement(mode);
    const rect = new osdGlobal.Rect(0, 0, imgW, imgH);
    const viewportRect = viewer.viewport.imageToViewportRectangle(rect);
    viewer.addOverlay({
      element: gridElement,
      location: viewportRect,
      placement: osdGlobal.Placement.TOP_LEFT,
      checkResize: false,
    });

    const markerElements: HTMLElement[] = [];
    const references = REFERENCE_FEATURES[body] || [];
    references.forEach((ref) => {
      const canonicalLon = normalizeLongitude(ref.lon, BODY_LONGITUDE_CONVENTIONS[body]);
      const marker = createReferenceMarkerElement(ref.name, canonicalLon, ref.lat, mode);
      const lonForImage = canonicalToDisplay(canonicalLon, "east-360");
      const x = (lonForImage / 360) * imgW;
      const y = ((90 - ref.lat) / 180) * imgH;
      viewer.addOverlay({
        element: marker,
        location: viewer.viewport.imageToViewportCoordinates(x, y),
        placement: osdGlobal.Placement.CENTER,
        checkResize: false,
      });
      markerElements.push(marker);
    });

    debugOverlaysRef.current = { grid: gridElement, markers: markerElements };
  }

  // Reverse search: find nearest feature to clicked coordinates
  function handleReverseSearch(lat: number, lon: number, body: string) {
    console.log('[Reverse Search] Finding nearest feature to:', { lat, lon, body });
    
    if (features.length === 0) {
      console.warn('[Reverse Search] No features loaded for', body);
      // Show a helpful message
      setShowInfoPanel(false);
      return;
    }

    // Calculate distance between two lat/lon points (Haversine formula)
    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const bodyKey = (body ?? "unknown") as BodyKey;
      const R = BODY_RADII_KM[bodyKey] ?? BODY_RADII_KM.unknown;
      const lon1Canonical = normalizeLongitude(lon1, BODY_LONGITUDE_CONVENTIONS[bodyKey]);
      const lon2Canonical = normalizeLongitude(lon2, BODY_LONGITUDE_CONVENTIONS[bodyKey]);
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2Canonical - lon1Canonical) * Math.PI / 180;
      const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    // Find nearest feature
    let nearestFeature = features[0];
    let minDistance = calculateDistance(lat, lon, features[0].lat, features[0].lon);

    for (const feature of features) {
      const distance = calculateDistance(lat, lon, feature.lat, feature.lon);
      if (distance < minDistance) {
        minDistance = distance;
        nearestFeature = feature;
      }
    }

    console.log('[Reverse Search] Nearest feature:', nearestFeature.name, 'distance:', minDistance.toFixed(2), 'km');

    // Show feature in info panel (if not using glass UI)
    if (process.env.NEXT_PUBLIC_ENABLE_LEGACY_UI === 'true') {
      setSelectedFeature({
        name: nearestFeature.name,
        lat: nearestFeature.lat,
        lon: nearestFeature.lon,
        category: 'Feature',
        diameter_km: nearestFeature.diamkm,
        body: body,
      });
      setSearchProvider('reverse_search');
      setShowInfoPanel(true);
    } else {
      // For glass UI, communicate with parent to show ResultCard
      const featureData = {
        name: nearestFeature.name,
        lat: nearestFeature.lat,
        lon: nearestFeature.lon,
        category: 'Feature',
        diameter_km: nearestFeature.diamkm,
        body: body,
      };
      console.info('[Reverse Search] Feature found:', nearestFeature.name, '- notifying parent');
      onFeatureSelected?.(featureData);
    }

    // Fly to the feature
    flyToLocation(nearestFeature.lon, nearestFeature.lat, 6, nearestFeature);
  }

  // Enhanced navigation with animation and info panel
  function flyToLocation(lon: number, lat: number, zoomLevel = 4, featureData?: any) {
    const v = viewerObjRef.current;
    if (!v) return;

    console.log('ui.flow', 'camera_flyto_started', { lon, lat, zoom: zoomLevel });
    const startTime = Date.now();

    const bodyKey = selectedBody as BodyKey;
    const canonicalLon = wrapLongitude180(lon);
    lat = Math.max(-90, Math.min(90, lat));
    const lonForImage = canonicalToDisplay(canonicalLon, "east-360");

    // get image dimensions from the first world item
    let sourceItem;
    try {
      sourceItem = v.world.getItemAt(0);
    } catch (err) {
      console.error("No world item in viewer", err);
      return;
    }
    if (!sourceItem || !sourceItem.source) {
      console.error("No source info");
      return;
    }
    const imgW = sourceItem.source.width;
    const imgH = sourceItem.source.height;

    // Convert lon/lat to image pixel coordinates
    const x = (lonForImage / 360) * imgW;
    const y = ((90 - lat) / 180) * imgH;

    // Remove previous pulse overlay if present
    if (pulseOverlayRef.current) {
      try {
        v.removeOverlay(pulseOverlayRef.current);
      } catch (overlayErr) {
        console.warn("Failed to remove previous pulse overlay", overlayErr);
      }
      pulseOverlayRef.current = null;
    }

    // Add pulsing ring marker to suggest approximate location
    try {
      const marker = document.createElement("div");
      marker.className = "pe-pulse-marker";
      marker.style.setProperty("--pe-pulse-scale", (Math.max(0.6, Math.min(2.0, 8 / (zoomLevel || 4)))).toString());
      marker.dataset.body = bodyKey;
      marker.dataset.lat = lat.toString();
      marker.dataset.lon = canonicalLon.toString();

      v.addOverlay({
        element: marker,
        location: v.viewport.imageToViewportCoordinates(x, y),
        placement: "CENTER",
        checkResize: false,
      });

      pulseOverlayRef.current = marker;
      console.log('ui.flow', 'pin_rendered', true);
    } catch (err) {
      console.error("Error adding overlay:", err);
    }

    // Smooth flyTo animation
    const viewportPoint = v.viewport.imageToViewportCoordinates(x, y);
    
    // Enable animation for smooth transition
    v.animationTime = 1.2;
    v.viewport.panTo(viewportPoint, true);
    
    setTimeout(() => {
      v.viewport.zoomTo(zoomLevel, viewportPoint, true);
      
      // Log completion and show info panel
      const endTime = Date.now();
      console.log('ui.flow', 'camera_flyto_completed', { 
        duration: endTime - startTime,
        target: { lon, lat, zoom: zoomLevel }
      });
      
      // Show info panel if feature data provided
      if (featureData) {
        setSelectedFeature({
          name: featureData.name,
          body: selectedBody,
          lat: featureData.lat,
          lon: featureData.lon,
          category: featureData.category,
          diameter_km: featureData.diameter_km,
          keywords: featureData.keywords || []
        });
        setShowInfoPanel(true);
        console.log('ui.flow', 'info_panel_opened', { feature: featureData.name });
      }
    }, 300);
  }

  // Legacy function - now uses flyToLocation
  // function panToLonLat(lon: number, lat: number, zoomLevel = 4) {
  //   flyToLocation(lon, lat, zoomLevel);
  // }

  // Utility: pan/zoom viewer to lon/lat for NASA Trek tiles (original implementation)
  // function panToLonLatOriginal(lon: number, lat: number, zoomLevel = 4) {
  //   const v = viewerObjRef.current;
  //   if (!v) return;
  //   ... (commented out - legacy code)
  // }

  // filtered features by search text
  const filteredFeatures = features.filter((f) => {
    if (!searchText) return true;
    return f.name?.toLowerCase().includes(searchText.toLowerCase());
  });

  // ---------- UI -----------------------------------------------------
  if (hideUI) {
    // Minimal full-bleed mode for glass overlay UI
    return (
      <div className="pe-viewer-fullbleed" style={{ width: "100%", height: "100vh", position: "relative" }}>
        <div style={{ width: "100%", height: "100%", position: "relative" }}>
          {!isClient ? (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#000", color: "white" }}>
              Loading viewer...
            </div>
          ) : !layerConfig ? (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#000", color: "white" }}>
              {selectedLayerId ? `Loading layer: ${selectedLayerId}...` : `Loading ${selectedBody}...`}
            </div>
          ) : (
            <>
              <div ref={viewerRef} style={{ width: viewMode === "split" ? "50%" : "100%", height: "100%", position: "absolute", left: 0, top: 0 }} />
              {(viewMode === "split" || viewMode === "overlay") && (
                <div ref={compareViewerRef} style={{ width: viewMode === "split" ? "50%" : "100%", height: "100%", position: "absolute", right: 0, top: 0, pointerEvents: "auto" }} />
              )}
            </>
          )}
        </div>
        
        {/* Info Panel (Legacy - hidden by default) */}
        {process.env.NEXT_PUBLIC_ENABLE_LEGACY_UI === 'true' && (
          <InfoPanel 
            isOpen={showInfoPanel}
            onClose={() => setShowInfoPanel(false)}
            feature={selectedFeature}
            provider={searchProvider}
            aiDescription={aiDescription}
          />
        )}
      </div>
    );
  }

  // ---------- UI (full controls mode) -----------------------------------------------------
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <label>
            Body:
            <select value={selectedBody} onChange={(e) => {
              setSelectedBody(e.target.value as BodyKey);
              setSelectedLayerId("");
              setSelectedOverlayId("");
            }}>
              <option value="earth">Earth</option>
              <option value="moon">Moon</option>
              <option value="mars">Mars</option>
              <option value="mercury">Mercury</option>
              <option value="ceres">Ceres</option>
              <option value="vesta">Vesta</option>
            </select>
          </label>

          <label>
            Dataset:
            <select value={selectedLayerId ?? ""} onChange={(e) => setSelectedLayerId(e.target.value)}>
              <option value="">(none)</option>
              {datasets
                .filter(d => d.body === selectedBody || d.id.startsWith(`${selectedBody}:`))
                .map((d) => (
                  <option key={d.id} value={d.id}>{d.title}</option>
                ))}
            </select>
          </label>

          {/* Temporal Date Input for NASA GIBS layers */}
          {selectedBody === "earth" && selectedLayerId && (
            (() => {
              const currentTemplate = (TREK_TEMPLATES[selectedBody] || []).find(t => t.id === selectedLayerId);
              if (currentTemplate?.type === "temporal") {
                return (
                  <label>
                    Date:
                    <input 
                      type="date" 
                      value={selectedDate} 
                      onChange={(e) => setSelectedDate(e.target.value)}
                      min="2000-01-01"
                      max={new Date().toISOString().split('T')[0]}
                      style={{ marginLeft: 4 }}
                    />
                  </label>
                );
              }
              return null;
            })()
          )}

          <label>
            View Mode:
            <select value={viewMode} onChange={(e) => setViewMode(e.target.value as any)}>
              <option value="single">Single</option>
              <option value="split">Split</option>
              <option value="overlay">Overlay</option>
            </select>
          </label>

          {(viewMode === "split" || viewMode === "overlay") && (
            <label>
              Compare layer:
              <select value={selectedOverlayId} onChange={(e) => setSelectedOverlayId(e.target.value)}>
                <option value="">(none)</option>
                {(TREK_TEMPLATES[selectedBody] || []).map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </label>
          )}

          {/* Temporal Date Input for NASA GIBS layers */}
          {selectedBody === "earth" && (
            (() => {
              const currentTemplate = selectedLayerId ? 
                (TREK_TEMPLATES[selectedBody] || []).find(t => t.id === selectedLayerId) : null;
              const compareTemplate = selectedOverlayId ? 
                (TREK_TEMPLATES[selectedBody] || []).find(t => t.id === selectedOverlayId) : null;
              
              const needsTemporalDate = 
                (currentTemplate?.type === "temporal") || 
                (compareTemplate?.type === "temporal");
              
              if (needsTemporalDate) {
                return (
                  <label>
                    Date:
                    <input 
                      type="date" 
                      value={selectedDate} 
                      onChange={(e) => setSelectedDate(e.target.value)}
                      min="2000-01-01"
                      max={new Date().toISOString().split('T')[0]}
                      style={{ marginLeft: 4 }}
                    />
                  </label>
                );
              }
              return null;
            })()
          )}

          {viewMode === "overlay" && (
            <label>
              Opacity:
              <input type="range" min={0} max={1} step={0.05} value={overlayOpacity} onChange={(e) => setOverlayOpacity(Number(e.target.value))}/>
            </label>
          )}


          {selectedBody === "moon" && <button onClick={loadMoonGazetteer}>Load Moon Features</button>}
          {selectedBody === "mars" && <button onClick={() => queryMarsCraterDB()}>Load Mars Features</button>}
          {selectedBody === "mercury" && <button onClick={loadMercuryGazetteer}>Load Mercury Features</button>}
          {selectedBody === "ceres" && <button onClick={loadCeresGazetteer}>Load Ceres Features</button>}
          {selectedBody === "vesta" && <button onClick={loadVestaGazetteer}>Load Vesta Features</button>}
        </div>

        <div style={{ width: "100%", height: "640px", position: "relative" }}>
          {!isClient ? (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#000", color: "white" }}>
              Loading viewer...
            </div>
          ) : !layerConfig ? (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#222", color: "white" }}>
              {selectedLayerId ? `Loading layer: ${selectedLayerId}...` : `Select a layer for ${selectedBody}`}
            </div>
          ) : (
            <>
              <div ref={viewerRef} style={{ width: viewMode === "split" ? "50%" : "100%", height: "100%", position: "absolute", left: 0, top: 0 }} />
              {(viewMode === "split" || viewMode === "overlay") && (
                <div ref={compareViewerRef} style={{ width: viewMode === "split" ? "50%" : "100%", height: "100%", position: "absolute", right: 0, top: 0, pointerEvents: "auto" }} />
              )}
            </>
          )}
        </div>
      </div>

      <aside style={{ width: 360, borderLeft: "1px solid #eee", padding: 8, overflow: "auto" }}>
        <h3>Features / Search {isSearching && <span style={{ fontSize: '12px', color: '#666' }}>Searching...</span>}</h3>
        <div style={{ position: "relative", marginBottom: 8 }}>
          <input 
            type="text" 
            placeholder="Filter features..." 
            value={searchText} 
            onChange={(e) => {
              const newValue = e.target.value;
              setSearchText(newValue);
              onSearchChange?.(newValue);
            }} 
            style={{ width: "100%", paddingRight: searchText ? "30px" : "8px" }} 
          />
          {searchText && (
            <button
              onClick={() => {
                setSearchText("");
                onSearchChange?.("");
              }}
              style={{
                position: "absolute",
                right: "8px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "16px",
                color: "#666",
                padding: "2px"
              }}
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>
        {filteredFeatures.length === 0 ? (
          <div style={{ color: "#888" }}>{features.length === 0 ? "No features loaded for this body." : "No features match your search."}</div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {filteredFeatures.map((f, i) => (
              <li key={i} style={{ marginBottom: 8 }}>
                <button style={{ width: "100%", textAlign: "left" }} onClick={() => flyToLocation(f.lon, f.lat, 6, f)}>
                  <strong>{f.name}</strong>
                  <div style={{ fontSize: 12 }}>{f.lat.toFixed(4)}, {f.lon.toFixed(4)} {f.diamkm ? `• ${f.diamkm} km` : ""}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      
      {/* Info Panel (Legacy - hidden by default) */}
      {process.env.NEXT_PUBLIC_ENABLE_LEGACY_UI === 'true' && (
        <InfoPanel 
          isOpen={showInfoPanel}
          onClose={() => setShowInfoPanel(false)}
          feature={selectedFeature}
          provider={searchProvider}
          aiDescription={aiDescription}
        />
      )}
      
      {/* Search Suggestions */}
      {searchSuggestions.length > 0 && !showInfoPanel && (
        <div className="fixed top-24 right-4 w-80 bg-gray-900/95 backdrop-blur-xl rounded-lg border border-white/20 shadow-2xl z-40 p-4">
          <div className="text-white/60 text-sm mb-2">Did you mean:</div>
          <div className="space-y-2">
            {searchSuggestions.map((suggestion, idx) => (
              <button
                key={idx}
                onClick={async () => {
                  const suggestedQuery = suggestion.name;
                  setSearchText(suggestedQuery);
                  setSearchSuggestions([]);
                  if (onSearchChange) {
                    onSearchChange(suggestedQuery);
                  }
                  try {
                    await searchWithBackend(suggestedQuery);
                  } catch (err) {
                    console.error('Failed to search suggestion:', err);
                  }
                }}
                className="w-full text-left px-3 py-2 bg-white/10 hover:bg-white/20 rounded text-white/80 hover:text-white transition-colors text-sm"
              >
                <div className="font-medium">{suggestion.name}</div>
                <div className="text-xs text-white/60 capitalize">{suggestion.category} on {suggestion.body}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
