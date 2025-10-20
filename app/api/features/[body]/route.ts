import { NextRequest, NextResponse } from 'next/server';

interface Feature {
  name: string;
  lat: number;
  lon: number;
  type: string;
  confidence: number;
  diameter_km?: number;
  origin?: string;
}

// Mock feature database organized by body
const FEATURES_BY_BODY: Record<string, Feature[]> = {
  moon: [
    { name: 'Tycho', lat: -43.31, lon: -11.36, type: 'crater', confidence: 0.9, diameter_km: 85 },
    { name: 'Copernicus', lat: 9.62, lon: -20.08, type: 'crater', confidence: 0.9, diameter_km: 93 },
    { name: 'Aristarchus', lat: 23.73, lon: -47.49, type: 'crater', confidence: 0.8, diameter_km: 40 },
    { name: 'Mare Tranquillitatis', lat: 8.35, lon: 31.11, type: 'mare', confidence: 0.9 },
    { name: 'Apollo 11 Landing Site', lat: 0.67, lon: 23.47, type: 'landing_site', confidence: 0.95 },
    { name: 'Mons Huygens', lat: 20.0, lon: -2.0, type: 'mountain', confidence: 0.8 },
    { name: 'Vallis Alpes', lat: 48.5, lon: 3.0, type: 'valley', confidence: 0.7 },
    { name: 'Rima Hadley', lat: 25.0, lon: 3.0, type: 'rille', confidence: 0.7 }
  ],
  mars: [
    { name: 'Olympus Mons', lat: 18.65, lon: -133.8, type: 'volcano', confidence: 0.95, diameter_km: 624 },
    { name: 'Valles Marineris', lat: -13.9, lon: -59.2, type: 'canyon', confidence: 0.9 },
    { name: 'Gale Crater', lat: -4.5, lon: 137.4, type: 'crater', confidence: 0.9, diameter_km: 154 },
    { name: 'Tharsis Montes', lat: 1.0, lon: -112.0, type: 'volcanoes', confidence: 0.8 },
    { name: 'Arsia Mons', lat: -8.35, lon: -120.09, type: 'volcano', confidence: 0.8, diameter_km: 430 },
    { name: 'Pavonis Mons', lat: 0.8, lon: -113.4, type: 'volcano', confidence: 0.8, diameter_km: 375 },
    { name: 'Ascraeus Mons', lat: 11.8, lon: -104.5, type: 'volcano', confidence: 0.8, diameter_km: 460 },
    { name: 'Elysium Mons', lat: 25.0, lon: 147.2, type: 'volcano', confidence: 0.7, diameter_km: 375 }
  ],
  mercury: [
    { name: 'Caloris Basin', lat: 30.5, lon: 189.8, type: 'basin', confidence: 0.9, diameter_km: 1550 },
    { name: 'Rembrandt', lat: -33.2, lon: 87.5, type: 'crater', confidence: 0.8, diameter_km: 715 },
    { name: 'Borealis Planitia', lat: 73.4, lon: 328.0, type: 'plain', confidence: 0.8 },
    { name: 'Caloris Montes', lat: 39.4, lon: 187.2, type: 'mountain', confidence: 0.7 },
    { name: 'Hokusai', lat: 57.8, lon: 16.8, type: 'crater', confidence: 0.8, diameter_km: 95 }
  ]
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ body: string }> }
) {
  try {
    const { body } = await context.params;
    
    if (!body || typeof body !== 'string') {
      return NextResponse.json(
        { error: 'Body parameter is required' },
        { status: 400 }
      );
    }
    
    const normalizedBody = body.toLowerCase();
    const features = FEATURES_BY_BODY[normalizedBody] || [];
    
    // Get query parameters for filtering
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const type = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '50');
    
    let filteredFeatures = features;
    
    // Filter by search term
    if (search) {
      const searchLower = search.toLowerCase();
      filteredFeatures = filteredFeatures.filter(feature =>
        feature.name.toLowerCase().includes(searchLower) ||
        feature.type.toLowerCase().includes(searchLower)
      );
    }
    
    // Filter by type
    if (type) {
      const typeLower = type.toLowerCase();
      filteredFeatures = filteredFeatures.filter(feature =>
        feature.type.toLowerCase().includes(typeLower)
      );
    }
    
    // Limit results
    filteredFeatures = filteredFeatures.slice(0, limit);
    
    return NextResponse.json({
      body: normalizedBody,
      features: filteredFeatures,
      total: filteredFeatures.length,
      available_types: [...new Set(features.map(f => f.type))]
    });
    
  } catch (error) {
    console.error('Features API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}