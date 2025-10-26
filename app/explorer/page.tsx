"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import SearchBar from '../components/SearchBar';
import ResultCard from '../components/ResultCard';
import HUD from '../components/HUD';
import TileViewerWrapper from '../components/tileViewWrapper';
import AdvancedDrawer from '../components/AdvancedDrawer';

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
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Advanced settings state
  const [selectedDataset, setSelectedDataset] = useState<string>("default");
  const [splitViewEnabled, setSplitViewEnabled] = useState(false);
  const [splitLayerId, setSplitLayerId] = useState<string>("");
  const [osdToolbarVisible, setOsdToolbarVisible] = useState(false);
  const [projectionDebugEnabled, setProjectionDebugEnabled] = useState(false);
  const [longitudeDebugMode, setLongitudeDebugMode] = useState<"east-180" | "east-360">("east-180");

  // Load advanced settings from localStorage
  useEffect(() => {
    const storedAdvancedOpen = localStorage.getItem('pe_advanced_open');
    const storedDataset = localStorage.getItem('pe_dataset');
    const storedSplitView = localStorage.getItem('pe_split_view');
    const storedSplitLayer = localStorage.getItem('pe_split_layer');
    const storedOsdToolbar = localStorage.getItem('pe_osd_toolbar');
    const storedProjectionDebug = localStorage.getItem('pe_projection_debug');
    const storedLongitudeMode = localStorage.getItem('pe_longitude_mode');
    
    if (storedAdvancedOpen === 'true') {
      setShowAdvanced(true);
    }
    if (storedDataset) {
      setSelectedDataset(storedDataset);
    }
    if (storedSplitView === 'true') {
      setSplitViewEnabled(true);
    }
    if (storedSplitLayer) {
      setSplitLayerId(storedSplitLayer);
    }
    if (storedOsdToolbar === 'true') {
      setOsdToolbarVisible(true);
    }
    if (storedProjectionDebug === 'true') {
      setProjectionDebugEnabled(true);
    }
    if (storedLongitudeMode === 'east-360' || storedLongitudeMode === 'east-180') {
      setLongitudeDebugMode(storedLongitudeMode);
    }
  }, []);

  // Save advanced state to localStorage
  useEffect(() => {
    localStorage.setItem('pe_advanced_open', showAdvanced.toString());
  }, [showAdvanced]);
  
  useEffect(() => {
    localStorage.setItem('pe_dataset', selectedDataset);
  }, [selectedDataset]);
  
  useEffect(() => {
    localStorage.setItem('pe_split_view', splitViewEnabled.toString());
  }, [splitViewEnabled]);
  
  useEffect(() => {
    localStorage.setItem('pe_split_layer', splitLayerId);
  }, [splitLayerId]);
  
  useEffect(() => {
    localStorage.setItem('pe_osd_toolbar', osdToolbarVisible.toString());
  }, [osdToolbarVisible]);

  useEffect(() => {
    localStorage.setItem('pe_projection_debug', projectionDebugEnabled.toString());
  }, [projectionDebugEnabled]);

  useEffect(() => {
    localStorage.setItem('pe_longitude_mode', longitudeDebugMode);
  }, [longitudeDebugMode]);

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
            selectedDataset={selectedDataset}
            splitViewEnabled={splitViewEnabled}
            splitLayerId={splitLayerId}
            osdToolbarVisible={osdToolbarVisible}
            projectionDebugEnabled={projectionDebugEnabled}
            longitudeDebugMode={longitudeDebugMode}
            onFeatureSelected={(feature) => {
              console.log('[Explorer] Reverse search feature selected:', feature);
              setSearchResult(feature);
              setShowResultCard(true);
            }}
          />
        </div>
      </div>

      {/* Search bar overlay */}
      <div className="fixed top-5 left-1/2 -translate-x-1/2 w-full px-4 z-40">
        <div className="mx-auto max-w-[520px] md:max-w-[480px] sm:max-w-[420px]">
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
      </div>

      {/* HUD overlay */}
      <HUD
        selectedBody={selectedBody}
        onBodyChange={handleBodyChange}
        showZoomControls={false}
        showHomeButton={true}
        showAdvancedButton={true}
        onAdvancedToggle={() => setShowAdvanced(!showAdvanced)}
        advancedOpen={showAdvanced}
      />

      {/* Advanced drawer */}
      <AdvancedDrawer
        isOpen={showAdvanced}
        onClose={() => setShowAdvanced(false)}
        onDatasetChange={setSelectedDataset}
        onSplitViewToggle={setSplitViewEnabled}
        onSplitLayerChange={setSplitLayerId}
        onOsdToolbarToggle={setOsdToolbarVisible}
        onProjectionDebugToggle={setProjectionDebugEnabled}
        onLongitudeDebugModeChange={setLongitudeDebugMode}
        currentDataset={selectedDataset}
        currentBody={selectedBody}
        splitViewEnabled={splitViewEnabled}
        splitLayerId={splitLayerId}
        osdToolbarVisible={osdToolbarVisible}
        projectionDebugEnabled={projectionDebugEnabled}
        longitudeDebugMode={longitudeDebugMode}
      />

      {/* Result card overlay */}
      <ResultCard
        isOpen={showResultCard}
        onClose={() => setShowResultCard(false)}
        feature={searchResult}
        provider={searchResult?.provider}
        aiDescription={searchResult?.ai_description}
      />

      {/* Not found fallback glass card */}
      {showNotFound && !suggestions.length && (
        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md px-4 z-40">
          <div className="glass-card text-center">
            <div className="text-white/90 font-semibold text-lg mb-2">
              Feature Not Found
            </div>
            <p className="text-white/70 text-sm mb-4">
              The requested feature could not be found in our dataset, or the request was not understood. 
              Please try refining your search or use a different query.
            </p>
            <button
              onClick={() => setShowNotFound(false)}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

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
