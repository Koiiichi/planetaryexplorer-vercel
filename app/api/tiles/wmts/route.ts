import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');

  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  try {
    // Fetch the tile from the external source
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'PlanetaryExplorer/1.0',
      },
    });

    if (!response.ok) {
      return new NextResponse(`Tile fetch failed: ${response.status}`, { 
        status: response.status 
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 's-maxage=86400, stale-while-revalidate',
      },
    });
  } catch (error) {
    console.error('Tile proxy error:', error);
    return new NextResponse('Failed to fetch tile', { status: 500 });
  }
}
