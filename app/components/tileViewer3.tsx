// app/components/TileViewer.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
// @ts-ignore - togeojson doesn't have types
import toGeoJSON from "togeojson";
import type { FeatureCollection, Point } from "geojson";

import {
  DEFAULT_ALIGNMENT_CORRECTIONS,
  type AlignmentCorrection,
  type BodyKey,
  formatLatitude,
  formatLongitude,
  getAlignmentCorrectionForLayer,
  getBodyProjectionMetadata,
  inferLongitudeConvention,
  loadStoredCorrections,
  lonLatToImagePoint,
  normalizeLatitude,
  saveStoredCorrections,
  toCanonicalLongitude,
  type LonConvention,
} from "../lib/planetaryGeodesy";

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
  type?: string;
  class?: string;
};

const KNOWN_REFERENCE_FEATURES: Record<BodyKey, Array<{ name: string; lat: number; lon: number }>> = {
  earth: [],
  milky_way: [],
  moon: [
    { name: "Tycho", lat: -43.31, lon: -11.36 },
    { name: "Clavius", lat: -58.77, lon: -14.68 },
    { name: "Copernicus", lat: 9.62, lon: -20.08 },
    { name: "Mare Imbrium", lat: 32.8, lon: -15.6 },
    { name: "Aristarchus", lat: 23.7, lon: -47.5 },
  ],
  mars: [
    { name: "Olympus Mons", lat: 18.65, lon: -133.8 },
    { name: "Gale Crater", lat: -5.4, lon: 137.8 },
    { name: "Valles Marineris", lat: -13.9, lon: -59.3 },
    { name: "Elysium Planitia", lat: 2.0, lon: 155.0 },
    { name: "Jezero Crater", lat: 18.4, lon: 77.6 },
  ],
  mercury: [
    { name: "Caloris Planitia", lat: 30.0, lon: -160.0 },
    { name: "Tolstoj", lat: -16.4, lon: -166.6 },
    { name: "Beethoven", lat: -20.8, lon: -124.3 },
    { name: "Rembrandt", lat: -33.5, lon: 33.0 },
    { name: "Raditladi", lat: 27.4, lon: 119.0 },
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
}

export default function TileViewer({ 
  externalSearchQuery, 
  onSearchChange,
  initialBody,
  initialLat,
  initialLon,
  initialZoom 
}: TileViewerProps) {
  // refs and viewer instances
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const compareViewerRef = useRef<HTMLDivElement | null>(null);
  const viewerObjRef = useRef<any | null>(null);
  const compareViewerObjRef = useRef<any | null>(null);
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
  const [searchText, setSearchText] = useState<string>(externalSearchQuery ?? "");
  const [lonConventionMode, setLonConventionMode] = useState<"canonical" | "native">("canonical");
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [showReferenceFeatures, setShowReferenceFeatures] = useState<boolean>(false);
  const [showDebugTools, setShowDebugTools] = useState<boolean>(false);
  const [alignmentOverrides, setAlignmentOverrides] = useState<Record<string, AlignmentCorrection>>(() => loadStoredCorrections());
  const [alignmentDraft, setAlignmentDraft] = useState<{ x: string; y: string }>({ x: "", y: "" });

  const bodyProjection = getBodyProjectionMetadata(selectedBody);
  const displayLonConvention: LonConvention = lonConventionMode === "native"
    ? bodyProjection.nativeLonConvention
    : "EAST_180";

  const mergedCorrections = useMemo(
    () => ({ ...DEFAULT_ALIGNMENT_CORRECTIONS, ...alignmentOverrides }),
    [alignmentOverrides]
  );

  const activeCorrection = getAlignmentCorrectionForLayer(
    selectedLayerId,
    selectedBody,
    mergedCorrections
  );

  const markerElementRef = useRef<HTMLDivElement | null>(null);
  const gridOverlayStateRef = useRef<{ update: () => void; dispose: () => void } | null>(null);
  const referenceOverlayElementsRef = useRef<HTMLDivElement[]>([]);
  const selectedBodyRef = useRef<BodyKey>(selectedBody);
  const selectedLayerIdRef = useRef<string | null>(selectedLayerId);
  const lonConventionModeRef = useRef<"canonical" | "native">(lonConventionMode);
  const showGridRef = useRef<boolean>(showGrid);
  const showReferenceFeaturesRef = useRef<boolean>(showReferenceFeatures);
  const correctionsRef = useRef<Record<string, AlignmentCorrection>>(mergedCorrections);
  const overlayOpacityRef = useRef<number>(overlayOpacity);

  console.log('[TileViewer3 RENDER] initialBody:', initialBody, 'selectedBody:', selectedBody, 'selectedLayerId:', selectedLayerId, 'hasExternalBodySynced:', hasExternalBodySynced.current);

  // sync external search - including empty string to clear search
  useEffect(() => {
    if (externalSearchQuery !== undefined) {
      setSearchText(externalSearchQuery);
    }
  }, [externalSearchQuery]);

  useEffect(() => {
    selectedBodyRef.current = selectedBody;
    gridOverlayStateRef.current?.update();
    renderReferenceFeatureOverlays();
  }, [selectedBody, renderReferenceFeatureOverlays]);

  useEffect(() => {
    selectedLayerIdRef.current = selectedLayerId;
    gridOverlayStateRef.current?.update();
    renderReferenceFeatureOverlays();
  }, [selectedLayerId, renderReferenceFeatureOverlays]);

  useEffect(() => {
    lonConventionModeRef.current = lonConventionMode;
    gridOverlayStateRef.current?.update();
  }, [lonConventionMode]);

  useEffect(() => {
    showGridRef.current = showGrid;
    gridOverlayStateRef.current?.update();
  }, [showGrid]);

  useEffect(() => {
    overlayOpacityRef.current = overlayOpacity;
  }, [overlayOpacity]);

  useEffect(() => {
    showReferenceFeaturesRef.current = showReferenceFeatures;
    renderReferenceFeatureOverlays();
  }, [showReferenceFeatures, renderReferenceFeatureOverlays]);

  useEffect(() => {
    correctionsRef.current = mergedCorrections;
    gridOverlayStateRef.current?.update();
    renderReferenceFeatureOverlays();
  }, [mergedCorrections, renderReferenceFeatureOverlays]);

  useEffect(() => {
    const correction = getAlignmentCorrectionForLayer(
      selectedLayerId,
      selectedBody,
      mergedCorrections
    );
    if (correction?.pixelOffset) {
      setAlignmentDraft({
        x: correction.pixelOffset.x.toString(),
        y: correction.pixelOffset.y.toString(),
      });
    } else {
      setAlignmentDraft({ x: "", y: "" });
    }
  }, [selectedLayerId, selectedBody, mergedCorrections]);

  // Auto-search for planetary features when search text changes
  useEffect(() => {
    if (searchText.trim() && searchText.length > 2) {
      const debounceTimer = setTimeout(() => {
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
      }, 500); // 500ms debounce
      
      return () => clearTimeout(debounceTimer);
    }
  }, [searchText, selectedBody, searchEarthLocations, loadMoonGazetteer, queryMarsCraterDB, loadMercuryGazetteer, loadCeresGazetteer, loadVestaGazetteer]);

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
        showNavigator: true,
        navigatorSizeRatio: 0.15,
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
    if (initialLat === undefined || initialLon === undefined) return;
    if (!viewerObjRef.current) return;

    const zoom = initialZoom ? Math.max(0, initialZoom - 2) : 4;
    const timeout = setTimeout(() => {
      panToLonLat(initialLon, initialLat, zoom);
    }, 600);

    return () => clearTimeout(timeout);
  }, [initialLat, initialLon, initialZoom, layerConfig, panToLonLat]);

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
          clearReferenceOverlays(mainViewer);
        }
      } catch {
        // ignore
      }
      if (gridOverlayStateRef.current) {
        gridOverlayStateRef.current.dispose();
        gridOverlayStateRef.current = null;
      }
      markerElementRef.current = null;
      try {
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
          showNavigator: true,
          navigatorSizeRatio: 0.18,
          gestureSettingsMouse: { clickToZoom: false },
          constrainDuringPan: true,
          homeFillsViewer: true,
          visibilityRatio: 0.5,
          wrapHorizontal: true,
          wrapVertical: false,
          animationTime: 0.25,
        });

        viewerObjRef.current = mainViewer;

        if (gridOverlayStateRef.current) {
          gridOverlayStateRef.current.dispose();
        }
        gridOverlayStateRef.current = createGridOverlay(mainViewer);
        gridOverlayStateRef.current?.update();
        renderReferenceFeatureOverlays(mainViewer);

        // Add overlays (like center crosshair) when open
        mainViewer.addHandler("open", function () {
          addCenterCrosshair(mainViewer);
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
              showNavigator: viewMode === "split",
              navigatorSizeRatio: 0.14,
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
                compareViewer.world
                  .getItemAt(0)
                  .setOpacity(overlayOpacityRef.current);
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
      cleanup();
    };
  }, [selectedBody, selectedLayerId, selectedOverlayId, viewMode, selectedDate, layerConfig, createGridOverlay, renderReferenceFeatureOverlays]);

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
  async function fetchGazetteerKMZ(kmzUrl: string): Promise<PlanetFeature[]> {
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
        const latValue = normalizeLatitude(Number(lat));
        const lonRaw = Number(lon);
        const canonicalLon = toCanonicalLongitude(lonRaw, inferLongitudeConvention(lonRaw));
        pts.push({
          name: (feat.properties as any)?.name || (feat.properties as any)?.Name || "unnamed",
          lat: latValue,
          lon: canonicalLon,
        });
      }
      return pts;
    } catch (err) {
      console.error("Error parsing KMZ:", err);
      return [];
    }
  }

  const loadMoonGazetteer = useCallback(async () => {
    const moonKmz = "https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MOON_nomenclature_center_pts.kmz";
    const pts = await fetchGazetteerKMZ(moonKmz);
    setFeatures(pts.slice(0, 500));
  }, []);

  const queryMarsCraterDB = useCallback(async () => {
    // First try USGS center points KMZ to populate names
    const marsKmz = "https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MARS_nomenclature_center_pts.kmz";
    const ptsFromKmz = await fetchGazetteerKMZ(marsKmz);
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
        const canonicalLon = toCanonicalLongitude(lon, "EAST_360");
        return {
          name: f.properties?.craterid || f.properties?.name || "crater",
          lat: normalizeLatitude(lat),
          lon: canonicalLon,
          diamkm: f.properties?.diamkm,
          type: f.properties?.featuretyp,
        } as PlanetFeature;
      }).filter(Boolean) as PlanetFeature[];

      // merge with kmz names (prefer pygeoapi for craters)
      const merged = items.concat(ptsFromKmz).slice(0, 1000);
      setFeatures(merged);
    } catch (err) {
      console.error("Error fetching Mars crater DB:", err);
      setFeatures(ptsFromKmz.slice(0, 500));
    }
  }, []);

  const searchEarthLocations = useCallback(async (query: string) => {
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
      const locations: PlanetFeature[] = results.map((item: any) => {
        const lat = normalizeLatitude(parseFloat(item.lat));
        const lonRaw = parseFloat(item.lon);
        const canonicalLon = toCanonicalLongitude(lonRaw, inferLongitudeConvention(lonRaw));
        return {
          name: item.display_name,
          lat,
          lon: canonicalLon,
          type: item.type,
          class: item.class,
        };
      });
      
      setFeatures(locations);
    } catch (err) {
      console.error("Error searching Earth locations:", err);
    }
  }, []);

  const loadMercuryGazetteer = useCallback(async () => {
    const mercuryKmz = "https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MERCURY_nomenclature_center_pts.kmz";
    const pts = await fetchGazetteerKMZ(mercuryKmz);
    setFeatures(pts.slice(0, 500));
  }, []);

  const loadCeresGazetteer = useCallback(async () => {
    const ceresKmz = "https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/CERES_nomenclature_center_pts.kmz";
    const pts = await fetchGazetteerKMZ(ceresKmz);
    setFeatures(pts.slice(0, 500));
  }, []);

  const loadVestaGazetteer = useCallback(async () => {
    const vestaKmz = "https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/VESTA_nomenclature_center_pts.kmz";
    const pts = await fetchGazetteerKMZ(vestaKmz);
    setFeatures(pts.slice(0, 500));
  }, []);

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

  const getCurrentAlignmentCorrection = useCallback(() => {
    return getAlignmentCorrectionForLayer(
      selectedLayerIdRef.current,
      selectedBodyRef.current,
      correctionsRef.current
    );
  }, []);

  const getPrimaryImageDimensions = useCallback((viewer: any): { width: number; height: number } | null => {
    try {
      const item = viewer.world.getItemAt(0);
      const source = item?.source;
      if (!source?.width || !source?.height) {
        return null;
      }
      return { width: source.width, height: source.height };
    } catch (err) {
      console.error("No world item in viewer", err);
      return null;
    }
  }, []);

  // Utility: pan/zoom viewer to lon/lat using configured projection metadata
  const panToLonLat = useCallback((lon: number, lat: number, zoomLevel = 4) => {
    const viewer = viewerObjRef.current;
    if (!viewer) return;

    const dims = getPrimaryImageDimensions(viewer);
    if (!dims) {
      console.warn("Cannot determine image dimensions for viewer");
      return;
    }

    const sourceConvention: LonConvention =
      lonConventionMode === "native"
        ? bodyProjection.nativeLonConvention
        : "EAST_180";

    const correction = getAlignmentCorrectionForLayer(
      selectedLayerId,
      selectedBody,
      mergedCorrections
    );

    const imagePoint = lonLatToImagePoint(lon, lat, selectedBody, dims, {
      sourceConvention,
      correction,
    });

    const viewportPoint = viewer.viewport.imageToViewportCoordinates(
      imagePoint.x,
      imagePoint.y
    );

    if (markerElementRef.current) {
      try {
        viewer.removeOverlay(markerElementRef.current);
      } catch {
        // ignore cleanup errors
      }
      markerElementRef.current.remove();
      markerElementRef.current = null;
    }

    const marker = document.createElement("div");
    marker.className = "feature-marker feature-marker--pulse";
    marker.innerHTML = `
      <div class="feature-marker__ring"></div>
      <div class="feature-marker__core"></div>
    `;
    marker.style.pointerEvents = "none";

    try {
      viewer.addOverlay({
        element: marker,
        location: viewportPoint,
        placement: "CENTER",
        checkResize: false,
      });
      markerElementRef.current = marker;
    } catch (err) {
      console.error("Error adding overlay:", err);
    }

    viewer.viewport.panTo(viewportPoint, true);
    setTimeout(() => {
      viewer.viewport.zoomTo(zoomLevel, viewportPoint, true);
    }, 120);
  }, [bodyProjection, lonConventionMode, mergedCorrections, selectedBody, selectedLayerId, getPrimaryImageDimensions]);

  function clearReferenceOverlays(targetViewer?: any) {
    const viewer = targetViewer ?? viewerObjRef.current;
    if (!viewer) return;

    referenceOverlayElementsRef.current.forEach((el) => {
      try {
        viewer.removeOverlay(el);
      } catch {
        // ignore removal errors
      }
      el.remove();
    });
    referenceOverlayElementsRef.current = [];
  }

  const renderReferenceFeatureOverlays = useCallback((forceViewer?: any) => {
    const viewer = forceViewer ?? viewerObjRef.current;
    if (!viewer) return;

    clearReferenceOverlays(viewer);

    if (!showReferenceFeaturesRef.current) {
      return;
    }

    const dims = getPrimaryImageDimensions(viewer);
    if (!dims) return;

    const bodyKey = selectedBodyRef.current;
    const referenceFeatures = KNOWN_REFERENCE_FEATURES[bodyKey] ?? [];
    if (!referenceFeatures.length) return;

    const correction = getCurrentAlignmentCorrection();

    referenceFeatures.forEach((feat) => {
      const imagePoint = lonLatToImagePoint(feat.lon, feat.lat, bodyKey, dims, {
        sourceConvention: "EAST_180",
        correction,
      });
      const viewportPoint = viewer.viewport.imageToViewportCoordinates(
        imagePoint.x,
        imagePoint.y
      );

      const marker = document.createElement("div");
      marker.className = "reference-marker";
      marker.innerHTML = `
        <div class="reference-marker__dot"></div>
        <span class="reference-marker__label">${feat.name}</span>
      `;
      marker.style.pointerEvents = "none";

      try {
        viewer.addOverlay({
          element: marker,
          location: viewportPoint,
          placement: "CENTER",
          checkResize: false,
        });
        referenceOverlayElementsRef.current.push(marker);
      } catch (err) {
        console.error("Error adding reference marker:", err);
      }
    });
  }, [getCurrentAlignmentCorrection, getPrimaryImageDimensions]);

  const createGridOverlay = useCallback((viewer: any): { update: () => void; dispose: () => void } | null => {
    if (!viewer?.container) return null;

    const canvas = document.createElement("canvas");
    canvas.className = "projection-grid-overlay";
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "30";
    canvas.style.mixBlendMode = "screen";
    viewer.container.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      canvas.remove();
      return null;
    }

    const update = () => {
      const container = viewer.container as HTMLElement;
      const width = container.clientWidth;
      const height = container.clientHeight;
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const targetWidth = Math.max(1, Math.round(width * dpr));
      const targetHeight = Math.max(1, Math.round(height * dpr));

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!showGridRef.current) {
        ctx.restore();
        return;
      }

      const dims = getPrimaryImageDimensions(viewer);
      if (!dims) {
        ctx.restore();
        return;
      }

      ctx.scale(dpr, dpr);

      const bodyKey = selectedBodyRef.current;
      const correction = getCurrentAlignmentCorrection();
      const viewport = viewer.viewport;
      const widthPx = width;
      const heightPx = height;
      const tolerance = 40;

      const projectPoint = (lon: number, lat: number) => {
        const imagePoint = lonLatToImagePoint(lon, lat, bodyKey, dims, {
          sourceConvention: "EAST_180",
          correction,
        });
        const viewportPoint = viewport.imageToViewportCoordinates(
          imagePoint.x,
          imagePoint.y
        );
        return viewport.viewportToViewerElementCoordinates(viewportPoint);
      };

      for (let lon = -180; lon <= 180; lon += 1) {
        const top = projectPoint(lon, 90);
        const bottom = projectPoint(lon, -90);
        if (
          (top.x < -tolerance && bottom.x < -tolerance) ||
          (top.x > widthPx + tolerance && bottom.x > widthPx + tolerance)
        ) {
          continue;
        }
        const isPrime = Math.abs(lon) < 0.001;
        ctx.strokeStyle = isPrime ? "rgba(0, 255, 200, 0.75)" : "rgba(0, 255, 255, 0.35)";
        ctx.lineWidth = isPrime ? 1.6 : 1;
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(bottom.x, bottom.y);
        ctx.stroke();
      }

      for (let lat = -90; lat <= 90; lat += 1) {
        const left = projectPoint(-180, lat);
        const right = projectPoint(180, lat);
        if (
          (left.y < -tolerance && right.y < -tolerance) ||
          (left.y > heightPx + tolerance && right.y > heightPx + tolerance)
        ) {
          continue;
        }
        const isEquator = Math.abs(lat) < 0.001;
        ctx.strokeStyle = isEquator ? "rgba(255, 255, 200, 0.75)" : "rgba(255, 255, 255, 0.28)";
        ctx.lineWidth = isEquator ? 1.6 : 0.8;
        ctx.beginPath();
        ctx.moveTo(left.x, left.y);
        ctx.lineTo(right.x, right.y);
        ctx.stroke();
      }

      ctx.restore();
    };

    const handler = () => update();
    viewer.addHandler("animation", handler);
    viewer.addHandler("open", handler);
    viewer.addHandler("resize", handler);
    viewer.addHandler("update-viewport", handler);
    if (typeof window !== "undefined") {
      window.addEventListener("resize", handler);
    }

    return {
      update,
      dispose: () => {
        try {
          viewer.removeHandler("animation", handler);
          viewer.removeHandler("open", handler);
          viewer.removeHandler("resize", handler);
          viewer.removeHandler("update-viewport", handler);
        } catch {
          // ignore handler cleanup errors
        }
        if (typeof window !== "undefined") {
          window.removeEventListener("resize", handler);
        }
        canvas.remove();
      },
    };
  }, [getCurrentAlignmentCorrection, getPrimaryImageDimensions]);

  const handleAlignmentDraftChange = (axis: "x" | "y", value: string) => {
    setAlignmentDraft((prev) => ({ ...prev, [axis]: value }));
  };

  const handlePersistAlignmentOffset = () => {
    if (!selectedLayerId) {
      console.warn("No layer selected to persist alignment offset");
      return;
    }

    const xValue = alignmentDraft.x.trim() === "" ? 0 : Number(alignmentDraft.x);
    const yValue = alignmentDraft.y.trim() === "" ? 0 : Number(alignmentDraft.y);

    if (!Number.isFinite(xValue) || !Number.isFinite(yValue)) {
      console.warn("Alignment offset must be numeric");
      return;
    }

    const next = { ...alignmentOverrides };
    if (xValue === 0 && yValue === 0) {
      delete next[selectedLayerId];
    } else {
      next[selectedLayerId] = {
        ...(next[selectedLayerId] ?? {}),
        pixelOffset: { x: xValue, y: yValue },
      };
    }

    setAlignmentOverrides(next);
    saveStoredCorrections(next);
  };

  const handleResetAlignmentOffset = () => {
    if (!selectedLayerId) {
      console.warn("No layer selected to reset alignment offset");
      return;
    }

    const next = { ...alignmentOverrides };
    delete next[selectedLayerId];
    setAlignmentOverrides(next);
    saveStoredCorrections(next);
  };

  // filtered features by search text
  const filteredFeatures = features.filter((f) => {
    if (!searchText) return true;
    return f.name?.toLowerCase().includes(searchText.toLowerCase());
  });

  // ---------- UI -----------------------------------------------------
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
          <button
            type="button"
            onClick={() => setShowDebugTools((value) => !value)}
            style={{
              marginLeft: "auto",
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid rgba(148, 163, 184, 0.35)",
              background: showDebugTools ? "#1f2937" : "#0f172a",
              color: "#e2e8f0",
              cursor: "pointer",
              transition: "background 0.2s ease",
            }}
          >
            {showDebugTools ? "Hide Debug" : "Projection Debug"}
          </button>
        </div>

        {showDebugTools && (
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              borderRadius: 12,
              background: "#0f172a",
              border: "1px solid rgba(148, 163, 184, 0.25)",
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              color: "#e2e8f0",
            }}
          >
            <label style={{ display: "flex", flexDirection: "column", fontSize: 12 }}>
              <span style={{ marginBottom: 4, fontWeight: 600 }}>Longitude domain</span>
              <select
                value={lonConventionMode}
                onChange={(e) => setLonConventionMode(e.target.value as "canonical" | "native")}
                style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(148,163,184,0.35)", background: "#020617", color: "#e2e8f0" }}
              >
                <option value="canonical">East ±180° (canonical)</option>
                <option value="native">Native ({bodyProjection.nativeLonConvention === "EAST_360" ? "0–360°E" : "±180°E"})</option>
              </select>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
              />
              1° grid overlay
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={showReferenceFeatures}
                onChange={(e) => setShowReferenceFeatures(e.target.checked)}
              />
              Known feature markers
            </label>

            <div style={{ flexBasis: "100%", fontSize: 12, color: "#cbd5f5", display: "grid", gap: 4 }}>
              <div><strong>Body:</strong> {bodyProjection.displayName} • Radius {bodyProjection.radiusKm.toLocaleString(undefined, { maximumFractionDigits: 1 })} km</div>
              <div><strong>Native longitude:</strong> {bodyProjection.nativeLonConvention === "EAST_360" ? "0–360° east-positive" : "±180° east-positive"}</div>
              {bodyProjection.notes && <div><strong>Projection:</strong> {bodyProjection.notes}</div>}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, alignItems: "center" }}>
              <label style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ marginBottom: 2 }}>Static offset X (px)</span>
                <input
                  type="number"
                  value={alignmentDraft.x}
                  onChange={(e) => handleAlignmentDraftChange("x", e.target.value)}
                  style={{ width: 90, padding: "4px 6px", borderRadius: 6, border: "1px solid rgba(148,163,184,0.35)", background: "#020617", color: "#e2e8f0" }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ marginBottom: 2 }}>Static offset Y (px)</span>
                <input
                  type="number"
                  value={alignmentDraft.y}
                  onChange={(e) => handleAlignmentDraftChange("y", e.target.value)}
                  style={{ width: 90, padding: "4px 6px", borderRadius: 6, border: "1px solid rgba(148,163,184,0.35)", background: "#020617", color: "#e2e8f0" }}
                />
              </label>
              <button
                type="button"
                onClick={handlePersistAlignmentOffset}
                disabled={!selectedLayerId}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid rgba(94, 234, 212, 0.6)",
                  background: selectedLayerId ? "rgba(45, 212, 191, 0.15)" : "rgba(45, 212, 191, 0.05)",
                  color: "#5eead4",
                  cursor: selectedLayerId ? "pointer" : "not-allowed",
                }}
              >
                Save offset
              </button>
              <button
                type="button"
                onClick={handleResetAlignmentOffset}
                disabled={!selectedLayerId}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid rgba(248, 113, 113, 0.45)",
                  background: selectedLayerId ? "rgba(248, 113, 113, 0.12)" : "rgba(248, 113, 113, 0.05)",
                  color: "#fca5a5",
                  cursor: selectedLayerId ? "pointer" : "not-allowed",
                }}
              >
                Reset
              </button>
            </div>

            <div style={{ flexBasis: "100%", fontSize: 12, color: "#a5b4fc" }}>
              <strong>Current offset:</strong>{" "}
              {activeCorrection?.pixelOffset
                ? `${activeCorrection.pixelOffset.x.toFixed(2)}, ${activeCorrection.pixelOffset.y.toFixed(2)} px`
                : "0.00, 0.00 px"}
            </div>
          </div>
        )}

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
        <h3>Features / Search</h3>
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
                <button style={{ width: "100%", textAlign: "left" }} onClick={() => panToLonLat(f.lon, f.lat, 6)}>
                  <strong>{f.name}</strong>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>
                    {formatLatitude(f.lat)} • {formatLongitude(f.lon, { convention: displayLonConvention, decimals: 2 })}
                    {f.diamkm ? ` • ${f.diamkm.toFixed(1)} km` : ""}
                    {f.type ? ` • ${f.type}` : ""}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
