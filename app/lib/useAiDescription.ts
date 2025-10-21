"use client";

import { useState, useEffect, useRef } from 'react';

interface UseAiDescriptionOptions {
  featureKey: string;
  meta?: {
    name: string;
    body: string;
    category?: string;
    lat?: number;
    lon?: number;
    diameter_km?: number;
  };
  enabled?: boolean;
}

interface AiDescriptionState {
  description: string | null;
  isLoading: boolean;
  error: Error | null;
}

// Cache to memoize descriptions by feature key with TTL
interface CachedDescription {
  description: string;
  timestamp: number;
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CACHE_KEY = 'pe_ai_descriptions';

// In-memory cache
const descriptionCache = new Map<string, string>();

// Load cache from localStorage on first use
let cacheLoaded = false;
function loadCacheFromStorage() {
  if (cacheLoaded || typeof window === 'undefined') return;
  cacheLoaded = true;
  
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (!stored) return;
    
    const parsed: Record<string, CachedDescription> = JSON.parse(stored);
    const now = Date.now();
    let expiredCount = 0;
    
    for (const [key, cached] of Object.entries(parsed)) {
      if (now - cached.timestamp < CACHE_TTL_MS) {
        descriptionCache.set(key, cached.description);
      } else {
        expiredCount++;
      }
    }
    
    console.log(`[useAiDescription] Loaded ${descriptionCache.size} cached descriptions (${expiredCount} expired)`);
  } catch (error) {
    console.warn('[useAiDescription] Failed to load cache from localStorage:', error);
  }
}

// Save cache to localStorage
function saveCacheToStorage() {
  if (typeof window === 'undefined') return;
  
  try {
    const toStore: Record<string, CachedDescription> = {};
    const now = Date.now();
    
    for (const [key, description] of descriptionCache.entries()) {
      toStore[key] = {
        description,
        timestamp: now
      };
    }
    
    localStorage.setItem(CACHE_KEY, JSON.stringify(toStore));
  } catch (error) {
    console.warn('[useAiDescription] Failed to save cache to localStorage:', error);
  }
}

/**
 * Hook to fetch AI-generated descriptions for planetary features
 * Memoizes by featureKey to avoid refetching the same feature
 */
export function useAiDescription({
  featureKey,
  meta,
  enabled = true
}: UseAiDescriptionOptions): AiDescriptionState {
  const [state, setState] = useState<AiDescriptionState>({
    description: descriptionCache.get(featureKey) || null,
    isLoading: false,
    error: null
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled || !meta) {
      console.log('[useAiDescription] Skipped:', { enabled, hasMeta: !!meta, featureKey });
      return;
    }

    // If already cached, use cache
    if (descriptionCache.has(featureKey)) {
      console.log('[useAiDescription] Using cached description for:', featureKey);
      setState({
        description: descriptionCache.get(featureKey) || null,
        isLoading: false,
        error: null
      });
      return;
    }

    // Start fetching
    console.log('[useAiDescription] Starting fetch for:', featureKey);
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    // Cancel previous request if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const fetchDescription = async () => {
      try {
        const prompt = buildPrompt(meta);
        
        // Try to get API key from environment (client-side Next.js uses NEXT_PUBLIC_ prefix)
        const apiKey = process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY || 
                       (typeof window !== 'undefined' && (window as any).__DEEPSEEK_KEY__);

        if (!apiKey) {
          // Silently fail if no API key configured - use fallback description
          console.info('[useAiDescription] No API key configured, skipping AI description');
          setState({
            description: null,
            isLoading: false,
            error: null
          });
          return;
        }
        
        console.log('[useAiDescription] Fetching description for:', featureKey);

        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              {
                role: 'system',
                content: 'You are a planetary science expert. Provide concise, factual descriptions of planetary features in 1-2 sentences. Be specific and educational.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.2,
            max_tokens: 150
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const description = data.choices?.[0]?.message?.content?.trim() || null;

        if (description) {
          descriptionCache.set(featureKey, description);
          // Persist to localStorage
          saveCacheToStorage();
        }

        if (!controller.signal.aborted) {
          setState({
            description,
            isLoading: false,
            error: null
          });
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('[useAiDescription] Error fetching description:', error);
          setState({
            description: null,
            isLoading: false,
            error: error as Error
          });
        }
      }
    };

    // Add slight delay to avoid hammering the API on rapid selections
    const timeoutId = setTimeout(fetchDescription, 300);

    return () => {
      clearTimeout(timeoutId);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [featureKey, meta, enabled]);

  return state;
}

function buildPrompt(meta: {
  name: string;
  body: string;
  category?: string;
  lat?: number;
  lon?: number;
  diameter_km?: number;
}): string {
  const parts = [`Describe ${meta.name}`];
  
  if (meta.category) {
    parts.push(`a ${meta.category.toLowerCase()}`);
  }
  
  parts.push(`on ${meta.body}`);
  
  if (meta.diameter_km) {
    parts.push(`with a diameter of ${meta.diameter_km.toFixed(1)} km`);
  }
  
  if (meta.lat !== undefined && meta.lon !== undefined) {
    parts.push(`located at ${meta.lat.toFixed(2)}°, ${meta.lon.toFixed(2)}°`);
  }
  
  parts.push('. Keep it under 50 words.');
  
  return parts.join(' ');
}
