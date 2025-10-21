"use client";

import { X, MapPin, Globe, Ruler, CheckCircle, Copy } from "lucide-react";
import { useState } from "react";

interface ResultCardProps {
  isOpen: boolean;
  onClose: () => void;
  feature: {
    name: string;
    body: string;
    lat: number;
    lon: number;
    category?: string;
    diameter_km?: number;
    keywords?: string[];
  } | null;
  provider?: string;
  aiDescription?: string;
}

export default function ResultCard({
  isOpen,
  onClose,
  feature,
  provider,
  aiDescription,
}: ResultCardProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !feature) return null;

  const handleCopyCoordinates = () => {
    const coords = `${feature.lat.toFixed(4)}, ${feature.lon.toFixed(4)}`;
    navigator.clipboard.writeText(coords);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed right-6 top-[88px] w-full md:w-[360px] bottom-6 md:bottom-auto md:max-h-[calc(100vh-120px)] overflow-y-auto glass-card z-40">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-xl mb-1 break-words">{feature.name}</h3>
          {provider === "fact" && (
            <div className="flex items-center gap-1.5 text-xs text-green-400">
              <CheckCircle size={14} />
              <span>Verified</span>
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-white/60 hover:text-white transition-colors p-1.5 hover:bg-white/10 rounded-lg flex-shrink-0 ml-2"
          title="Close"
        >
          <X size={20} />
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-white/90">
          <Globe size={18} className="flex-shrink-0" />
          <span className="capitalize font-medium">{feature.body}</span>
        </div>

        <div className="flex items-start gap-2 text-white/90">
          <MapPin size={18} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-mono text-sm break-all">
              {feature.lat.toFixed(4)}°, {feature.lon.toFixed(4)}°
            </div>
            <button
              onClick={handleCopyCoordinates}
              className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white/90 mt-1 transition-colors"
            >
              <Copy size={12} />
              {copied ? "Copied!" : "Copy coordinates"}
            </button>
          </div>
        </div>

        {feature.category && (
          <div className="text-white/80 text-sm">
            <span className="text-white/60">Type: </span>
            <span className="capitalize">{feature.category}</span>
          </div>
        )}

        {feature.diameter_km && (
          <div className="flex items-center gap-2 text-white/80 text-sm">
            <Ruler size={16} className="flex-shrink-0" />
            <span>{feature.diameter_km.toFixed(1)} km diameter</span>
          </div>
        )}

        {aiDescription && (
          <div className="pt-3 border-t border-white/10">
            <div className="text-white/60 text-xs mb-2 uppercase tracking-wide">About</div>
            <p className="text-white/90 text-sm leading-relaxed" data-pe-ai-desc>
              {aiDescription}
            </p>
          </div>
        )}

        {feature.keywords && feature.keywords.length > 0 && (
          <div className="pt-3 border-t border-white/10">
            <div className="text-white/60 text-xs mb-2">Tags</div>
            <div className="flex flex-wrap gap-1.5">
              {feature.keywords.slice(0, 8).map((keyword, index) => (
                <span
                  key={index}
                  className="px-2.5 py-1 bg-white/10 text-white/80 text-xs rounded-full"
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
