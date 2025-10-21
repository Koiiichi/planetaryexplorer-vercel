"use client";

import { MapPin } from "lucide-react";

interface PinProps {
  lat: number;
  lon: number;
  body: string;
  name?: string;
  diameter_km?: number;
  onClick?: () => void;
}

// Body radii in km
const BODY_RADII: Record<string, number> = {
  moon: 1737.4,
  mars: 3389.5,
  mercury: 2439.7,
};

export default function Pin({ lat, lon, body, name, diameter_km, onClick }: PinProps) {
  const showCraterHighlight = diameter_km && diameter_km > 0;

  // Calculate approximate circle radius in degrees
  const getCircleRadiusDeg = (): number | null => {
    if (!diameter_km || !BODY_RADII[body.toLowerCase()]) return null;

    const bodyRadius = BODY_RADII[body.toLowerCase()];
    const craterRadiusKm = diameter_km / 2;

    // Degrees per km at equator
    const degPerKmLat = 360 / (2 * Math.PI * bodyRadius);

    // Adjust for latitude (longitude degrees compress near poles)
    const latRad = (lat * Math.PI) / 180;
    const degPerKmLon = degPerKmLat / Math.cos(latRad);

    // Use average for approximate circle
    const avgDegPerKm = (degPerKmLat + degPerKmLon) / 2;
    return craterRadiusKm * avgDegPerKm;
  };

  const circleRadiusDeg = getCircleRadiusDeg();

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-full cursor-pointer z-10"
      style={{
        left: `${((lon + 180) / 360) * 100}%`,
        top: `${((90 - lat) / 180) * 100}%`,
      }}
      onClick={onClick}
    >
      {/* Crater highlight circle (if size known) */}
      {showCraterHighlight && circleRadiusDeg && (
        <div
          className="absolute left-1/2 top-full -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-400/60 bg-blue-400/10 pointer-events-none"
          style={{
            // Convert deg to approximate pixels (rough estimate, OSD handles actual projection)
            width: `${circleRadiusDeg * 100}px`,
            height: `${circleRadiusDeg * 100}px`,
          }}
        />
      )}

      {/* Pin icon with ripple */}
      <div className="relative">
        <div className="absolute inset-0 -m-2 rounded-full bg-blue-400/30 animate-ping" 
             style={{ animationDuration: '2s' }} />
        <MapPin 
          size={32} 
          className="text-blue-400 drop-shadow-lg relative z-10" 
          fill="currentColor"
          strokeWidth={1.5}
        />
      </div>

      {/* Label tooltip */}
      {name && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 bg-black/80 text-white text-xs rounded whitespace-nowrap pointer-events-none">
          {name}
        </div>
      )}
    </div>
  );
}
