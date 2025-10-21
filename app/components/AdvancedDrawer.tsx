"use client";

import { useState, useEffect } from "react";
import { Settings, X, Layers, Square, Eye } from "lucide-react";

interface AdvancedDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onDatasetChange?: (dataset: string) => void;
  onSplitViewToggle?: (enabled: boolean) => void;
  onSplitLayerChange?: (layerId: string) => void;
  onOsdToolbarToggle?: (visible: boolean) => void;
  currentDataset?: string;
  currentBody?: string;
  splitViewEnabled?: boolean;
  splitLayerId?: string;
  osdToolbarVisible?: boolean;
}

export default function AdvancedDrawer({
  isOpen,
  onClose,
  onDatasetChange,
  onSplitViewToggle,
  onSplitLayerChange,
  onOsdToolbarToggle,
  currentDataset = "default",
  currentBody = "moon",
  splitViewEnabled = false,
  splitLayerId = "",
  osdToolbarVisible = false,
}: AdvancedDrawerProps) {
  const [localDataset, setLocalDataset] = useState(currentDataset);
  const [localSplitView, setLocalSplitView] = useState(splitViewEnabled);
  const [localSplitLayer, setLocalSplitLayer] = useState(splitLayerId);
  const [localOsdToolbar, setLocalOsdToolbar] = useState(osdToolbarVisible);

  useEffect(() => {
    if (isOpen) {
      setLocalDataset(currentDataset);
      setLocalSplitView(splitViewEnabled);
      setLocalSplitLayer(splitLayerId);
      setLocalOsdToolbar(osdToolbarVisible);
    }
  }, [isOpen, currentDataset, splitViewEnabled, splitLayerId, osdToolbarVisible]);

  if (!isOpen) return null;

  // Layer definitions by body
  const layersByBody: Record<string, Array<{ id: string; name: string; type: "base" | "overlay" }>> = {
    moon: [
      { id: "lro_wac_global", name: "LRO WAC Global Mosaic", type: "base" },
      { id: "lro_nac_apollo", name: "LRO NAC Apollo Sites", type: "base" },
      { id: "lro_lola_elevation", name: "LOLA Elevation", type: "overlay" },
      { id: "lro_diviner_rock", name: "Diviner Rock Abundance", type: "overlay" },
      { id: "grail_gravity", name: "GRAIL Gravity Field", type: "overlay" },
    ],
    mars: [
      { id: "mars_mgs_mola", name: "MGS MOLA Shaded Relief", type: "base" },
      { id: "mars_viking_mosaic", name: "Viking MDIM 2.1", type: "base" },
      { id: "mars_hirise", name: "HiRISE High Resolution", type: "overlay" },
      { id: "mars_ctx_mosaic", name: "CTX Global Mosaic", type: "overlay" },
      { id: "mars_thermal_inertia", name: "TES Thermal Inertia", type: "overlay" },
    ],
    mercury: [
      { id: "messenger_mdis_basemap", name: "MESSENGER MDIS Basemap", type: "base" },
      { id: "messenger_global_mosaic", name: "MESSENGER Global Mosaic", type: "base" },
      { id: "messenger_bdr", name: "MESSENGER BDR Mosaic", type: "base" },
      { id: "messenger_elevation", name: "MLA Elevation Model", type: "overlay" },
      { id: "messenger_slope", name: "MLA Slope Map", type: "overlay" },
    ],
    earth: [
      { id: "openstreetmap", name: "OpenStreetMap", type: "base" },
      { id: "satellite_arcgis", name: "ArcGIS World Imagery", type: "base" },
      { id: "terrain_arcgis", name: "ArcGIS Terrain", type: "base" },
    ],
  };

  const availableLayers = layersByBody[currentBody] || [];

  const datasets = [
    { id: "moon:lro_wac_global", name: "LRO WAC Global Mosaic", body: "moon" },
    { id: "moon:lro_nac_apollo", name: "LRO NAC Apollo Sites", body: "moon" },
    { id: "mars:mars_mgs_mola", name: "Mars MOLA Shaded Relief", body: "mars" },
    { id: "mars:mars_viking_mosaic", name: "Mars Viking MDIM 2.1", body: "mars" },
    { id: "mercury:messenger_mdis_basemap", name: "MESSENGER MDIS Basemap", body: "mercury" },
    { id: "mercury:messenger_global_mosaic", name: "MESSENGER Global Mosaic", body: "mercury" },
  ];

  const handleDatasetChange = (datasetId: string) => {
    setLocalDataset(datasetId);
    onDatasetChange?.(datasetId);
  };

  const handleSplitViewToggle = () => {
    const newValue = !localSplitView;
    setLocalSplitView(newValue);
    onSplitViewToggle?.(newValue);
  };

  const handleSplitLayerChange = (layerId: string) => {
    setLocalSplitLayer(layerId);
    onSplitLayerChange?.(layerId);
  };

  const handleOsdToolbarToggle = () => {
    const newValue = !localOsdToolbar;
    setLocalOsdToolbar(newValue);
    onOsdToolbarToggle?.(newValue);
  };

  return (
    <div className="fixed left-6 bottom-6 w-full md:w-[360px] max-h-[70vh] glass-card z-50">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Settings size={20} className="text-white/90" />
          <h3 className="text-white font-semibold text-lg">Advanced Settings</h3>
        </div>
        <button
          onClick={onClose}
          className="text-white/60 hover:text-white transition-colors p-1.5 hover:bg-white/10 rounded-lg"
          title="Close"
        >
          <X size={20} />
        </button>
      </div>

      <div className="space-y-4 overflow-y-auto max-h-[calc(70vh-100px)]">
        {/* Dataset Chooser */}
        <div>
          <div className="flex items-center gap-2 text-white/90 mb-2">
            <Layers size={16} />
            <span className="text-sm font-medium">Base Layer</span>
          </div>
          <div className="space-y-1">
            {datasets.map((dataset) => (
              <button
                key={dataset.id}
                onClick={() => handleDatasetChange(dataset.id)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                  localDataset === dataset.id
                    ? "bg-white/20 text-white"
                    : "bg-white/5 hover:bg-white/10 text-white/80"
                }`}
              >
                <div className="font-medium text-sm">{dataset.name}</div>
                <div className="text-xs text-white/60 capitalize">{dataset.body}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Split View Control */}
        <div>
          <div className="flex items-center justify-between py-2 px-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
            <div className="flex items-center gap-2 text-white/90">
              <Square size={16} />
              <span className="text-sm font-medium">Split View</span>
            </div>
            <button
              onClick={handleSplitViewToggle}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                localSplitView ? "bg-blue-500" : "bg-white/20"
              }`}
              aria-label="Toggle split view"
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  localSplitView ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>

          {/* Split View Layer Selection */}
          {localSplitView && availableLayers.length > 0 && (
            <div className="mt-2 pl-2">
              <div className="text-xs text-white/70 mb-2">Compare Layer:</div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {availableLayers.map((layer) => (
                  <button
                    key={layer.id}
                    onClick={() => handleSplitLayerChange(layer.id)}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                      localSplitLayer === layer.id
                        ? "bg-blue-500/30 text-white"
                        : "bg-white/5 hover:bg-white/10 text-white/70"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{layer.name}</span>
                      <span className="text-[10px] text-white/50 uppercase">{layer.type}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* OSD Toolbar Visibility */}
        <div>
          <div className="flex items-center justify-between py-2 px-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
            <div className="flex items-center gap-2 text-white/90">
              <Eye size={16} />
              <span className="text-sm font-medium">OSD Toolbar</span>
            </div>
            <button
              onClick={handleOsdToolbarToggle}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                localOsdToolbar ? "bg-blue-500" : "bg-white/20"
              }`}
              aria-label="Toggle OSD toolbar"
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  localOsdToolbar ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
