"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { PlanetaryBodyKey } from "@/app/lib/planetary/constants";
import {
  getDatasetById,
  areDatasetsCompatible,
  type DatasetMetadata,
} from "@/app/lib/planetary/datasets";
import {
  createDefaultProjection,
  latLonToPixel,
  pixelToLatLon,
  type LongitudeConvention,
  type ProjectionContext,
  type PixelDimensions,
} from "@/app/lib/planetary/geodesy";
import { getReferenceFeatures } from "@/app/lib/planetary/referenceFeatures";

const TILE_PREFIX =
  "https://cdn.jsdelivr.net/npm/openseadragon@latest/build/openseadragon/images/";

type OpenSeadragonModule = typeof import("openseadragon");
type OpenSeadragonViewer = import("openseadragon").Viewer;
type OpenSeadragonTiledImage = import("openseadragon").TiledImage;

interface GazetteerFeature {
  name: string;
  body: string;
  lat: number;
  lon: number;
  diameter_km?: number | null;
  type?: string;
}

interface PlanetaryMapProps {
  body: PlanetaryBodyKey;
  baseDatasetId?: string;
  osdToolbarVisible?: boolean;
  projectionDebugEnabled?: boolean;
  gridOverlayEnabled?: boolean;
  lonConvention: LongitudeConvention;
  referenceFeaturesEnabled?: boolean;
  splitViewEnabled?: boolean;
  splitLayerId?: string;
  hiResDatasetId?: string | null;
  elevationDatasetId?: string | null;
  stateInspectorEnabled?: boolean;
  initialLat?: number;
  initialLon?: number;
  initialZoom?: number;
  onFeatureSelected?: (feature: {
    name: string;
    lat: number;
    lon: number;
    category?: string;
    diameter_km?: number;
    body: string;
  }) => void;
  onSplitIncompatible?: () => void;
}

type GridScheduleToken = number | null;

interface InspectorSnapshot {
  ready: boolean;
  zoom: number;
  centerLat: number;
  centerLon: number;
  overlays: number;
  splitActive: boolean;
}

const featuresCache: Partial<Record<PlanetaryBodyKey, GazetteerFeature[]>> = {};

async function loadFeaturesForBody(
  body: PlanetaryBodyKey
): Promise<GazetteerFeature[]> {
  if (featuresCache[body]) {
    return featuresCache[body]!;
  }
  switch (body) {
    case "moon":
      featuresCache.moon = (
        await import("@/data/features/moon_features.json")
      ).default as GazetteerFeature[];
      break;
    case "mars":
      featuresCache.mars = (
        await import("@/data/features/mars_features.json")
      ).default as GazetteerFeature[];
      break;
    case "mercury":
      featuresCache.mercury = (
        await import("@/data/features/mercury_features.json")
      ).default as GazetteerFeature[];
      break;
    case "ceres":
    case "vesta":
      featuresCache[body] = (
        await import("@/data/features/all_features.json")
      ).default.filter((f: GazetteerFeature) => f.body === body);
      break;
  }
  return featuresCache[body] ?? [];
}

function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function buildProjectionContext(
  dataset: DatasetMetadata
): ProjectionContext {
  const defaultProjection = createDefaultProjection(dataset.body);
  const lonConvention = dataset.projection.lonConvention;
  const lonDirection = lonConvention.startsWith("west") ? "west" : "east";
  const lonDomain = lonConvention === "east-180" ? 180 : 360;

  return {
    datasetId: dataset.id,
    projection: {
      type: "simple-cylindrical",
      body: dataset.body,
      centralMeridianDeg: dataset.projection.centralMeridianDeg,
      primeMeridianOffsetDeg: dataset.projection.primeMeridianOffsetDeg,
      lonDirection,
      lonDomain,
      radiusMeters:
        dataset.projection.radiusMeters ?? defaultProjection.radiusMeters,
      nativeConvention: lonConvention,
    },
  };
}

function createTileSource(dataset: DatasetMetadata) {
  const { minZoom, maxZoom, tileSize } = dataset.tiling;
  const levelSpan = maxZoom - minZoom;
  const dimension = tileSize * Math.pow(2, levelSpan);

  return {
    type: 'zoomifytileservice',
    width: dimension,
    height: dimension,
    tileSize,
    minLevel: 0,
    maxLevel: levelSpan,
    getTileUrl(level: number, x: number, y: number) {
      const z = level + minZoom;
      const tilesPerAxis = Math.pow(2, level);
      const wrappedX = ((x % tilesPerAxis) + tilesPerAxis) % tilesPerAxis;
      if (y < 0 || y >= tilesPerAxis) return "";

      let row = y;
      const col = wrappedX;

      if (dataset.template.includes("gibs.earthdata.nasa.gov")) {
        row = Math.pow(2, z) - 1 - y;
      }

      return dataset.template
        .replace(/{z}/g, String(z))
        .replace(/{row}/g, String(row))
        .replace(/{col}/g, String(col))
        .replace(/{x}/g, String(col))
        .replace(/{y}/g, String(row));
    },
  } as any; // Type assertion for OpenSeadragon compatibility
}

export default function PlanetaryMap({
  body,
  baseDatasetId,
  osdToolbarVisible = false,
  projectionDebugEnabled = false,
  gridOverlayEnabled = false,
  lonConvention,
  referenceFeaturesEnabled = false,
  splitViewEnabled = false,
  splitLayerId,
  hiResDatasetId,
  elevationDatasetId,
  stateInspectorEnabled = false,
  initialLat,
  initialLon,
  initialZoom,
  onFeatureSelected,
  onSplitIncompatible,
}: PlanetaryMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayContainerRef = useRef<HTMLDivElement | null>(null);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<OpenSeadragonViewer | null>(null);
  const splitViewerRef = useRef<OpenSeadragonViewer | null>(null);
  const hiResImageRef = useRef<OpenSeadragonTiledImage | null>(null);
  const elevationImageRef = useRef<OpenSeadragonTiledImage | null>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const referenceOverlayRefs = useRef<HTMLElement[]>([]);
  const highlightOverlayRef = useRef<HTMLElement | null>(null);
  const scheduledGridFrame = useRef<GridScheduleToken>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [inspectorData, setInspectorData] = useState<InspectorSnapshot>({
    ready: false,
    zoom: 0,
    centerLat: 0,
    centerLon: 0,
    overlays: 0,
    splitActive: false,
  });

  const baseDataset = useMemo(
    () => (baseDatasetId ? getDatasetById(baseDatasetId) : undefined),
    [baseDatasetId]
  );

  const splitDataset = useMemo(
    () => (splitLayerId ? getDatasetById(splitLayerId) : undefined),
    [splitLayerId]
  );

  const splitCompatible = useMemo(() => {
    if (!splitViewEnabled || !baseDataset || !splitDataset) return false;
    return areDatasetsCompatible(baseDataset.id, splitDataset.id);
  }, [splitViewEnabled, baseDataset, splitDataset]);

  useEffect(() => {
    if (splitViewEnabled && splitDataset && !splitCompatible) {
      onSplitIncompatible?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitDataset, splitViewEnabled, splitCompatible]);

  const projectionContext = useMemo(() => {
    if (!baseDataset) return null;
    return buildProjectionContext(baseDataset);
  }, [baseDataset]);

  const imageDimensions = useMemo<PixelDimensions | null>(() => {
    if (!baseDataset) return null;
    const { minZoom, maxZoom, tileSize } = baseDataset.tiling;
    const span = maxZoom - minZoom;
    const dimension = tileSize * Math.pow(2, span);
    return { width: dimension, height: dimension };
  }, [baseDataset]);

  const ensureGridCanvas = useCallback(() => {
    if (!overlayContainerRef.current) return null;
    if (!gridCanvasRef.current) {
      const canvas = document.createElement("canvas");
      canvas.className = "pe-grid-overlay";
      canvas.style.position = "absolute";
      canvas.style.top = "0";
      canvas.style.left = "0";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.pointerEvents = "none";
      canvas.style.zIndex = "6";
      overlayContainerRef.current.appendChild(canvas);
      gridCanvasRef.current = canvas;
    }
    return gridCanvasRef.current;
  }, []);

  const removeGridCanvas = useCallback(() => {
    if (gridCanvasRef.current) {
      gridCanvasRef.current.remove();
      gridCanvasRef.current = null;
    }
  }, []);

  const scheduleGridUpdate = useCallback(() => {
    if (!gridOverlayEnabled) return;
    if (scheduledGridFrame.current !== null) {
      cancelAnimationFrame(scheduledGridFrame.current);
    }
    scheduledGridFrame.current = requestAnimationFrame(() => {
      scheduledGridFrame.current = null;
      updateGridOverlay();
    });
  }, [gridOverlayEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateGridOverlay = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || !gridOverlayEnabled || !projectionContext || !imageDimensions)
      return;

    const canvas = ensureGridCanvas();
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const container = viewer.container;
    const pixelRatio = window.devicePixelRatio || 1;
    const width = container.clientWidth * pixelRatio;
    const height = container.clientHeight * pixelRatio;
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    const viewport = viewer.viewport;
    const bounds = viewport.getBounds(true);
    const osd = (viewer as any).constructor as OpenSeadragonModule;
    const topLeft = viewport.viewportToImageCoordinates(
      new osd.Point(bounds.x, bounds.y)
    );
    const bottomRight = viewport.viewportToImageCoordinates(
      new osd.Point(bounds.x + bounds.width, bounds.y + bounds.height)
    );

    const sw = pixelToLatLon(
      bottomRight.x,
      bottomRight.y,
      projectionContext,
      imageDimensions,
      { targetConvention: lonConvention }
    );
    const ne = pixelToLatLon(topLeft.x, topLeft.y, projectionContext, imageDimensions, {
      targetConvention: lonConvention,
    });

    const latMin = Math.max(-90, Math.min(sw.lat, ne.lat));
    const latMax = Math.min(90, Math.max(sw.lat, ne.lat));
    let lonMin = Math.min(sw.lon, ne.lon);
    let lonMax = Math.max(sw.lon, ne.lon);

    if (lonMax - lonMin > 180) {
      lonMin = -180;
      lonMax = 180;
    }

    ctx.lineWidth = 1;
    ctx.strokeStyle = projectionDebugEnabled ? "rgba(59,130,246,0.8)" : "rgba(255,255,255,0.35)";
    ctx.font = `${12 * pixelRatio}px Mono`;
    ctx.fillStyle = "rgba(255,255,255,0.75)";

    const drawLatLine = (lat: number) => {
      const left = latLonToPixel(lat, lonMin, projectionContext, imageDimensions);
      const right = latLonToPixel(lat, lonMax, projectionContext, imageDimensions);
      const leftViewport = viewport.imageToViewportCoordinates(left.x, left.y);
      const rightViewport = viewport.imageToViewportCoordinates(right.x, right.y);
      const leftPixels = viewport.viewportToViewerElementCoordinates(leftViewport);
      const rightPixels = viewport.viewportToViewerElementCoordinates(rightViewport);

      ctx.beginPath();
      ctx.moveTo(leftPixels.x * pixelRatio, leftPixels.y * pixelRatio);
      ctx.lineTo(rightPixels.x * pixelRatio, rightPixels.y * pixelRatio);
      ctx.stroke();

      if (rightPixels.x - leftPixels.x > 40) {
        ctx.fillText(
          `${lat >= 0 ? "N" : "S"} ${Math.abs(lat).toFixed(0)} deg`,
          rightPixels.x * pixelRatio - 64 * pixelRatio,
          rightPixels.y * pixelRatio - 4 * pixelRatio
        );
      }
    };

    const drawLonLine = (lon: number) => {
      const bottom = latLonToPixel(latMin, lon, projectionContext, imageDimensions);
      const top = latLonToPixel(latMax, lon, projectionContext, imageDimensions);
      const bottomViewport = viewport.imageToViewportCoordinates(bottom.x, bottom.y);
      const topViewport = viewport.imageToViewportCoordinates(top.x, top.y);
      const bottomPixels =
        viewport.viewportToViewerElementCoordinates(bottomViewport);
      const topPixels = viewport.viewportToViewerElementCoordinates(topViewport);

      ctx.beginPath();
      ctx.moveTo(bottomPixels.x * pixelRatio, bottomPixels.y * pixelRatio);
      ctx.lineTo(topPixels.x * pixelRatio, topPixels.y * pixelRatio);
      ctx.stroke();

      if (topPixels.y - bottomPixels.y > 40) {
        ctx.fillText(
          `${lon >= 0 ? "E" : "W"} ${Math.abs(lon).toFixed(0)} deg`,
          topPixels.x * pixelRatio + 4 * pixelRatio,
          topPixels.y * pixelRatio + 12 * pixelRatio
        );
      }
    };

    for (let lat = Math.ceil(latMin); lat <= Math.floor(latMax); lat += 1) {
      drawLatLine(lat);
    }

    for (let lon = Math.ceil(lonMin); lon <= Math.floor(lonMax); lon += 1) {
      drawLonLine(lon);
    }
  }, [
    gridOverlayEnabled,
    projectionContext,
    imageDimensions,
    ensureGridCanvas,
    lonConvention,
    projectionDebugEnabled,
  ]);

  const clearReferenceMarkers = useCallback(() => {
    referenceOverlayRefs.current.forEach((el) => el.remove());
    referenceOverlayRefs.current = [];
  }, []);

  const renderReferenceMarkers = useCallback(() => {
    const viewer = viewerRef.current;
    if (
      !viewer ||
      !referenceFeaturesEnabled ||
      !projectionContext ||
      !imageDimensions
    ) {
      clearReferenceMarkers();
      return;
    }

    clearReferenceMarkers();

    const osd = (viewer as any).constructor as OpenSeadragonModule;
    const features = getReferenceFeatures(body);

    for (const feature of features) {
      const pixel = latLonToPixel(
        feature.lat,
        feature.lon,
        projectionContext,
        imageDimensions
      );
      const viewportPoint = viewer.viewport.imageToViewportCoordinates(
        pixel.x,
        pixel.y
      );
      const element = document.createElement("div");
      element.className = "pe-reference-marker";
      element.innerHTML = `
        <div class="pe-reference-marker__ring"></div>
        <div class="pe-reference-marker__label">
          <span>${feature.name}</span>
          <span>${feature.type ?? ""}</span>
        </div>
      `;
      viewer.addOverlay({
        element,
        location: new osd.Point(viewportPoint.x, viewportPoint.y),
        placement: osd.Placement.CENTER,
        checkResize: false,
      });
      referenceOverlayRefs.current.push(element);
    }
  }, [
    body,
    referenceFeaturesEnabled,
    projectionContext,
    imageDimensions,
    clearReferenceMarkers,
  ]);

  const clearHighlight = useCallback(() => {
    const viewer = viewerRef.current;
    if (viewer && highlightOverlayRef.current) {
      viewer.removeOverlay(highlightOverlayRef.current);
      highlightOverlayRef.current.remove();
      highlightOverlayRef.current = null;
    }
  }, []);

  const showHighlight = useCallback(
    (lat: number, lon: number, label?: string) => {
      const viewer = viewerRef.current;
      if (!viewer || !projectionContext || !imageDimensions) {
        return;
      }
      clearHighlight();
      const osd = (viewer as any).constructor as OpenSeadragonModule;
      const pixel = latLonToPixel(lat, lon, projectionContext, imageDimensions);
      const viewportPoint = viewer.viewport.imageToViewportCoordinates(
        pixel.x,
        pixel.y
      );
      const element = document.createElement("div");
      element.className = "pe-region-ping";
      element.innerHTML = `
        <div class="pe-region-ping__pulse"></div>
        <div class="pe-region-ping__core"></div>
        ${
          label
            ? `<div class="pe-region-ping__label">${label}</div>`
            : ""
        }
      `;
      viewer.addOverlay({
        element,
        location: new osd.Point(viewportPoint.x, viewportPoint.y),
        placement: osd.Placement.CENTER,
        checkResize: false,
      });
      highlightOverlayRef.current = element;
    },
    [clearHighlight, projectionContext, imageDimensions]
  );

  const flyTo = useCallback(
    (lat?: number, lon?: number, zoom?: number, label?: string) => {
      const viewer = viewerRef.current;
      if (
        !viewer ||
        lat === undefined ||
        lon === undefined ||
        !projectionContext ||
        !imageDimensions
      )
        return;

      const osd = (viewer as any).constructor as OpenSeadragonModule;
      const pixel = latLonToPixel(lat, lon, projectionContext, imageDimensions);
      const viewportPoint = viewer.viewport.imageToViewportCoordinates(
        pixel.x,
        pixel.y
      );

      viewer.viewport.panTo(
        new osd.Point(viewportPoint.x, viewportPoint.y),
        true
      );

      const targetZoom =
        zoom !== undefined
          ? Math.min(
              viewer.viewport.getMaxZoom(),
              Math.max(viewer.viewport.getMinZoom(), zoom)
            )
          : undefined;
      if (targetZoom) {
        viewer.viewport.zoomTo(targetZoom, viewportPoint, true);
      }

      showHighlight(lat, lon, label);
    },
    [projectionContext, imageDimensions, showHighlight]
  );

  const updateInspectorSnapshot = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || !stateInspectorEnabled || !projectionContext || !imageDimensions)
      return;

    const center = viewer.viewport.getCenter(true);
    const osd = (viewer as any).constructor as OpenSeadragonModule;
    const centerImage = viewer.viewport.viewportToImageCoordinates(
      new osd.Point(center.x, center.y)
    );
    const geo = pixelToLatLon(
      centerImage.x,
      centerImage.y,
      projectionContext,
      imageDimensions,
      { targetConvention: "east-180" }
    );
    const overlays = viewer.world.getItemCount();

    setInspectorData({
      ready: viewerReady,
      zoom: viewer.viewport.getZoom(true),
      centerLat: geo.lat,
      centerLon: geo.lon,
      overlays,
      splitActive: splitViewEnabled && splitCompatible,
    });
  }, [
    viewerReady,
    stateInspectorEnabled,
    projectionContext,
    imageDimensions,
    splitViewEnabled,
    splitCompatible,
  ]);

  useEffect(() => {
    let cancelled = false;
    let viewer: OpenSeadragonViewer | null = null;

    async function setupViewer() {
      if (!containerRef.current || !baseDataset) return;

      const osdImport = await import("openseadragon");
      if (cancelled) return;
      const OSD = (osdImport.default ?? osdImport) as OpenSeadragonModule;

      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
      if (splitViewerRef.current) {
        splitViewerRef.current.destroy();
        splitViewerRef.current = null;
      }
      removeGridCanvas();
      clearReferenceMarkers();
      clearHighlight();

      viewer = new OSD.Viewer({
        element: containerRef.current,
        prefixUrl: TILE_PREFIX,
        tileSources: [createTileSource(baseDataset)],
        showNavigator: osdToolbarVisible,
        showZoomControl: osdToolbarVisible,
        showHomeControl: osdToolbarVisible,
        showFullPageControl: false,
        gestureSettingsMouse: { clickToZoom: false },
        minZoomImageRatio: 0.8,
        maxZoomPixelRatio: 2.5,
        wrapHorizontal: true,
        immediateRender: true,
        visibilityRatio: 0.5,
      });

      viewerRef.current = viewer;

      viewer.addHandler("open", () => {
        if (cancelled) return;
        setViewerReady(true);
        renderReferenceMarkers();
        scheduleGridUpdate();
        updateInspectorSnapshot();
        if (initialLat !== undefined && initialLon !== undefined) {
          flyTo(initialLat, initialLon, initialZoom ?? undefined);
        }
      });

      viewer.addHandler("canvas-double-click", async (event: any) => {
        event.originalEvent.preventDefault();
        event.originalEvent.stopPropagation();

        if (!projectionContext || !imageDimensions) return;

        const viewportPoint = viewer!.viewport.pointFromPixel(event.position);
        const osdPoint = viewer!.viewport.viewportToImageCoordinates(
          viewportPoint
        );
        const geo = pixelToLatLon(
          osdPoint.x,
          osdPoint.y,
          projectionContext,
          imageDimensions,
          { targetConvention: "east-180" }
        );

        const features = await loadFeaturesForBody(body);
        let best: GazetteerFeature | null = null;
        let bestDistance = Infinity;
        for (const feature of features) {
          const distance = haversineDistanceKm(
            geo.lat,
            geo.lon,
            feature.lat,
            feature.lon
          );
          if (distance < bestDistance) {
            best = feature;
            bestDistance = distance;
          }
        }

        if (best) {
          flyTo(best.lat, best.lon, undefined, best.name);
          onFeatureSelected?.({
            name: best.name,
            lat: best.lat,
            lon: best.lon,
            category: best.type,
            diameter_km: best.diameter_km ?? undefined,
            body: best.body,
          });
        } else {
          flyTo(geo.lat, geo.lon);
        }
      });

      viewer.addHandler("animation", () => {
        scheduleGridUpdate();
        updateInspectorSnapshot();
      });

      viewer.addHandler("animation-finish", () => {
        scheduleGridUpdate();
        updateInspectorSnapshot();
      });

      viewer.addHandler("resize", () => {
        scheduleGridUpdate();
        updateInspectorSnapshot();
      });
    }

    setupViewer();

    return () => {
      cancelled = true;
      setViewerReady(false);
      if (viewer) {
        viewer.destroy();
      }
      viewerRef.current = null;
      removeGridCanvas();
      clearReferenceMarkers();
      clearHighlight();
    };
  }, [
    baseDataset,
    body,
    osdToolbarVisible,
    initialLat,
    initialLon,
    initialZoom,
    scheduleGridUpdate,
    renderReferenceMarkers,
    updateInspectorSnapshot,
    flyTo,
    removeGridCanvas,
    clearReferenceMarkers,
    clearHighlight,
    projectionContext,
    imageDimensions,
    onFeatureSelected,
  ]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (
      !viewer ||
      !splitViewEnabled ||
      !splitDataset ||
      !splitCompatible ||
      !splitContainerRef.current
    ) {
      if (splitViewerRef.current) {
        splitViewerRef.current.destroy();
        splitViewerRef.current = null;
      }
      return;
    }

    let cancelled = false;

    async function setupSplitViewer() {
      if (!viewer) return; // Guard against null viewer
      
      const osdImport = await import("openseadragon");
      if (cancelled) return;
      const OSD = (osdImport.default ?? osdImport) as OpenSeadragonModule;

      if (splitViewerRef.current) {
        splitViewerRef.current.destroy();
        splitViewerRef.current = null;
      }

      const compareViewer = new OSD.Viewer({
        element: splitContainerRef.current!,
        prefixUrl: TILE_PREFIX,
        tileSources: [createTileSource(splitDataset!)],
        showNavigator: false,
        showZoomControl: false,
        showHomeControl: false,
        showFullPageControl: false,
        gestureSettingsMouse: { clickToZoom: false },
        minZoomImageRatio: 0.8,
        maxZoomPixelRatio: 2.5,
        wrapHorizontal: true,
        immediateRender: true,
        visibilityRatio: 0.5,
      });

      splitViewerRef.current = compareViewer;

      const sync = () => {
        if (!splitViewerRef.current || !viewerRef.current) return;
        splitViewerRef.current.viewport.zoomTo(
          viewerRef.current.viewport.getZoom()
        );
        splitViewerRef.current.viewport.panTo(
          viewerRef.current.viewport.getCenter()
        );
      };

      const mainViewer = viewerRef.current;
      if (!mainViewer) return;
      
      mainViewer.addHandler("animation", sync);
      compareViewer.addHandler("animation", () => {
        if (!viewerRef.current) return;
        viewerRef.current.viewport.zoomTo(
          compareViewer.viewport.getZoom(),
          undefined,
          false
        );
        viewerRef.current.viewport.panTo(
          compareViewer.viewport.getCenter(),
          false
        );
      });
    }

    setupSplitViewer();

    return () => {
      cancelled = true;
      if (splitViewerRef.current) {
        splitViewerRef.current.destroy();
        splitViewerRef.current = null;
      }
    };
  }, [splitViewEnabled, splitDataset, splitCompatible]);

  useEffect(() => {
    if (!gridOverlayEnabled) {
      removeGridCanvas();
      return;
    }
    scheduleGridUpdate();
  }, [
    gridOverlayEnabled,
    lonConvention,
    projectionDebugEnabled,
    baseDataset?.id,
    scheduleGridUpdate,
    removeGridCanvas,
  ]);

  useEffect(() => {
    if (!referenceFeaturesEnabled) {
      clearReferenceMarkers();
      return;
    }
    renderReferenceMarkers();
  }, [
    referenceFeaturesEnabled,
    renderReferenceMarkers,
    clearReferenceMarkers,
    baseDataset?.id,
  ]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (!hiResDatasetId) {
      if (hiResImageRef.current) {
        viewer.world.removeItem(hiResImageRef.current);
        hiResImageRef.current = null;
      }
      return;
    }

    const dataset = getDatasetById(hiResDatasetId);
    if (!dataset) return;

    viewer.addTiledImage({
      tileSource: createTileSource(dataset),
      opacity: 0.45,
      success: (event: any) => {
        hiResImageRef.current = event.item;
        event.item.setOpacity(0.45);
      },
    });

    return () => {
      if (hiResImageRef.current) {
        viewer.world.removeItem(hiResImageRef.current);
        hiResImageRef.current = null;
      }
    };
  }, [hiResDatasetId, baseDataset?.id]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (!elevationDatasetId) {
      if (elevationImageRef.current) {
        viewer.world.removeItem(elevationImageRef.current);
        elevationImageRef.current = null;
      }
      return;
    }
    const dataset = getDatasetById(elevationDatasetId);
    if (!dataset) return;
    viewer.addTiledImage({
      tileSource: createTileSource(dataset),
      opacity: 0.6,
      success: (event: any) => {
        elevationImageRef.current = event.item;
        event.item.setOpacity(0.6);
      },
    });
    return () => {
      if (elevationImageRef.current) {
        viewer.world.removeItem(elevationImageRef.current);
        elevationImageRef.current = null;
      }
    };
  }, [elevationDatasetId, baseDataset?.id]);

  useEffect(() => {
    if (initialLat !== undefined && initialLon !== undefined) {
      flyTo(initialLat, initialLon, initialZoom ?? undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLat, initialLon]);

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className={
          splitViewEnabled && splitCompatible
            ? "absolute left-0 top-0 h-full w-1/2"
            : "absolute inset-0"
        }
      />
      {splitViewEnabled && splitCompatible && (
        <div
          ref={splitContainerRef}
          className="absolute right-0 top-0 h-full w-1/2"
        />
      )}
      <div
        ref={overlayContainerRef}
        className="pointer-events-none absolute inset-0"
      />
      {stateInspectorEnabled && (
        <div className="absolute bottom-4 left-4 z-50 rounded-lg bg-black/70 px-3 py-2 text-xs text-white/80 backdrop-blur">
          <div className="font-semibold text-white">Map Inspector</div>
          <div>Ready: {inspectorData.ready ? "yes" : "no"}</div>
          <div>
            Center: {inspectorData.centerLat.toFixed(2)} deg,{" "}
            {inspectorData.centerLon.toFixed(2)} deg
          </div>
          <div>Zoom: {inspectorData.zoom.toFixed(2)}</div>
          <div>Overlays: {inspectorData.overlays}</div>
          <div>Split active: {inspectorData.splitActive ? "yes" : "no"}</div>
        </div>
      )}
      {splitViewEnabled && !splitCompatible && (
        <div className="absolute top-4 left-1/2 z-50 -translate-x-1/2 rounded bg-red-600/80 px-4 py-2 text-xs font-semibold text-white shadow">
          Incompatible split layer: {splitLayerId}
        </div>
      )}
    </div>
  );
}
