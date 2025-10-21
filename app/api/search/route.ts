import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface SearchRequest {
  query: string;
  body?: string;
}

interface FeatureData {
  id: string;
  name: string;
  body: string;
  category: string;
  lat: number;
  lon: number;
  diameter_km?: number | null;
  keywords?: string[];
}

interface SearchResult {
  found: boolean;
  body?: string;
  center?: { lat: number; lon: number };
  feature?: FeatureData;
  provider?: string;
  message?: string;
}

// Load all features once at module scope for performance
let allFeatures: FeatureData[] | null = null;

function loadAllFeatures(): FeatureData[] {
  if (allFeatures) return allFeatures;
  
  try {
    const featuresPath = join(process.cwd(), 'data', 'features', 'all_features.json');
    const featuresData = readFileSync(featuresPath, 'utf-8');
    allFeatures = JSON.parse(featuresData) as FeatureData[];
    return allFeatures;
  } catch (error) {
    console.error('Error loading features:', error);
    return [];
  }
}

// Extract body from query
function extractBody(query: string): string | null {
  const queryLower = query.toLowerCase();
  
  if (queryLower.includes('moon') || queryLower.includes('lunar')) return 'moon';
  if (queryLower.includes('mars') || queryLower.includes('martian')) return 'mars';
  if (queryLower.includes('mercury')) return 'mercury';
  if (queryLower.includes('ceres')) return 'ceres';
  if (queryLower.includes('vesta')) return 'vesta';
  
  return null;
}

// Extract feature type from query
function extractFeatureType(query: string): string[] {
  const queryLower = query.toLowerCase();
  const types: string[] = [];
  
  // Map common terms to formal feature types
  if (queryLower.includes('mountain') || queryLower.includes('mountains')) {
    types.push('mons', 'montes');
  }
  if (queryLower.includes('crater') || queryLower.includes('craters')) {
    types.push('crater');
  }
  if (queryLower.includes('valley') || queryLower.includes('valleys')) {
    types.push('vallis', 'valles');
  }
  if (queryLower.includes('plain') || queryLower.includes('plains')) {
    types.push('planitia');
  }
  if (queryLower.includes('mare') || queryLower.includes('sea')) {
    types.push('mare');
  }
  if (queryLower.includes('ridge')) {
    types.push('dorsum', 'dorsa');
  }
  
  return types;
}

// Extract size hints from query
function extractSizeHint(query: string): 'large' | 'small' | null {
  const queryLower = query.toLowerCase();
  
  if (queryLower.includes('large') || queryLower.includes('big') || queryLower.includes('major')) {
    return 'large';
  }
  if (queryLower.includes('small') || queryLower.includes('minor')) {
    return 'small';
  }
  
  return null;
}

// Keyword-based search with geospatial ranking
function keywordSearch(query: string, body: string | null, features: FeatureData[]): FeatureData | null {
  const queryLower = query.toLowerCase();
  const types = extractFeatureType(query);
  const sizeHint = extractSizeHint(query);
  
  let candidates = features;
  
  // Filter by body if specified
  if (body) {
    candidates = candidates.filter(f => f.body.toLowerCase() === body.toLowerCase());
  }
  
  // Score each feature
  const scored = candidates.map(feature => {
    let score = 0;
    
    // Exact name match (highest priority)
    if (feature.name.toLowerCase() === queryLower) {
      score += 1000;
    }
    // Name contains query
    else if (feature.name.toLowerCase().includes(queryLower)) {
      score += 500;
    }
    
    // Feature type match
    if (types.length > 0) {
      const categoryLower = (feature.category || '').toLowerCase();
      for (const type of types) {
        if (categoryLower.includes(type)) {
          score += 200;
        }
      }
    }
    
    // Keyword match
    if (feature.keywords) {
      for (const keyword of feature.keywords) {
        if (queryLower.includes(keyword.toLowerCase())) {
          score += 50;
        }
      }
    }
    
    // Size-based scoring
    if (sizeHint && feature.diameter_km) {
      if (sizeHint === 'large' && feature.diameter_km > 50) {
        score += 100;
      } else if (sizeHint === 'small' && feature.diameter_km < 20) {
        score += 100;
      }
    }
    
    return { feature, score };
  });
  
  // Sort by score and return best match
  scored.sort((a, b) => b.score - a.score);
  
  if (scored.length > 0 && scored[0].score > 0) {
    return scored[0].feature;
  }
  
  return null;
}

// DeepSeek provider with timeout
async function deepSeekSearch(query: string, timeoutMs: number = 1500): Promise<FeatureData | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    // TODO: Implement actual DeepSeek API call here
    // For now, return null to fall back to keyword search
    // const response = await fetch('deepseek-api-endpoint', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ query }),
    //   signal: controller.signal,
    // });
    
    return null;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      console.log('DeepSeek search timeout, falling back to keyword search');
    } else {
      console.error('DeepSeek search error:', error);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// GET handler for query parameter-based search
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || searchParams.get('query');
    
    if (!query || query.trim().length === 0) {
      return NextResponse.json({
        found: false,
        message: 'Query parameter "q" is required',
      } as SearchResult);
    }
    
    // Load features
    const features = loadAllFeatures();
    
    if (features.length === 0) {
      return NextResponse.json({
        found: false,
        message: 'Feature database not available',
      } as SearchResult);
    }
    
    // Extract body from query
    const targetBody = extractBody(query);
    
    // Try DeepSeek first (with timeout)
    let result = await deepSeekSearch(query);
    const provider = result ? 'deepseek' : 'keyword';
    
    // Fallback to keyword search
    if (!result) {
      result = keywordSearch(query, targetBody, features);
    }
    
    if (result) {
      return NextResponse.json({
        found: true,
        body: result.body,
        lat: result.lat,
        lon: result.lon,
        center: {
          lat: result.lat,
          lon: result.lon,
        },
        feature: result,
        provider,
      } as SearchResult, {
        headers: {
          'Cache-Control': 'private, max-age=300',
        },
      });
    } else {
      return NextResponse.json({
        found: false,
        message: 'No matching features found',
      } as SearchResult);
    }
  } catch (error) {
    console.error('Search API GET error:', error);
    return NextResponse.json(
      { found: false, message: 'Search failed' } as SearchResult,
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: SearchRequest = await req.json();
    const { query } = body;
    
    if (!query || query.trim().length === 0) {
      return NextResponse.json({
        found: false,
        message: 'Query is required',
      } as SearchResult);
    }
    
    // Load features
    const features = loadAllFeatures();
    
    if (features.length === 0) {
      return NextResponse.json({
        found: false,
        message: 'Feature database not available',
      } as SearchResult);
    }
    
    // Extract body from query
    const targetBody = extractBody(query);
    
    // Try DeepSeek first (with timeout)
    let result = await deepSeekSearch(query);
    const provider = result ? 'deepseek' : 'keyword';
    
    // Fallback to keyword search
    if (!result) {
      result = keywordSearch(query, targetBody, features);
    }
    
    if (result) {
      return NextResponse.json({
        found: true,
        body: result.body,
        center: {
          lat: result.lat,
          lon: result.lon,
        },
        feature: result,
        provider,
      } as SearchResult, {
        headers: {
          'Cache-Control': 'private, max-age=300',
        },
      });
    } else {
      return NextResponse.json({
        found: false,
        message: 'No matching features found',
      } as SearchResult);
    }
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { found: false, message: 'Search failed' } as SearchResult,
      { status: 500 }
    );
  }
}
