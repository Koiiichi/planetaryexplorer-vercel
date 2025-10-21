"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import SearchBar from '../components/SearchBar';
import ResultCard from '../components/ResultCard';
import HUD from '../components/HUD';
import TileViewerWrapper from '../components/tileViewWrapper';

function ExplorerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedBody, setSelectedBody] = useState<string>("moon");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [showResultCard, setShowResultCard] = useState(false);
  const [showNotFound, setShowNotFound] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ name: string; body: string; category: string }>>([]);
  const [navigationParams, setNavigationParams] = useState<{
    body?: string;
    lat?: number;
    lon?: number;
    zoom?: number;
  }>({});

  useEffect(() => {
    const query = searchParams.get('search');
    const bodyParam = searchParams.get('body') || searchParams.get('filter');
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');
    const zoom = searchParams.get('zoom');
    
    if (bodyParam) {
      setSelectedBody(bodyParam);
    }
    
    setNavigationParams({
      body: bodyParam || undefined,
      lat: lat ? parseFloat(lat) : undefined,
      lon: lon ? parseFloat(lon) : undefined,
      zoom: zoom ? parseInt(zoom) : undefined,
    });
    
    if (query !== null) {
      setSearchQuery(query);
      if (query.trim()) {
        performSearch(query.trim());
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const performSearch = async (query: string) => {
    setIsSearching(true);
    setShowNotFound(false);
    setSuggestions([]);

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const result = await response.json();
      console.log('ui.flow', 'search_completed', { query, found: result.found });

      if (result.found) {
        setSelectedBody(result.body);
        setSearchResult(result.feature);
        setShowResultCard(true);
        
        const params = new URLSearchParams();
        params.append('search', query);
        params.append('body', result.body);
        params.append('lat', result.lat.toString());
        params.append('lon', result.lon.toString());
        params.append('zoom', '6');
        router.push(`/explorer?${params.toString()}`);
      } else {
        setShowNotFound(true);
        setSuggestions(result.suggestions || []);
        console.log('ui.flow', 'search_not_found', { query, suggestions: result.suggestions?.length || 0 });
      }
    } catch (error: any) {
      console.error('Search error:', error);
      setShowNotFound(true);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      performSearch(query.trim());
    }
  };

  const handleSuggestionSelect = (suggestion: { name: string; body: string; category: string }) => {
    setSuggestions([]);
    setShowNotFound(false);
    setSearchQuery(suggestion.name);
    handleSearch(suggestion.name);
  };

  const handleBodyChange = (body: string) => {
    setSelectedBody(body);
    const params = new URLSearchParams();
    if (searchQuery) {
      params.append('search', searchQuery);
    }
    params.append('body', body);
    router.push(`/explorer?${params.toString()}`);
  };

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      {/* Full-bleed viewer */}
      <div id="viewer" className="fixed inset-0" style={{ zIndex: 1 }}>
        <div className="w-full h-full">
          <TileViewerWrapper
            searchQuery={searchQuery}
            initialBody={navigationParams.body || selectedBody}
            initialLat={navigationParams.lat}
            initialLon={navigationParams.lon}
            initialZoom={navigationParams.zoom}
          />
        </div>
      </div>

      {/* Search bar overlay */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 w-full max-w-[720px] px-4 z-50">
        <SearchBar
          value={searchQuery}
          onSearch={handleSearch}
          isLoading={isSearching}
          suggestions={suggestions}
          onSuggestionSelect={handleSuggestionSelect}
          showNotFound={showNotFound}
          notFoundMessage="Try one of the suggestions below or refine your search"
          onDismissNotFound={() => setShowNotFound(false)}
        />
      </div>

      {/* HUD overlay */}
      <HUD
        selectedBody={selectedBody}
        onBodyChange={handleBodyChange}
        showZoomControls={false}
      />

      {/* Result card overlay */}
      <ResultCard
        isOpen={showResultCard}
        onClose={() => setShowResultCard(false)}
        feature={searchResult}
        provider={searchResult?.provider}
        aiDescription={searchResult?.ai_description}
      />

      {/* Footer */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 text-white/60 text-sm pointer-events-none" style={{ zIndex: 10 }}>
        Made with ❤️ by Slack Overflow
      </div>
    </div>
  );
}

export default function ExplorerPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 flex items-center justify-center bg-black">
        <div className="text-white text-xl">Loading explorer...</div>
      </div>
    }>
      <ExplorerContent />
    </Suspense>
  );
}
