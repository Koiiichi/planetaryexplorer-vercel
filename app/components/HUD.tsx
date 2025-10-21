"use client";

import { ZoomIn, ZoomOut, Circle, Moon } from "lucide-react";

interface HUDProps {
  selectedBody: string;
  onBodyChange?: (body: string) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  showBodySelector?: boolean;
  showZoomControls?: boolean;
}

export default function HUD({
  selectedBody,
  onBodyChange,
  onZoomIn,
  onZoomOut,
  showBodySelector = true,
  showZoomControls = true,
}: HUDProps) {
  const getBodyIcon = (body: string) => {
    switch (body.toLowerCase()) {
      case "moon":
        return <Moon size={16} />;
      case "mars":
        return <Circle size={16} fill="currentColor" className="text-red-400" />;
      case "mercury":
        return <Circle size={16} className="text-gray-400" />;
      default:
        return <Circle size={16} />;
    }
  };

  const getBodyColor = (body: string) => {
    switch (body.toLowerCase()) {
      case "moon":
        return "text-blue-400";
      case "mars":
        return "text-red-400";
      case "mercury":
        return "text-gray-400";
      default:
        return "text-white";
    }
  };

  return (
    <div className="fixed top-6 right-6 z-50 flex flex-col gap-3">
      {showBodySelector && (
        <div className="glass-bar flex items-center gap-2">
          {["Moon", "Mars", "Mercury"].map((body) => (
            <button
              key={body}
              onClick={() => onBodyChange?.(body.toLowerCase())}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${
                selectedBody.toLowerCase() === body.toLowerCase()
                  ? `bg-white/20 ${getBodyColor(body)} font-medium`
                  : "text-white/60 hover:text-white/90 hover:bg-white/10"
              }`}
              title={body}
            >
              {getBodyIcon(body)}
              <span className="text-sm">{body}</span>
            </button>
          ))}
        </div>
      )}

      {showZoomControls && (
        <div className="glass-bar flex flex-col gap-2">
          <button
            onClick={onZoomIn}
            className="text-white/70 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg"
            title="Zoom in"
          >
            <ZoomIn size={20} />
          </button>
          <div className="h-px bg-white/20" />
          <button
            onClick={onZoomOut}
            className="text-white/70 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg"
            title="Zoom out"
          >
            <ZoomOut size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
