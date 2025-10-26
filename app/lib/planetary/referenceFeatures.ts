import { PlanetaryBodyKey } from "./constants";

export interface ReferenceFeature {
  id: string;
  name: string;
  lat: number;
  lon: number;
  type: string;
  diameterKm?: number;
}

export const REFERENCE_FEATURES: Record<PlanetaryBodyKey, ReferenceFeature[]> = {
  moon: [
    { id: "moon-tycho", name: "Tycho", lat: -43.3, lon: -11.2, type: "Crater", diameterKm: 85 },
    { id: "moon-clavius", name: "Clavius", lat: -58.8, lon: -14.4, type: "Crater", diameterKm: 231 },
    { id: "moon-copernicus", name: "Copernicus", lat: 9.7, lon: -20.1, type: "Crater", diameterKm: 93 },
    { id: "moon-apollo11", name: "Tranquility Base", lat: 0.67408, lon: 23.47297, type: "Landing Site" },
    { id: "moon-aristarchus", name: "Aristarchus", lat: 23.7, lon: -47.5, type: "Crater", diameterKm: 40 },
  ],
  mars: [
    { id: "mars-olympus", name: "Olympus Mons", lat: 18.65, lon: -133.8, type: "Mons", diameterKm: 600 },
    { id: "mars-gale", name: "Gale", lat: -5.4, lon: 137.8, type: "Crater", diameterKm: 154 },
    { id: "mars-valles", name: "Valles Marineris (central)", lat: -14.6, lon: -59.3, type: "Valles" },
    { id: "mars-jezero", name: "Jezero", lat: 18.38, lon: 77.58, type: "Crater", diameterKm: 49 },
    { id: "mars-hellas", name: "Hellas Planitia", lat: -42.4, lon: 70.5, type: "Planitia", diameterKm: 2300 },
  ],
  mercury: [
    { id: "mercury-caloris", name: "Caloris Planitia", lat: 30, lon: -160, type: "Planitia", diameterKm: 1525 },
    { id: "mercury-messenger", name: "MESSENGER Impact Site", lat: 54.4, lon: -149.9, type: "Landing Site" },
    { id: "mercury-raden", name: "Raden Crater", lat: -21, lon: -132.5, type: "Crater", diameterKm: 90 },
    { id: "mercury-kuiper", name: "Kuiper", lat: -11.4, lon: -54.0, type: "Crater", diameterKm: 62 },
    { id: "mercury-beethoven", name: "Beethoven", lat: -20.8, lon: -123.2, type: "Basin", diameterKm: 630 },
  ],
  ceres: [
    { id: "ceres-occator", name: "Occator", lat: 20, lon: 121, type: "Crater", diameterKm: 92 },
    { id: "ceres-ahuna", name: "Ahuna Mons", lat: -10.5, lon: -43.7, type: "Mons", diameterKm: 21 },
    { id: "ceres-urvara", name: "Urvara", lat: -45.7, lon: -110.4, type: "Crater", diameterKm: 163 },
  ],
  vesta: [
    { id: "vesta-rheasilvia", name: "Rheasilvia", lat: -75, lon: -59, type: "Basin", diameterKm: 500 },
    { id: "vesta-vinalia", name: "Vinalia Faculae", lat: 20.4, lon: 170, type: "Facula" },
    { id: "vesta-matul", name: "Matul Crater", lat: -26.4, lon: 161.1, type: "Crater" },
  ],
};

export function getReferenceFeatures(body: PlanetaryBodyKey): ReferenceFeature[] {
  return REFERENCE_FEATURES[body] ?? [];
}
