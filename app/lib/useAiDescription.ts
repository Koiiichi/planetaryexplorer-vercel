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

// Cache to memoize descriptions by feature key
const descriptionCache = new Map<string, string>();

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
      return;
    }

    // If already cached, use cache
    if (descriptionCache.has(featureKey)) {
      setState({
        description: descriptionCache.get(featureKey) || null,
        isLoading: false,
        error: null
      });
      return;
    }

    // Start fetching
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
        const apiKey = process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY;

        if (!apiKey) {
          // Silently fail if no API key configured
          setState({
            description: null,
            isLoading: false,
            error: null
          });
          return;
        }

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
