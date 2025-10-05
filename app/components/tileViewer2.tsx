"use client";

import React, { useEffect, useRef, useState } from "react";
import OpenSeadragon from "openseadragon";

// Define the available datasets
const datasets = {
  Moon: {
    name: "Moon",
    maxZoom: 3, // maximum zoom level in NASA tiles
    rows: 4,
    cols: 4,
    urlPattern: (row: number, col: number, zoom: number) =>
      `https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/${zoom}/${row}/${col}.jpg`,
  },
  Mars: {
    name: "Mars",
    maxZoom: 6,
    rows: 4,
    cols: 8,
    urlPattern: (row: number, col: number, zoom: number) =>
      `https://trek.nasa.gov/tiles/Mars/EQ/Mars_MRO_Mosaic_Global_1024ppd_v01/1.0.0/default/default028mm/${zoom}/${row}/${col}.jpg`,
  },
  Mercury: {
    name: "Mercury",
    maxZoom: 5,
    rows: 4,
    cols: 8,
    urlPattern: (row: number, col: number, zoom: number) =>
      `https://trek.nasa.gov/tiles/Mercury/EQ/Mercury_MESSENGER_Mosaic_Global_v01/1.0.0/default/default028mm/${zoom}/${row}/${col}.jpg`,
  },
};

const TileViewer = () => {
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [selectedBody, setSelectedBody] = useState("Moon");
  const [zoomLevel, setZoomLevel] = useState(0); // default zoom
  const [viewer, setViewer] = useState<OpenSeadragon.Viewer | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Reinitialize viewer whenever selectedBody or zoomLevel changes
  useEffect(() => {
    if (!isClient || !viewerRef.current) return;

    if (viewer) {
      viewer.destroy();
    }

    const dataset = datasets[selectedBody as keyof typeof datasets];

    // Ensure zoomLevel doesn't exceed dataset maxZoom
    const clampedZoom = Math.min(zoomLevel, dataset.maxZoom);

    const tileSources = [];
    for (let row = 0; row < 2**clampedZoom; row++) {
      for (let col = 0; col < 2**(clampedZoom + 1); col++) {
        tileSources.push({
          type: "image",
          url: dataset.urlPattern(row, col, clampedZoom),
        } as any);
      }
    }

    const newViewer = OpenSeadragon({
      element: viewerRef.current,
      prefixUrl:
        "https://cdn.jsdelivr.net/npm/openseadragon@latest/build/openseadragon/images/",
      collectionMode: true,
      collectionRows: 2**clampedZoom,
      collectionColumns: 2**(clampedZoom + 1),
      collectionTileSize: 1024,
      collectionTileMargin: -1,
      maxZoomPixelRatio: 10,
      tileSources,
    });

    setViewer(newViewer);

    return () => {
      newViewer.destroy();
    };
  }, [isClient, selectedBody, zoomLevel]);

  if (!isClient) return <div>Loading...</div>;

  return (
    <div>
      {/* Controls */}
      <div style={{ marginBottom: "10px" }}>
        <label style={{ marginRight: "10px" }}>Select Celestial Body:</label>
        <select
          value={selectedBody}
          onChange={(e) => {
            setSelectedBody(e.target.value);
            setZoomLevel(1); // reset zoom on planet change
          }}
        >
          {Object.keys(datasets).map((body) => (
            <option key={body} value={body}>
              {body}
            </option>
          ))}
        </select>

        <label style={{ margin: "0 10px" }}>Zoom Level:</label>
        <input
          type="number"
          min={0}
          max={datasets[selectedBody as keyof typeof datasets].maxZoom}
          value={zoomLevel}
          onChange={(e) => setZoomLevel(Number(e.target.value))}
        />
      </div>

      {/* Viewer */}
      <div ref={viewerRef} style={{ width: "100%", height: "800px" }} />
    </div>
  );
};

export default TileViewer;
