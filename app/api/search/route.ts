import { NextRequest, NextResponse } from 'next/server';

interface SearchRequest {
  query: string;
  context?: {
    body?: string;
    lat?: number;
    lon?: number;
  };
}

interface SearchResult {
  found: boolean;
  body?: string;
  lat?: number;
  lon?: number;
  layer_id?: string;
  tags?: string[];
  feature_name?: string;
  confidence?: number;
  message?: string;
  suggestions?: string[];
}

// DeepSeek API configuration
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// Fallback keyword search patterns
const KEYWORD_PATTERNS = {
  moon: {
    mountains: ['Mons', 'Montes', 'mountain', 'peak', 'ridge'],
    craters: ['crater', 'crater', 'impact'],
    valleys: ['valley', 'vallis', 'rille'],
    seas: ['mare', 'sea', 'oceanus'],
    highlands: ['highland', 'terra', 'land']
  },
  mars: {
    mountains: ['Mons', 'Montes', 'mountain', 'peak', 'ridge', 'Olympus'],
    craters: ['crater', 'impact'],
    valleys: ['valley', 'vallis', 'canyon', 'Valles'],
    plains: ['planum', 'planitia', 'plain'],
    volcanoes: ['volcano', 'volcanic', 'Tharsis']
  },
  mercury: {
    craters: ['crater', 'impact'],
    plains: ['planum', 'planitia', 'plain'],
    scarps: ['scarp', 'cliff', 'escarpment']
  }
};

// Mock feature database for fallback
const MOCK_FEATURES = {
  moon: [
    { name: 'Tycho', lat: -43.31, lon: -11.36, type: 'crater', confidence: 0.9 },
    { name: 'Copernicus', lat: 9.62, lon: -20.08, type: 'crater', confidence: 0.9 },
    { name: 'Aristarchus', lat: 23.73, lon: -47.49, type: 'crater', confidence: 0.8 },
    { name: 'Mare Tranquillitatis', lat: 8.35, lon: 31.11, type: 'mare', confidence: 0.9 },
    { name: 'Apollo 11 Landing Site', lat: 0.67, lon: 23.47, type: 'landing_site', confidence: 0.95 }
  ],
  mars: [
    { name: 'Olympus Mons', lat: 18.65, lon: -133.8, type: 'volcano', confidence: 0.95 },
    { name: 'Valles Marineris', lat: -13.9, lon: -59.2, type: 'canyon', confidence: 0.9 },
    { name: 'Gale Crater', lat: -4.5, lon: 137.4, type: 'crater', confidence: 0.9 },
    { name: 'Tharsis Montes', lat: 1.0, lon: -112.0, type: 'volcanoes', confidence: 0.8 }
  ],
  mercury: [
    { name: 'Caloris Basin', lat: 30.5, lon: 189.8, type: 'basin', confidence: 0.9 },
    { name: 'Rembrandt', lat: -33.2, lon: 87.5, type: 'crater', confidence: 0.8 }
  ]
};

async function searchWithDeepSeek(query: string, _context?: any): Promise<SearchResult> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DeepSeek API key not configured');
  }

  const systemPrompt = `You are a planetary science expert. Given a natural language query about planetary features, extract:
1. The celestial body (moon, mars, mercury, etc.)
2. The feature type (crater, mountain, valley, etc.)
3. Specific feature names if mentioned
4. Approximate coordinates if possible

Respond with a JSON object containing: body, lat, lon, feature_name, confidence (0-1), and tags array.

Example queries:
- "show me large mountains on moon" -> {"body": "moon", "lat": 0, "lon": 0, "feature_name": "mountain", "confidence": 0.7, "tags": ["mountain", "large"]}
- "tycho crater" -> {"body": "moon", "lat": -43.31, "lon": -11.36, "feature_name": "Tycho", "confidence": 0.9, "tags": ["crater", "tycho"]}`;

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
        temperature: 0.1,
        max_tokens: 200
      })
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No response from DeepSeek API');
    }

    // Try to parse JSON response
    try {
      const result = JSON.parse(content);
      return {
        found: true,
        body: result.body,
        lat: result.lat,
        lon: result.lon,
        feature_name: result.feature_name,
        confidence: result.confidence || 0.5,
        tags: result.tags || []
      };
    } catch (_parseError) {
      // If JSON parsing fails, try to extract information from text
      const bodyMatch = content.match(/(moon|mars|mercury|venus)/i);
      const body = bodyMatch ? bodyMatch[1].toLowerCase() : 'moon';
      
      return {
        found: true,
        body,
        lat: 0,
        lon: 0,
        feature_name: query,
        confidence: 0.3,
        tags: [query.toLowerCase()]
      };
    }
  } catch (error) {
    console.error('DeepSeek API error:', error);
    throw error;
  }
}

function searchWithKeywords(query: string, context?: any): SearchResult {
  const queryLower = query.toLowerCase();
  const body = context?.body || 'moon';
  
  // Determine body from query if not provided
  let detectedBody = body;
  if (queryLower.includes('moon') || queryLower.includes('lunar')) {
    detectedBody = 'moon';
  } else if (queryLower.includes('mars') || queryLower.includes('martian')) {
    detectedBody = 'mars';
  } else if (queryLower.includes('mercury')) {
    detectedBody = 'mercury';
  }

  // Find matching features
  const features = MOCK_FEATURES[detectedBody as keyof typeof MOCK_FEATURES] || [];
  const patterns = KEYWORD_PATTERNS[detectedBody as keyof typeof KEYWORD_PATTERNS] || {};
  
  // Search for exact name matches first
  const exactMatch = features.find(f => 
    f.name.toLowerCase().includes(queryLower) || 
    queryLower.includes(f.name.toLowerCase())
  );
  
  if (exactMatch) {
    return {
      found: true,
      body: detectedBody,
      lat: exactMatch.lat,
      lon: exactMatch.lon,
      feature_name: exactMatch.name,
      confidence: exactMatch.confidence,
      tags: [exactMatch.type, detectedBody]
    };
  }
  
  // Search by feature type
  for (const [type, keywords] of Object.entries(patterns)) {
    if (keywords.some(keyword => queryLower.includes(keyword))) {
      const typeFeatures = features.filter(f => f.type === type);
      if (typeFeatures.length > 0) {
        const feature = typeFeatures[0]; // Return first match
        return {
          found: true,
          body: detectedBody,
          lat: feature.lat,
          lon: feature.lon,
          feature_name: feature.name,
          confidence: 0.6,
          tags: [type, detectedBody]
        };
      }
    }
  }
  
  // Default fallback
  const defaultFeature = features[0];
  if (defaultFeature) {
    return {
      found: true,
      body: detectedBody,
      lat: defaultFeature.lat,
      lon: defaultFeature.lon,
      feature_name: defaultFeature.name,
      confidence: 0.4,
      tags: [detectedBody]
    };
  }
  
  return {
    found: false,
    message: `No features found for "${query}" on ${detectedBody}`,
    suggestions: [
      'Try: "Tycho crater on moon"',
      'Try: "Olympus Mons on Mars"',
      'Try: "large mountains on moon"',
      'Try: "valleys on Mars"'
    ]
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: SearchRequest = await request.json();
    const { query, context } = body;
    
    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required and must be a string' },
        { status: 400 }
      );
    }
    
    let result: SearchResult;
    
    try {
      // Try DeepSeek first with timeout
      const deepSeekPromise = searchWithDeepSeek(query, context);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('DeepSeek timeout')), 1500)
      );
      
      result = await Promise.race([deepSeekPromise, timeoutPromise]) as SearchResult;
    } catch (error) {
      console.warn('DeepSeek search failed, falling back to keyword search:', error);
      result = searchWithKeywords(query, context);
    }
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}