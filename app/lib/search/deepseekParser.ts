export type CelestialBody = "moon" | "mars" | "mercury";
export type FeatureType = "Crater" | "Mons" | "Montes" | "Mare" | "Planitia" | "Vallis" | "Unknown";
export type Intent = "largest_crater" | "search" | "unknown";

export interface ParsedQuery {
  body?: CelestialBody;
  feature_type?: FeatureType;
  filters?: {
    diameter_km?: { $gt?: number; $lt?: number };
    latitude?: { $gt?: number; $lt?: number };
    longitude?: { $gt?: number; $lt?: number };
    proximity?: { to?: string; km?: number };
  };
  named_features?: string[];
  intent?: Intent;
}

interface DeepSeekResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

const SYSTEM_PROMPT = `Parse planetary feature search queries into JSON. Return ONLY the JSON object, no markdown.

Schema:
{"body": "moon"|"mars"|"mercury"|null, "feature_type": "Crater"|"Mons"|"Montes"|"Mare"|"Planitia"|"Vallis"|null, "filters": {"diameter_km": {"$gt": num}|null}|null, "named_features": [string]|null, "intent": "largest_crater"|"search"}

Rules:
- ALWAYS extract body if mentioned (moon/lunar→"moon", mars/martian→"mars", mercury→"mercury")
- mountain/mountains/mount→"Mons" or "Montes"
- basin/plain→"Crater" or "Planitia"
- large/big→filters.diameter_km.$gt=100
- largest/biggest→intent="largest_crater"
- Return null for undefined fields, NOT the word undefined`;

export async function parseQueryWithDeepSeek(
  query: string,
  apiKey?: string,
  model: string = "deepseek-chat",
  timeoutMs: number = 1200
): Promise<ParsedQuery | null> {
  if (!apiKey || apiKey.trim() === "") {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: query }
        ],
        temperature: 0.1,
        max_tokens: 300,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`[PE][DeepSeek] API error: ${response.status}`);
      return null;
    }

    const data = await response.json() as DeepSeekResponse;
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return null;
    }

    let cleanedContent = content.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "");
    
    // Fix invalid JSON: replace undefined with null
    cleanedContent = cleanedContent.replace(/:\s*undefined\s*([,}])/g, ': null$1');
    
    const parsed = JSON.parse(cleanedContent) as ParsedQuery;

    if (!isValidParsedQuery(parsed)) {
      console.error("[PE][DeepSeek] Invalid parsed structure");
      return null;
    }

    return parsed;
  } catch (error) {
    clearTimeout(timeoutId);
    if ((error as Error).name === "AbortError") {
      console.log("[PE][DeepSeek] Timeout");
    } else {
      console.error("[PE][DeepSeek] Parse error:", error);
    }
    return null;
  }
}

function isValidParsedQuery(obj: unknown): obj is ParsedQuery {
  if (!obj || typeof obj !== "object") return false;
  const q = obj as ParsedQuery;
  
  if (q.body && !["moon", "mars", "mercury"].includes(q.body)) return false;
  if (q.feature_type && !["Crater", "Mons", "Montes", "Mare", "Planitia", "Vallis", "Unknown"].includes(q.feature_type)) return false;
  if (q.intent && !["largest_crater", "search", "unknown"].includes(q.intent)) return false;
  
  return true;
}

export async function generateAIDescription(
  featureName: string,
  category: string,
  body: string,
  lat: number,
  lon: number,
  diameterKm?: number | null,
  apiKey?: string,
  model: string = "deepseek-chat",
  timeoutMs: number = 1000
): Promise<string | null> {
  if (!apiKey || apiKey.trim() === "") {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const facts = [
      `Name: ${featureName}`,
      `Type: ${category}`,
      `Location: ${body} at ${lat.toFixed(2)}°, ${lon.toFixed(2)}°`,
      diameterKm ? `Size: ~${diameterKm} km diameter` : undefined
    ].filter(Boolean).join(". ");

    const prompt = `Summarize in 60-100 words what this ${category} named ${featureName} on ${body} is notable for. Use only these facts: ${facts}. Do not invent numbers or missions. Be concise and informative.`;

    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 150,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as DeepSeekResponse;
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (error) {
    clearTimeout(timeoutId);
    return null;
  }
}
