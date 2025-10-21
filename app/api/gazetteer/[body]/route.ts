import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
// @ts-ignore - @mapbox/togeojson doesn't have complete types
import * as toGeoJSON from '@mapbox/togeojson';
import { DOMParser } from '@xmldom/xmldom';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KMZ_URLS: Record<string, string> = {
  moon: 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MOON_nomenclature_center_pts.kmz',
  mars: 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MARS_nomenclature_center_pts.kmz',
  mercury: 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MERCURY_nomenclature_center_pts.kmz',
  ceres: 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/CERES_nomenclature_center_pts.kmz',
  vesta: 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/VESTA_nomenclature_center_pts.kmz',
};

interface GazetteerFeature {
  id: string;
  name: string;
  lat: number;
  lon: number;
  type?: string;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ body: string }> }
) {
  const { body } = await ctx.params;
  const bodyLower = body.toLowerCase();

  if (!KMZ_URLS[bodyLower]) {
    return NextResponse.json(
      { error: `Invalid body. Must be one of: ${Object.keys(KMZ_URLS).join(', ')}` },
      { status: 400 }
    );
  }

  try {
    // Fetch KMZ from USGS S3
    const kmzUrl = KMZ_URLS[bodyLower];
    const response = await fetch(kmzUrl);
    
    if (!response.ok) {
      throw new Error(`KMZ fetch failed: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    
    // Unzip KMZ (KMZ is a zipped KML)
    const zip = await JSZip.loadAsync(arrayBuffer);
    const kmlFileName = Object.keys(zip.files).find(name => 
      name.toLowerCase().endsWith('.kml')
    );

    if (!kmlFileName) {
      throw new Error('No KML file found in KMZ');
    }

    const kmlText = await zip.files[kmlFileName].async('text');
    
    // Parse KML to GeoJSON
    const parser = new DOMParser();
    const kmlDoc = parser.parseFromString(kmlText, 'application/xml');
    const geojson = toGeoJSON.kml(kmlDoc);

    // Extract only needed fields
    const features: GazetteerFeature[] = [];
    
    for (const feature of geojson.features || []) {
      if (feature.geometry?.type !== 'Point') continue;
      
      const [lon, lat] = feature.geometry.coordinates;
      const name = feature.properties?.name || feature.properties?.Name || 'unnamed';
      
      features.push({
        id: `${bodyLower}_${name.toLowerCase().replace(/\s+/g, '_')}`,
        name,
        lat: Number(lat),
        lon: Number(lon),
        type: feature.properties?.type || feature.properties?.featureType,
      });
    }

    return NextResponse.json(features, {
      headers: {
        'Cache-Control': 's-maxage=86400, stale-while-revalidate=604800',
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error(`Error loading gazetteer for ${body}:`, error);
    return NextResponse.json(
      { error: 'Failed to load gazetteer data' },
      { status: 500 }
    );
  }
}
