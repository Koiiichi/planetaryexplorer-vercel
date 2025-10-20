import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: { body: string } }
) {
  try {
    const { body } = params;
    
    // Validate body parameter
    const validBodies = ['moon', 'mars', 'mercury'];
    if (!validBodies.includes(body)) {
      return NextResponse.json(
        { error: `Invalid body. Must be one of: ${validBodies.join(', ')}` },
        { status: 400 }
      );
    }
    
    // Read features from local JSON file
    const featuresPath = join(process.cwd(), 'data', 'features', `${body}_features.json`);
    const featuresData = readFileSync(featuresPath, 'utf-8');
    const features = JSON.parse(featuresData);
    
    // Limit to first 200 for performance
    const limitedFeatures = features.slice(0, 200);
    
    return NextResponse.json(limitedFeatures, {
      headers: {
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error(`Error loading ${params.body} features:`, error);
    return NextResponse.json(
      { error: 'Failed to load features' },
      { status: 500 }
    );
  }
}
