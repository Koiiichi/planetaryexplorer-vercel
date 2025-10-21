"use client";

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

const TileViewer = dynamic(() => import('./tileViewer3'), { ssr: false });

interface TileViewerWrapperProps {
  searchQuery?: string;
  initialBody?: string;
  initialLat?: number;
  initialLon?: number;
  initialZoom?: number;
  hideUI?: boolean;
}

export default function TileViewerWrapper({ 
  searchQuery, 
  initialBody, 
  initialLat, 
  initialLon, 
  initialZoom,
  hideUI = true
}: TileViewerWrapperProps) {
  const router = useRouter();

  const handleSearchChange = (newSearch: string) => {
    // Update the URL to sync with the top search bar
    const url = new URL(window.location.href);
    if (newSearch.trim()) {
      url.searchParams.set('search', newSearch);
    } else {
      url.searchParams.delete('search');
    }
    router.replace(url.pathname + url.search, { scroll: false });
  };

  return (
    <TileViewer 
      externalSearchQuery={searchQuery}
      onSearchChange={handleSearchChange}
      initialBody={initialBody}
      initialLat={initialLat}
      initialLon={initialLon}
      initialZoom={initialZoom}
      hideUI={hideUI}
    />
  );
}
