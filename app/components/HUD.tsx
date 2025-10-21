"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ZoomIn, ZoomOut, Circle, Moon, Home, Settings } from "lucide-react";

interface HUDProps {
  selectedBody: string;
  onBodyChange?: (body: string) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  showBodySelector?: boolean;
  showZoomControls?: boolean;
  showHomeButton?: boolean;
  showAdvancedButton?: boolean;
  onAdvancedToggle?: () => void;
  advancedOpen?: boolean;
}

export default function HUD({
  selectedBody,
  onBodyChange,
  onZoomIn,
  onZoomOut,
  showBodySelector = true,
  showZoomControls = true,
  showHomeButton = true,
  showAdvancedButton = true,
  onAdvancedToggle,
  advancedOpen = false,
}: HUDProps) {
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'h' || e.key === 'H') {
        // Only trigger if not in an input field
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          router.push('/');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);
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
      {/* Home button - top left */}
      {showHomeButton && (
        <div className="fixed top-6 left-6 z-50">
          <button
            onClick={() => router.push('/')}
            className="glass-bar flex items-center gap-2 px-4 py-2 text-white/70 hover:text-white transition-all hover:bg-white/15"
            title="Home (H)"
          >
            <Home size={18} />
            <span className="text-sm font-medium">Home</span>
          </button>
        </div>
      )}

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

      {/* Advanced settings toggle */}
      {showAdvancedButton && (
        <button
          onClick={onAdvancedToggle}
          className={`glass-bar flex items-center gap-2 px-4 py-2 transition-all ${
            advancedOpen
              ? "bg-white/20 text-white"
              : "text-white/70 hover:text-white hover:bg-white/15"
          }`}
          title="Advanced Settings"
        >
          <Settings size={18} />
          <span className="text-sm font-medium">Advanced</span>
        </button>
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
