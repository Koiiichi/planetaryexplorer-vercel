import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseQueryWithDeepSeek, type ParsedQuery } from '@/app/lib/search/deepseekParser';

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

interface SearchFact {
  name: string;
  category: string;
  lat: number;
  lon: number;
  diameter_km: number;
  body: string;
  description: string;
}

interface SearchFacts {
  [body: string]: {
    largest_crater?: SearchFact;
  };
}

interface Aliases {
  characterNormalization: Record<string, string>;
  featureTypeSynonyms: Record<string, string[]>;
  bodyAliases: Record<string, string[]>;
  superlativePatterns: string[];
}

interface SearchResult {
  found: boolean;
  body?: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  feature?: FeatureData;
  layer_id?: string;
  provider?: string;
  message?: string;
  reason?: string;
  suggestions?: Array<{ name: string; body: string; category: string }>;
  ai_description?: string | null;
  debug?: {
    provider?: string;
    fired_rule?: string;
    intent?: string;
    candidates_count?: number;
    top5?: Array<{ name: string; score: number; diameter_km?: number | null }>;
  };
}

// Load all features once at module scope for performance
let allFeatures: FeatureData[] | null = null;
let searchFacts: SearchFacts | null = null;
let aliases: Aliases | null = null;

// Map body to default layer ID
function getLayerIdForBody(body: string): string {
  const layerMap: Record<string, string> = {
    'moon': 'moon:lro_wac_global',
    'mars': 'mars:mdim21_global',
    'mercury': 'mercury:messenger_global',
    'ceres': 'ceres:dawn_global',
    'vesta': 'vesta:dawn_global',
  };
  return layerMap[body.toLowerCase()] || `${body}:default`;
}

function loadSearchFacts(): SearchFacts {
  if (searchFacts) return searchFacts;
  try {
    const factsPath = join(process.cwd(), 'data', 'search_facts.json');
    const factsData = readFileSync(factsPath, 'utf-8');
    searchFacts = JSON.parse(factsData) as SearchFacts;
    return searchFacts;
  } catch (error) {
    console.error('Error loading search facts:', error);
    return {};
  }
}

function loadAliases(): Aliases {
  if (aliases) return aliases;
  try {
    const aliasPath = join(process.cwd(), 'data', 'aliases.json');
    const aliasData = readFileSync(aliasPath, 'utf-8');
    aliases = JSON.parse(aliasData) as Aliases;
    return aliases;
  } catch (error) {
    console.error('Error loading aliases:', error);
    return {
      characterNormalization: {},
      featureTypeSynonyms: {},
      bodyAliases: {},
      superlativePatterns: []
    };
  }
}

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

function normalizeQuery(query: string, aliasData: Aliases): string {
  let normalized = query.toLowerCase();
  for (const [char, replacement] of Object.entries(aliasData.characterNormalization)) {
    normalized = normalized.replace(new RegExp(char, 'g'), replacement);
  }
  return normalized;
}

// Extract body from query with alias support
function extractBody(query: string, aliasData: Aliases): string | null {
  const queryLower = query.toLowerCase();
  
  for (const [body, bodyAliases] of Object.entries(aliasData.bodyAliases)) {
    if (bodyAliases.some(alias => queryLower.includes(alias))) {
      return body;
    }
  }
  
  return null;
}

// Check if query matches superlative pattern
function matchesSuperlative(query: string, aliasData: Aliases): boolean {
  const queryLower = query.toLowerCase();
  return aliasData.superlativePatterns.some(pattern => queryLower.includes(pattern));
}

// Translate synonym to internal feature type
function translateFeatureType(type: string, aliasData: Aliases): string[] {
  const typeLower = type.toLowerCase();
  
  for (const [canonical, synonyms] of Object.entries(aliasData.featureTypeSynonyms)) {
    if (synonyms.includes(typeLower)) {
      return [canonical];
    }
  }
  
  return [type];
}

// Enhanced keyword search with parsed query support
function enhancedSearch(
  query: string,
  body: string | null,
  features: FeatureData[],
  parsedQuery: ParsedQuery | null,
  aliasData: Aliases,
  includeDebug: boolean = false
): { result: FeatureData | null; suggestions?: Array<{ name: string; body: string; category: string }>; debug?: unknown } {
  const queryLower = query.toLowerCase();
  let candidates = features;
  
  const effectiveBody = parsedQuery?.body || body;
  const featureType = parsedQuery?.feature_type;
  const filters = parsedQuery?.filters;
  const namedFeatures = parsedQuery?.named_features || [];
  
  if (effectiveBody) {
    candidates = candidates.filter(f => f.body.toLowerCase() === effectiveBody.toLowerCase());
  }
  
  if (featureType && featureType !== 'Unknown') {
    const types = translateFeatureType(featureType, aliasData);
    candidates = candidates.filter(feature => {
      const categoryLower = (feature.category || '').toLowerCase();
      return types.some(type => categoryLower.includes(type.toLowerCase()));
    });
  }
  
  if (filters?.diameter_km?.$gt !== undefined) {
    candidates = candidates.filter(f => {
      if (!f.diameter_km) return false;
      return f.diameter_km > (filters.diameter_km!.$gt || 0);
    });
  }
  
  if (filters?.diameter_km?.$lt !== undefined) {
    candidates = candidates.filter(f => {
      if (!f.diameter_km) return false;
      return f.diameter_km < (filters.diameter_km!.$lt || Infinity);
    });
  }
  
  if (filters?.latitude?.$gt !== undefined || filters?.latitude?.$lt !== undefined) {
    candidates = candidates.filter(f => {
      const inRange = 
        (filters.latitude?.$gt === undefined || f.lat > filters.latitude.$gt) &&
        (filters.latitude?.$lt === undefined || f.lat < filters.latitude.$lt);
      return inRange;
    });
  }
  
  if (namedFeatures.length > 0) {
    const referencedFeatures = features.filter(f => 
      namedFeatures.some(nf => f.name.toLowerCase().includes(nf.toLowerCase()))
    );
    
    for (const ref of referencedFeatures) {
      if (ref.diameter_km && !filters?.diameter_km?.$gt) {
        candidates = candidates.filter(f => {
          if (!f.diameter_km) return false;
          return f.diameter_km > (ref.diameter_km || 0);
        });
      }
    }
  }
  
  const containsWholeWord = (text: string, word: string): boolean => {
    const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return regex.test(text);
  };
  
  const scored = candidates.map(feature => {
    let score = 0;
    
    if (feature.name.toLowerCase() === queryLower) {
      score += 1000;
    } else if (containsWholeWord(queryLower, feature.name.toLowerCase())) {
      score += 500;
    } else if (feature.name.toLowerCase().includes(queryLower)) {
      score += 250;
    }
    
    if (feature.keywords) {
      for (const keyword of feature.keywords) {
        if (containsWholeWord(queryLower, keyword.toLowerCase())) {
          score += 50;
        }
      }
    }
    
    if (feature.diameter_km) {
      if (queryLower.includes('largest') || queryLower.includes('biggest')) {
        score += Math.min(feature.diameter_km * 10, 5000);
      } else if (queryLower.includes('smallest')) {
        score += Math.max(1000 - feature.diameter_km * 10, 100);
      } else {
        score += 10;
      }
    }
    
    return { feature, score };
  });
  
  scored.sort((a, b) => b.score - a.score);
  
  const CONFIDENCE_THRESHOLD = 100;
  const topCandidate = scored[0];
  
  if (!topCandidate || topCandidate.score < CONFIDENCE_THRESHOLD) {
    const suggestions = scored.slice(0, 5)
      .filter(s => s.score > 0)
      .map(s => ({
        name: s.feature.name,
        body: s.feature.body,
        category: s.feature.category
      }));
    
    return {
      result: null,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
      debug: includeDebug ? {
        candidates_count: candidates.length,
        top5: scored.slice(0, 5).map(s => ({
          name: s.feature.name,
          score: s.score,
          diameter_km: s.feature.diameter_km
        }))
      } : undefined
    };
  }
  
  const debugInfo = includeDebug ? {
    candidates_count: candidates.length,
    top5: scored.slice(0, 5).map(s => ({
      name: s.feature.name,
      score: s.score,
      diameter_km: s.feature.diameter_km
    }))
  } : undefined;
  
  return { result: topCandidate.feature, debug: debugInfo };
}

// GET handler for query parameter-based search
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || searchParams.get('query');
    const debug = searchParams.get('debug') === '1';
    
    if (!query || query.trim().length === 0) {
      return NextResponse.json({
        found: false,
        message: 'Query parameter "q" is required',
      } as SearchResult);
    }
    
    const features = loadAllFeatures();
    if (features.length === 0) {
      return NextResponse.json({
        found: false,
        message: 'Feature database not available',
      } as SearchResult);
    }
    
    const facts = loadSearchFacts();
    const aliasData = loadAliases();
    const normalized = normalizeQuery(query, aliasData);
    const detectedBody = extractBody(normalized, aliasData);
    
    const isSuperlative = matchesSuperlative(normalized, aliasData);
    if (isSuperlative && detectedBody && facts[detectedBody]?.largest_crater) {
      const fact = facts[detectedBody].largest_crater!;
      const responseData: SearchResult = {
        found: true,
        body: fact.body,
        lat: fact.lat,
        lon: fact.lon,
        layer_id: getLayerIdForBody(fact.body),
        center: { lat: fact.lat, lon: fact.lon },
        feature: {
          id: `${fact.body}_${fact.name.toLowerCase().replace(/\s+/g, '_')}`,
          name: fact.name,
          body: fact.body,
          category: fact.category,
          lat: fact.lat,
          lon: fact.lon,
          diameter_km: fact.diameter_km,
          keywords: [fact.body, fact.category.toLowerCase(), fact.name.toLowerCase()]
        },
        provider: 'fact',
      };
      
      if (debug) {
        responseData.debug = {
          provider: 'fact',
          fired_rule: 'largest_crater',
          intent: 'largest_crater'
        };
      }
      
      return NextResponse.json(responseData, {
        headers: { 'Cache-Control': 'private, max-age=300' },
      });
    }
    
    const aiEnabled = process.env.AI_SEARCH_ENABLE === 'true';
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    const timeout = parseInt(process.env.AI_SEARCH_TIMEOUT_MS || '1200', 10);
    
    let parsedQuery: ParsedQuery | null = null;
    if (aiEnabled && apiKey) {
      parsedQuery = await parseQueryWithDeepSeek(normalized, apiKey, model, timeout);
    }
    
    const searchResult = enhancedSearch(
      normalized,
      detectedBody,
      features,
      parsedQuery,
      aliasData,
      debug
    );
    
    console.log(`[PE][Search] q="${query}" provider=${parsedQuery ? 'deepseek' : 'keyword'} intent=${parsedQuery?.intent || 'n/a'} body=${detectedBody || 'n/a'} candidates=${(searchResult.debug as { candidates_count?: number })?.candidates_count || 0}`);
    
    if (searchResult.result) {
      let aiDescription: string | null | undefined;
      if (aiEnabled && apiKey && searchResult.result.name) {
        const { generateAIDescription } = await import('@/app/lib/search/deepseekParser');
        aiDescription = await generateAIDescription(
          searchResult.result.name,
          searchResult.result.category || 'Feature',
          searchResult.result.body,
          searchResult.result.lat,
          searchResult.result.lon,
          searchResult.result.diameter_km,
          apiKey,
          model,
          1000
        ).catch(() => undefined);
      }
      
      const responseData: SearchResult = {
        found: true,
        body: searchResult.result.body,
        lat: searchResult.result.lat,
        lon: searchResult.result.lon,
        layer_id: getLayerIdForBody(searchResult.result.body),
        center: {
          lat: searchResult.result.lat,
          lon: searchResult.result.lon,
        },
        feature: searchResult.result,
        provider: parsedQuery ? 'deepseek' : 'keyword',
        ai_description: aiDescription,
      };
      
      if (debug && searchResult.debug) {
        responseData.debug = {
          provider: parsedQuery ? 'deepseek' : 'keyword',
          intent: parsedQuery?.intent,
          ...(searchResult.debug as object)
        };
      }
      
      return NextResponse.json(responseData, {
        headers: { 'Cache-Control': 'private, max-age=300' },
      });
    } else {
      let educationalMessage = 'No matching features found';
      
      if (parsedQuery?.body && parsedQuery?.feature_type) {
        const requestedBody = parsedQuery.body;
        const requestedType = parsedQuery.feature_type;
        const bodyFeatures = features.filter(f => f.body === requestedBody);
        const hasType = bodyFeatures.some(f => f.category === requestedType);
        
        if (!hasType && bodyFeatures.length > 0) {
          const availableTypes = [...new Set(bodyFeatures.map(f => f.category))];
          educationalMessage = `${requestedBody.charAt(0).toUpperCase() + requestedBody.slice(1)} has no officially named ${requestedType} features in the IAU Planetary Nomenclature database. Available feature types: ${availableTypes.join(', ')}.`;
        }
      }
      
      return NextResponse.json({
        found: false,
        reason: 'insufficient_data',
        message: educationalMessage,
        suggestions: searchResult.suggestions,
      } as SearchResult);
    }
  } catch (error) {
    console.error('[PE][Search] GET error:', error);
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
    
    const features = loadAllFeatures();
    if (features.length === 0) {
      return NextResponse.json({
        found: false,
        message: 'Feature database not available',
      } as SearchResult);
    }
    
    const facts = loadSearchFacts();
    const aliasData = loadAliases();
    const normalized = normalizeQuery(query, aliasData);
    const detectedBody = extractBody(normalized, aliasData);
    
    const isSuperlative = matchesSuperlative(normalized, aliasData);
    if (isSuperlative && detectedBody && facts[detectedBody]?.largest_crater) {
      const fact = facts[detectedBody].largest_crater!;
      return NextResponse.json({
        found: true,
        body: fact.body,
        lat: fact.lat,
        lon: fact.lon,
        layer_id: getLayerIdForBody(fact.body),
        center: { lat: fact.lat, lon: fact.lon },
        feature: {
          id: `${fact.body}_${fact.name.toLowerCase().replace(/\s+/g, '_')}`,
          name: fact.name,
          body: fact.body,
          category: fact.category,
          lat: fact.lat,
          lon: fact.lon,
          diameter_km: fact.diameter_km,
          keywords: [fact.body, fact.category.toLowerCase(), fact.name.toLowerCase()]
        },
        provider: 'fact',
      } as SearchResult, {
        headers: { 'Cache-Control': 'private, max-age=300' },
      });
    }
    
    const aiEnabled = process.env.AI_SEARCH_ENABLE === 'true';
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    const timeout = parseInt(process.env.AI_SEARCH_TIMEOUT_MS || '1200', 10);
    
    let parsedQuery: ParsedQuery | null = null;
    if (aiEnabled && apiKey) {
      parsedQuery = await parseQueryWithDeepSeek(normalized, apiKey, model, timeout);
    }
    
    const searchResult = enhancedSearch(
      normalized,
      detectedBody,
      features,
      parsedQuery,
      aliasData,
      false
    );
    
    if (searchResult.result) {
      let aiDescription: string | null | undefined;
      if (aiEnabled && apiKey && searchResult.result.name) {
        const { generateAIDescription } = await import('@/app/lib/search/deepseekParser');
        aiDescription = await generateAIDescription(
          searchResult.result.name,
          searchResult.result.category || 'Feature',
          searchResult.result.body,
          searchResult.result.lat,
          searchResult.result.lon,
          searchResult.result.diameter_km,
          apiKey,
          model,
          1000
        ).catch(() => undefined);
      }
      
      return NextResponse.json({
        found: true,
        body: searchResult.result.body,
        lat: searchResult.result.lat,
        lon: searchResult.result.lon,
        layer_id: getLayerIdForBody(searchResult.result.body),
        center: {
          lat: searchResult.result.lat,
          lon: searchResult.result.lon,
        },
        feature: searchResult.result,
        provider: parsedQuery ? 'deepseek' : 'keyword',
        ai_description: aiDescription,
      } as SearchResult, {
        headers: { 'Cache-Control': 'private, max-age=300' },
      });
    } else {
      let educationalMessage = 'No matching features found';
      
      if (parsedQuery?.body && parsedQuery?.feature_type) {
        const requestedBody = parsedQuery.body;
        const requestedType = parsedQuery.feature_type;
        const bodyFeatures = features.filter(f => f.body === requestedBody);
        const hasType = bodyFeatures.some(f => f.category === requestedType);
        
        if (!hasType && bodyFeatures.length > 0) {
          const availableTypes = [...new Set(bodyFeatures.map(f => f.category))];
          educationalMessage = `${requestedBody.charAt(0).toUpperCase() + requestedBody.slice(1)} has no officially named ${requestedType} features in the IAU Planetary Nomenclature database. Available feature types: ${availableTypes.join(', ')}.`;
        }
      }
      
      return NextResponse.json({
        found: false,
        reason: 'insufficient_data',
        message: educationalMessage,
        suggestions: searchResult.suggestions,
      } as SearchResult);
    }
  } catch (error) {
    console.error('[PE][Search] POST error:', error);
    return NextResponse.json(
      { found: false, message: 'Search failed' } as SearchResult,
      { status: 500 }
    );
  }
}
