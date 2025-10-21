/**
 * DeepSeek Query Parser for Natural Language Search
 * Converts free-text queries into validated structured filters
 */

export type ParsedQuery = {
  body?: "moon" | "mars" | "mercury";
  feature_type?: "Crater" | "Mons" | "Montes" | "Mare" | "Planitia" | "Vallis" | "Unknown";
  filters?: {
    diameter_km?: { $gt?: number; $lt?: number };
    latitude?: { $gt?: number; $lt?: number };
    longitude?: { $gt?: number; $lt?: number };
    proximity?: { to?: string; km?: number };
  };
  named_features?: string[];
  intent?: "largest_crater" | "search" | "unknown";
};

export type DeepSeekResponse = {
  success: boolean;
  data?: ParsedQuery;
  error?: string;
};

class DeepSeekParser {
  private apiKey: string;
  private model: string;
  private timeout: number;
  private enabled: boolean;

  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY || "";
    this.model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
    this.timeout = parseInt(process.env.AI_SEARCH_TIMEOUT_MS || "1200");
    this.enabled = process.env.AI_SEARCH_ENABLE === "true" && !!this.apiKey;
  }

  /**
   * Parse a natural language query using DeepSeek
   */
  async parseQuery(query: string): Promise<DeepSeekResponse> {
    if (!this.enabled) {
      return {
        success: false,
        error: "DeepSeek parser is disabled or API key not configured"
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "system",
              content: this.getSystemPrompt()
            },
            {
              role: "user",
              content: query
            }
          ],
          temperature: 0.1,
          max_tokens: 200,
          stream: false
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("No content in DeepSeek response");
      }

      // Parse JSON response
      const parsed = this.parseJsonResponse(content);
      
      return {
        success: true,
        data: parsed
      };

    } catch (error) {
      console.error("[DeepSeek Parser] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Generate AI description for a feature
   */
  async generateDescription(feature: {
    name: string;
    category: string;
    body: string;
    lat: number;
    lon: number;
    diameter_km?: number;
  }): Promise<string | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);

      const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "system",
              content: "You are a planetary science expert. Provide concise, factual descriptions of planetary features in 60-100 words. Use only provided facts. Do not invent numbers or missions."
            },
            {
              role: "user",
              content: `Summarize this ${feature.category} named "${feature.name}" on ${feature.body}. Coordinates: ${feature.lat.toFixed(2)}°N, ${feature.lon.toFixed(2)}°E${feature.diameter_km ? `. Diameter: ${feature.diameter_km} km` : ""}.`
            }
          ],
          temperature: 0.2,
          max_tokens: 150,
          stream: false
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content?.trim() || null;

    } catch (error) {
      console.error("[DeepSeek Description] Error:", error);
      return null;
    }
  }

  private getSystemPrompt(): string {
    return `You are a planetary search query parser. Convert natural language queries about planetary features into structured JSON.

Available celestial bodies: moon, mars, mercury
Available feature types: Crater, Mons, Montes, Mare, Planitia, Vallis, Unknown

Output ONLY valid JSON matching this schema:
{
  "body": "moon" | "mars" | "mercury" | null,
  "feature_type": "Crater" | "Mons" | "Montes" | "Mare" | "Planitia" | "Vallis" | "Unknown" | null,
  "filters": {
    "diameter_km": {"$gt": number, "$lt": number} | null,
    "latitude": {"$gt": number, "$lt": number} | null,
    "longitude": {"$gt": number, "$lt": number} | null,
    "proximity": {"to": "feature_name", "km": number} | null
  } | null,
  "named_features": ["feature1", "feature2"] | null,
  "intent": "largest_crater" | "search" | "unknown"
}

Examples:
- "largest crater on mars" → {"body": "mars", "intent": "largest_crater", "feature_type": "Crater"}
- "craters larger than 100km on moon" → {"body": "moon", "feature_type": "Crater", "filters": {"diameter_km": {"$gt": 100}}}
- "mountains near olympus mons" → {"body": "mars", "feature_type": "Mons", "filters": {"proximity": {"to": "Olympus Mons", "km": 1000}}}
- "show me tycho crater" → {"body": "moon", "named_features": ["Tycho"], "intent": "search"}

Be precise and only include fields that are clearly specified in the query.`;
  }

  private parseJsonResponse(content: string): ParsedQuery {
    try {
      // Clean the response - remove any markdown formatting
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      
      const parsed = JSON.parse(cleaned);
      
      // Validate the parsed object
      return this.validateParsedQuery(parsed);
    } catch (error) {
      console.error("[DeepSeek Parser] JSON parse error:", error);
      throw new Error("Invalid JSON response from DeepSeek");
    }
  }

  private validateParsedQuery(data: any): ParsedQuery {
    const result: ParsedQuery = {};

    // Validate body
    if (data.body && ["moon", "mars", "mercury"].includes(data.body)) {
      result.body = data.body;
    }

    // Validate feature_type
    if (data.feature_type && [
      "Crater", "Mons", "Montes", "Mare", "Planitia", "Vallis", "Unknown"
    ].includes(data.feature_type)) {
      result.feature_type = data.feature_type;
    }

    // Validate filters
    if (data.filters && typeof data.filters === "object") {
      result.filters = {};
      
      if (data.filters.diameter_km && typeof data.filters.diameter_km === "object") {
        result.filters.diameter_km = {};
        if (typeof data.filters.diameter_km.$gt === "number") {
          result.filters.diameter_km.$gt = data.filters.diameter_km.$gt;
        }
        if (typeof data.filters.diameter_km.$lt === "number") {
          result.filters.diameter_km.$lt = data.filters.diameter_km.$lt;
        }
      }

      if (data.filters.latitude && typeof data.filters.latitude === "object") {
        result.filters.latitude = {};
        if (typeof data.filters.latitude.$gt === "number") {
          result.filters.latitude.$gt = data.filters.latitude.$gt;
        }
        if (typeof data.filters.latitude.$lt === "number") {
          result.filters.latitude.$lt = data.filters.latitude.$lt;
        }
      }

      if (data.filters.longitude && typeof data.filters.longitude === "object") {
        result.filters.longitude = {};
        if (typeof data.filters.longitude.$gt === "number") {
          result.filters.longitude.$gt = data.filters.longitude.$gt;
        }
        if (typeof data.filters.longitude.$lt === "number") {
          result.filters.longitude.$lt = data.filters.longitude.$lt;
        }
      }

      if (data.filters.proximity && typeof data.filters.proximity === "object") {
        result.filters.proximity = {};
        if (typeof data.filters.proximity.to === "string") {
          result.filters.proximity.to = data.filters.proximity.to;
        }
        if (typeof data.filters.proximity.km === "number") {
          result.filters.proximity.km = data.filters.proximity.km;
        }
      }
    }

    // Validate named_features
    if (Array.isArray(data.named_features)) {
      result.named_features = data.named_features.filter((f: any) => typeof f === "string");
    }

    // Validate intent
    if (data.intent && ["largest_crater", "search", "unknown"].includes(data.intent)) {
      result.intent = data.intent;
    }

    return result;
  }
}

// Export singleton instance
export const deepSeekParser = new DeepSeekParser();