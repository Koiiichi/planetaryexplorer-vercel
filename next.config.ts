import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'trek.nasa.gov',
        pathname: '/tiles/**',
      },
      {
        protocol: 'https',
        hostname: 'gibs.earthdata.nasa.gov',
        pathname: '/wmts/**',
      },
      {
        protocol: 'https',
        hostname: 'server.arcgisonline.com',
        pathname: '/ArcGIS/**',
      },
      {
        protocol: 'https',
        hostname: 'tile.openstreetmap.org',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        pathname: '/**',
      },
    ],
    // For tile images, use unoptimized to avoid next/image processing overhead
    unoptimized: true,
  },
};

export default nextConfig;
