"use client";

import React from 'react';
import { X, MapPin, Globe, Ruler } from 'lucide-react';

interface InfoPanelProps {
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
}

export default function InfoPanel({ isOpen, onClose, feature }: InfoPanelProps) {
  if (!isOpen || !feature) return null;

  return (
    <div className="fixed top-4 right-4 w-80 bg-gray-900/95 backdrop-blur-xl rounded-lg border border-white/20 shadow-2xl z-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <h3 className="text-white font-semibold text-lg truncate">{feature.name}</h3>
        <button
          onClick={onClose}
          className="text-white/60 hover:text-white transition-colors p-1 hover:bg-white/10 rounded"
        >
          <X size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Location Info */}
        <div className="flex items-center gap-2 text-white/80">
          <Globe size={16} />
          <span className="capitalize font-medium">{feature.body}</span>
        </div>

        {/* Coordinates */}
        <div className="flex items-center gap-2 text-white/80">
          <MapPin size={16} />
          <span className="font-mono text-sm">
            {feature.lat.toFixed(4)}°, {feature.lon.toFixed(4)}°
          </span>
        </div>

        {/* Category */}
        {feature.category && (
          <div className="text-white/80">
            <span className="text-white/60">Type: </span>
            {feature.category}
          </div>
        )}

        {/* Diameter */}
        {feature.diameter_km && (
          <div className="flex items-center gap-2 text-white/80">
            <Ruler size={16} />
            <span>{feature.diameter_km.toFixed(1)} km diameter</span>
          </div>
        )}

        {/* Keywords/Tags */}
        {feature.keywords && feature.keywords.length > 0 && (
          <div className="space-y-1">
            <div className="text-white/60 text-sm">Tags:</div>
            <div className="flex flex-wrap gap-1">
              {feature.keywords.slice(0, 5).map((keyword, index) => (
                <span
                  key={index}
                  className="px-2 py-1 bg-white/10 text-white/80 text-xs rounded-full"
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-2 border-t border-white/10">
          <button
            onClick={() => {
              const coords = `${feature.lat.toFixed(6)},${feature.lon.toFixed(6)}`;
              navigator.clipboard.writeText(coords);
            }}
            className="w-full text-sm bg-white/10 hover:bg-white/20 text-white/80 hover:text-white px-3 py-2 rounded transition-colors"
          >
            Copy Coordinates
          </button>
        </div>
      </div>
    </div>
  );
}