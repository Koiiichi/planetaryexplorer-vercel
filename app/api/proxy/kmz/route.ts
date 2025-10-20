import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return new NextResponse('Missing URL parameter', { status: 400 });
  }

  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();

    // Return the response with appropriate headers
    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.google-earth.kmz',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Error fetching KMZ:', error);
    return new NextResponse('Failed to fetch KMZ', { status: 500 });
  }
}