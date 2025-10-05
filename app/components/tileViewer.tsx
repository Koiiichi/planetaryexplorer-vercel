"use client";

import { useEffect, useRef } from "react";
import OpenSeadragon from "openseadragon";

const DEFAULT_GAIA_IMAGE =
  "https://upload.wikimedia.org/wikipedia/commons/2/21/Milky_Way_Galaxy.jpg";

const TileViewer = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const imageUrl = process.env.NEXT_PUBLIC_GAIA_SKYMAP_URL || DEFAULT_GAIA_IMAGE;

    viewerRef.current?.destroy();

    viewerRef.current = OpenSeadragon({
      element: containerRef.current,
      prefixUrl:
        "https://cdn.jsdelivr.net/npm/openseadragon@5.0.1/build/openseadragon/images/",
      showNavigator: true,
      navigatorPosition: "BOTTOM_RIGHT",
      crossOriginPolicy: "Anonymous",
      tileSources: [
        {
          type: "image",
          url: imageUrl,
          buildPyramid: false,
        } as any,
      ],
    });

    return () => {
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, []);

  return (
    <div className="w-full">
      <div
        ref={containerRef}
        style={{ height: "500px", width: "100%" }}
        className="rounded-lg border border-white/10 bg-black"
      />
    </div>
  );
};

export default TileViewer;
