import { NextRequest, NextResponse } from "next/server";
import { deepSeekParser, ParsedQuery } from "@/app/lib/search/deepseekParser";
import fs from "fs";
import path from "path";

// Load data files
const searchFacts = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "data/search_facts.json"), "utf8")
);
const aliases = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "data/aliases.json"), "utf8")
);
const allFeatures = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "data/features/all_features.json"), "utf8")
);

type SearchResult = {
  found: boolean;
  body?: string;
  center?: { lat: number; lon: number };
  feature?: {
    name: string;
    category: string;
    diameter_km?: number;
    origin?: string;
  };
  zoom?: number;
  layer?: string;
  related_features?: Array<{
    name: string;
    category: string;
    lat: number;
    lon: number;
  }>;
  total_results?: number;
  provider?: string;
  debug?: any;
  reason?: string;
  suggestions?: string[];
  ai_description?: string;
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");
    const debug = searchParams.get("debug") === "1";

    if (!query || query.trim().length === 0) {
      return NextResponse.json({
        found: false,
        reason: "no_query",
        suggestions: [
          "Try: 'largest crater on moon'",
          "Try: 'craters on mars larger than gale'",
          "Try: 'show montes on the moon'"
        ]
      });
    }

    const normalizedQuery = normalizeQuery(query.trim());
    const debugInfo: any = {};

    console.log(`[PE][Search] q=${query} normalized=${normalizedQuery}`);

    // Rule 1: Check for superlative facts first
    const factResult = checkSuperlativeFacts(normalizedQuery);
    if (factResult.found) {
      debugInfo.fired_rule = "largest_crater";
      debugInfo.provider = "fact";
      
      console.log(`[PE][Search] q=${query} provider=fact intent=largest_crater body=${factResult.body} feature=${factResult.feature?.name}`);
      
      return NextResponse.json({
        ...factResult,
        provider: "fact",
        debug: debug ? debugInfo : undefined
      });
    }

    // Rule 2: Use DeepSeek parser for complex queries
    const parserResult = await deepSeekParser.parseQuery(normalizedQuery);
    
    if (parserResult.success && parserResult.data) {
      debugInfo.provider = "deepseek";
      debugInfo.intent = parserResult.data.intent;
      debugInfo.body = parserResult.data.body;
      
      const searchResult = await processParsedQuery(parserResult.data, normalizedQuery);
      
      if (searchResult.found) {
        debugInfo.candidates = searchResult.total_results || 0;
        if (debug) {
          debugInfo.top5 = searchResult.related_features?.slice(0, 5).map(f => f.name) || [];
        }
        
        console.log(`[PE][Search] q=${query} provider=deepseek intent=${parserResult.data.intent} body=${parserResult.data.body} candidates=${debugInfo.candidates}`);
        
        return NextResponse.json({
          ...searchResult,
          provider: "deepseek",
          debug: debug ? debugInfo : undefined
        });
      } else {
        // Return suggestions for failed search
        return NextResponse.json({
          found: false,
          reason: "no_results",
          suggestions: generateSuggestions(normalizedQuery),
          provider: "deepseek",
          debug: debug ? debugInfo : undefined
        });
      }
    } else {
      // Fallback to simple keyword search
      debugInfo.provider = "fallback";
      const fallbackResult = performFallbackSearch(normalizedQuery);
      
      console.log(`[PE][Search] q=${query} provider=fallback found=${fallbackResult.found}`);
      
      return NextResponse.json({
        ...fallbackResult,
        provider: "fallback",
        debug: debug ? debugInfo : undefined
      });
    }

  } catch (error) {
    console.error("[PE][Search] Error:", error);
    return NextResponse.json({
      found: false,
      reason: "error",
      suggestions: ["Try a simpler search term"]
    }, { status: 500 });
  }
}

function normalizeQuery(query: string): string {
  let normalized = query.toLowerCase();
  
  // Apply character normalization
  for (const [char, replacement] of Object.entries(aliases.character_map)) {
    normalized = normalized.replace(new RegExp(char, 'g'), replacement);
  }
  
  return normalized;
}

function checkSuperlativeFacts(query: string): SearchResult {
  const queryLower = query.toLowerCase();
  
  // Check for largest crater queries
  if (queryLower.includes("largest crater") || queryLower.includes("largest basin")) {
    // Extract body
    let body: string | null = null;
    if (queryLower.includes("moon") || queryLower.includes("lunar")) {
      body = "moon";
    } else if (queryLower.includes("mars") || queryLower.includes("martian")) {
      body = "mars";
    } else if (queryLower.includes("mercury")) {
      body = "mercury";
    }
    
    if (body && searchFacts.largest_crater[body]) {
      const fact = searchFacts.largest_crater[body];
      return {
        found: true,
        body: fact.body,
        center: { lat: fact.lat, lon: fact.lon },
        feature: {
          name: fact.name,
          category: fact.category,
          diameter_km: fact.diameter_km
        },
        zoom: 6,
        layer: fact.layer_id,
        total_results: 1
      };
    }
  }
  
  return { found: false };
}

async function processParsedQuery(parsed: ParsedQuery, originalQuery: string): Promise<SearchResult> {
  let candidates = allFeatures;
  
  // Filter by body
  if (parsed.body) {
    candidates = candidates.filter((f: any) => f.body === parsed.body);
  }
  
  // Filter by feature type
  if (parsed.feature_type && parsed.feature_type !== "Unknown") {
    candidates = candidates.filter((f: any) => f.category === parsed.feature_type);
  }
  
  // Apply diameter filters
  if (parsed.filters?.diameter_km) {
    candidates = candidates.filter((f: any) => {
      if (!f.diameter_km) return false;
      if (parsed.filters!.diameter_km!.$gt && f.diameter_km <= parsed.filters!.diameter_km!.$gt) return false;
      if (parsed.filters!.diameter_km!.$lt && f.diameter_km >= parsed.filters!.diameter_km!.$lt) return false;
      return true;
    });
  }
  
  // Apply latitude filters
  if (parsed.filters?.latitude) {
    candidates = candidates.filter((f: any) => {
      if (parsed.filters!.latitude!.$gt && f.lat <= parsed.filters!.latitude!.$gt) return false;
      if (parsed.filters!.latitude!.$lt && f.lat >= parsed.filters!.latitude!.$lt) return false;
      return true;
    });
  }
  
  // Apply longitude filters
  if (parsed.filters?.longitude) {
    candidates = candidates.filter((f: any) => {
      if (parsed.filters!.longitude!.$gt && f.lon <= parsed.filters!.longitude!.$gt) return false;
      if (parsed.filters!.longitude!.$lt && f.lon >= parsed.filters!.longitude!.$lt) return false;
      return true;
    });
  }
  
  // Handle named features
  if (parsed.named_features && parsed.named_features.length > 0) {
    const namedCandidates = candidates.filter((f: any) => 
      parsed.named_features!.some(name => 
        f.name.toLowerCase().includes(name.toLowerCase())
      )
    );
    
    if (namedCandidates.length > 0) {
      candidates = namedCandidates;
    }
  }
  
  // Handle proximity filters
  if (parsed.filters?.proximity?.to) {
    const referenceFeature = allFeatures.find((f: any) => 
      f.name.toLowerCase().includes(parsed.filters!.proximity!.to!.toLowerCase())
    );
    
    if (referenceFeature) {
      const maxDistance = parsed.filters!.proximity!.km || 1000;
      candidates = candidates.filter((f: any) => {
        const distance = calculateDistance(
          f.lat, f.lon,
          referenceFeature.lat, referenceFeature.lon
        );
        return distance <= maxDistance;
      });
    }
  }
  
  if (candidates.length === 0) {
    return {
      found: false,
      reason: "insufficient_data",
      suggestions: generateSuggestions(originalQuery)
    };
  }
  
  // Sort by relevance (diameter if available, otherwise by name match)
  candidates.sort((a: any, b: any) => {
    if (a.diameter_km && b.diameter_km) {
      return b.diameter_km - a.diameter_km;
    }
    if (a.diameter_km && !b.diameter_km) return -1;
    if (!a.diameter_km && b.diameter_km) return 1;
    return a.name.localeCompare(b.name);
  });
  
  const primary = candidates[0];
  const related = candidates.slice(1, 6).map((f: any) => ({
    name: f.name,
    category: f.category,
    lat: f.lat,
    lon: f.lon
  }));
  
  // Generate AI description if feature is found
  let aiDescription: string | undefined;
  if (primary) {
    try {
      aiDescription = await deepSeekParser.generateDescription({
        name: primary.name,
        category: primary.category,
        body: primary.body,
        lat: primary.lat,
        lon: primary.lon,
        diameter_km: primary.diameter_km
      }) || undefined;
    } catch (error) {
      console.error("[PE][Search] AI description error:", error);
    }
  }
  
  return {
    found: true,
    body: primary.body,
    center: { lat: primary.lat, lon: primary.lon },
    feature: {
      name: primary.name,
      category: primary.category,
      diameter_km: primary.diameter_km,
      origin: primary.origin
    },
    zoom: 6,
    layer: `${primary.body}_default`,
    related_features: related,
    total_results: candidates.length,
    ai_description: aiDescription
  };
}

function performFallbackSearch(query: string): SearchResult {
  const queryLower = query.toLowerCase();
  
  // Simple keyword matching
  const candidates = allFeatures.filter((f: any) => {
    const nameMatch = f.name.toLowerCase().includes(queryLower);
    const keywordMatch = f.keywords?.some((k: string) => k.toLowerCase().includes(queryLower));
    const categoryMatch = f.category.toLowerCase().includes(queryLower);
    
    return nameMatch || keywordMatch || categoryMatch;
  });
  
  if (candidates.length === 0) {
    return {
      found: false,
      reason: "no_results",
      suggestions: generateSuggestions(query)
    };
  }
  
  const primary = candidates[0];
  const related = candidates.slice(1, 6).map((f: any) => ({
    name: f.name,
    category: f.category,
    lat: f.lat,
    lon: f.lon
  }));
  
  return {
    found: true,
    body: primary.body,
    center: { lat: primary.lat, lon: primary.lon },
    feature: {
      name: primary.name,
      category: primary.category,
      diameter_km: primary.diameter_km,
      origin: primary.origin
    },
    zoom: 6,
    layer: `${primary.body}_default`,
    related_features: related,
    total_results: candidates.length
  };
}

function generateSuggestions(query: string): string[] {
  const suggestions = [
    "Try: 'largest crater on moon'",
    "Try: 'craters on mars'",
    "Try: 'show montes on the moon'",
    "Try: 'things near olympus mons'"
  ];
  
  // Add body-specific suggestions
  if (query.includes("moon") || query.includes("lunar")) {
    suggestions.unshift("Try: 'Tycho crater'", "Try: 'Mare Imbrium'");
  } else if (query.includes("mars") || query.includes("martian")) {
    suggestions.unshift("Try: 'Olympus Mons'", "Try: 'Hellas Planitia'");
  } else if (query.includes("mercury")) {
    suggestions.unshift("Try: 'Caloris Planitia'");
  }
  
  return suggestions.slice(0, 5);
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3390; // Mars radius in km (approximate)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}