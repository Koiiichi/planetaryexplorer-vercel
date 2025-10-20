import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'gibs.earthdata.nasa.gov' },
      { protocol: 'https', hostname: '*.nasa.gov' },
      { protocol: 'https', hostname: '*.usgs.gov' },
      { protocol: 'https', hostname: '*.jpl.nasa.gov' },
      { protocol: 'https', hostname: 'trek.nasa.gov' },
      { protocol: 'https', hostname: 'asc-planetarynames-data.s3.us-west-2.amazonaws.com' },
      { protocol: 'https', hostname: 'server.arcgisonline.com' },
      { protocol: 'https', hostname: 'tile.openstreetmap.org' }
    ],
  },
};

export default nextConfig;
