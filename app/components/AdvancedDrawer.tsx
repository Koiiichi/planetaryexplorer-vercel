"use client";

import { useState, useEffect } from "react";
import { Settings, X, Layers, Square } from "lucide-react";

interface AdvancedDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onDatasetChange?: (dataset: string) => void;
  onSplitViewToggle?: (enabled: boolean) => void;
  onOsdToolbarToggle?: (visible: boolean) => void;
  currentDataset?: string;
  splitViewEnabled?: boolean;
  osdToolbarVisible?: boolean;
}

export default function AdvancedDrawer({
  isOpen,
  onClose,
  onDatasetChange,
  onSplitViewToggle,
  onOsdToolbarToggle,
  currentDataset = "default",
  splitViewEnabled = false,
  osdToolbarVisible = false,
}: AdvancedDrawerProps) {
  const [localDataset, setLocalDataset] = useState(currentDataset);
  const [localSplitView, setLocalSplitView] = useState(splitViewEnabled);
  const [localOsdToolbar, setLocalOsdToolbar] = useState(osdToolbarVisible);

  useEffect(() => {
    if (isOpen) {
      setLocalDataset(currentDataset);
      setLocalSplitView(splitViewEnabled);
      setLocalOsdToolbar(osdToolbarVisible);
    }
  }, [isOpen, currentDataset, splitViewEnabled, osdToolbarVisible]);

  if (!isOpen) return null;

  const datasets = [
    { id: "lro_wac_global", name: "LRO WAC Global Mosaic", body: "moon" },
    { id: "lro_wac_hybrid", name: "LRO WAC + Hillshade", body: "moon" },
    { id: "mdim21_global", name: "Mars MDIM 2.1", body: "mars" },
    { id: "mola_shaded", name: "Mars MOLA Shaded Relief", body: "mars" },
    { id: "messenger_global", name: "MESSENGER MDIS Global", body: "mercury" },
    { id: "messenger_enhanced", name: "MESSENGER Enhanced Color", body: "mercury" },
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

  const handleOsdToolbarToggle = () => {
    const newValue = !localOsdToolbar;
    setLocalOsdToolbar(newValue);
    onOsdToolbarToggle?.(newValue);
  };

  return (
    <div className="fixed right-6 bottom-6 w-full md:w-[360px] max-h-[70vh] overflow-y-auto glass-card z-50">
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

      <div className="space-y-4">
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
        </div>

        {/* OSD Toolbar Visibility */}
        <div>
          <div className="flex items-center justify-between py-2 px-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
            <div className="flex items-center gap-2 text-white/90">
              <Settings size={16} />
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

        <div className="pt-2 border-t border-white/10">
          <p className="text-white/60 text-xs">
            These settings control advanced visualization features. Changes are saved automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
