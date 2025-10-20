"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import { Search, MapPin, Compass } from 'lucide-react';
import GlassSearchBar from '../components/search_bar';
import TileViewerWrapper from '../components/tileViewWrapper';

function ExplorerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedBody, setSelectedBody] = useState<string | null>(null);
  const [navigationParams, setNavigationParams] = useState<{
    body?: string;
    lat?: number;
    lon?: number;
    zoom?: number;
  }>({});

  useEffect(() => {
    // Get the search query and filter from URL params
    const query = searchParams.get('search');
    const filter = searchParams.get('filter');
    
    // Set search query even if it's null or empty string
    if (query !== null) {
      setSearchQuery(query);
    } else {
      setSearchQuery(''); // Clear search if not in URL
    }
    
    // Get navigation and body parameters
    const bodyParam = searchParams.get('body');
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');
    const zoom = searchParams.get('zoom');
    
    // Prioritize filter parameter for selectedBody, fallback to body parameter
    const bodyValue = filter !== null ? filter : (bodyParam || null);
    setSelectedBody(bodyValue);
    
    setNavigationParams({
      body: bodyValue || undefined,
      lat: lat ? parseFloat(lat) : undefined,
      lon: lon ? parseFloat(lon) : undefined,
      zoom: zoom ? parseInt(zoom) : undefined,
    });
  }, [searchParams]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    // Update URL with search query and current filter (allow empty search)
    const params = new URLSearchParams();
    // Always include search param to trigger search update (even if empty)
    params.append('search', query.trim());
    if (selectedBody) {
      params.append('filter', selectedBody);
    }
    router.push(`/explorer?${params.toString()}`);
  };

  const handleFilterChange = (filter: string | null) => {
    setSelectedBody(filter);
    // Update URL with current search and new filter
    const params = new URLSearchParams();
    // Always include search param
    params.append('search', searchQuery.trim());
    if (filter) {
      params.append('filter', filter);
    }
    router.push(`/explorer?${params.toString()}`);
  };

  const handleBackToHome = () => {
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-black">
      {/* Header with Search Bar */}
      <header className="sticky top-0 z-50 bg-gray-900/80 backdrop-blur-md border-b border-white/10">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-8 py-6">
          <div className="flex items-center gap-4">
            {/* Logo */}
            <button
              onClick={handleBackToHome}
              className="flex items-center hover:opacity-80 transition-opacity"
              title="Back to home"
            >
              <Image 
                src="/logo_transparent.png" 
                alt="Logo" 
                width={200}
                height={96}
                className="h-16 w-auto"
                priority
              />
            </button>

            {/* Search bar with integrated filter */}
            <div className="flex-1">
              <GlassSearchBar 
                onSearch={handleSearch}
                value={searchQuery}
                placeholder={"Search planetary features, locations, coordinates..."}
                selectedFilter={selectedBody}
                onFilterChange={handleFilterChange}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Tile Viewer */}
      <main className="relative py-8 px-4 sm:px-8">
        <div className="max-w-[1800px] mx-auto">
          {/* Title and description */}
          <div className="mb-6">
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
              Planetary Explorer
            </h1>
            <p className="text-white/60 text-sm sm:text-base">
              {searchQuery 
                ? (
                  <>
                    Showing <span className="text-white/90 font-semibold capitalize">{selectedBody || "Moon"}</span> results for: <span className="text-white/90 font-semibold">&quot;{searchQuery}&quot;</span>
                  </>
                )
                : (
                  <>
                    Exploring <span className="text-white/90 font-semibold capitalize">{selectedBody || "Moon"}</span> - Use the filter dropdown and search to discover planetary features
                  </>
                )}
            </p>
          </div>
          
          {/* Tile viewer */}
          <div className="bg-gray-900/50 rounded-xl p-4 sm:p-6 backdrop-blur-sm border border-white/10 shadow-2xl">
            <TileViewerWrapper 
              searchQuery={searchQuery}
              initialBody={selectedBody || navigationParams.body}
              initialLat={navigationParams.lat}
              initialLon={navigationParams.lon}
              initialZoom={navigationParams.zoom}
            />
          </div>

          {/* Help section */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <h3 className="text-white font-semibold mb-2 text-sm flex items-center gap-2">
                <Search size={16} />
                Search
              </h3>
              <p className="text-white/60 text-xs">
                Type feature names or use coordinates to find locations
              </p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <h3 className="text-white font-semibold mb-2 text-sm flex items-center gap-2">
                <MapPin size={16} />
                Mark
              </h3>
              <p className="text-white/60 text-xs">
                Click on features to place markers and view details
              </p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <h3 className="text-white font-semibold mb-2 text-sm flex items-center gap-2">
                <Compass size={16} />
                Navigate
              </h3>
              <p className="text-white/60 text-xs">
                Pan, zoom, and explore gigapixel planetary imagery
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative py-6 px-4 text-center border-t border-white/10 mt-8">
      </footer>
    </div>
  );
}

export default function ExplorerPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-black flex items-center justify-center">
        <div className="text-white text-xl">Loading explorer...</div>
      </div>
    }>
      <ExplorerContent />
    </Suspense>
  );
}
