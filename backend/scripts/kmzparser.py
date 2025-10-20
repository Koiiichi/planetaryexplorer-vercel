import zipfile
import io
import re
import json
import requests
from pathlib import Path
from xml.etree import ElementTree as ET
from typing import List, Dict, Optional

# Official USGS Planetary Nomenclature KMZ URLs
KMZ_SOURCES = {
    'moon': 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MOON_nomenclature_center_pts.kmz',
    'mars': 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MARS_nomenclature_center_pts.kmz',
    'mercury': 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MERCURY_nomenclature_center_pts.kmz',
    'venus': 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/VENUS_nomenclature_center_pts.kmz',
    'io': 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/IO_nomenclature_center_pts.kmz',
    'europa': 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/EUROPA_nomenclature_center_pts.kmz',
    'ganymede': 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/GANYMEDE_nomenclature_center_pts.kmz',
    'callisto': 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/CALLISTO_nomenclature_center_pts.kmz',
    'titan': 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/TITAN_nomenclature_center_pts.kmz',
}

def extract_category_from_name(name: str) -> str:
    """Extract feature category from IAU name pattern"""
    category_patterns = {
        'Crater': r'(?i)crater$',
        'Vallis': r'(?i)vallis$',
        'Mons': r'(?i)mons$',
        'Mare': r'(?i)mare$',
        'Lacus': r'(?i)lacus$',
        'Rupes': r'(?i)rupes$',
        'Dorsum': r'(?i)dorsum$',
        'Rima': r'(?i)rima$',
        'Planitia': r'(?i)planitia$',
        'Patera': r'(?i)patera$',
        'Tholus': r'(?i)tholus$',
        'Terra': r'(?i)terra$',
        'Chaos': r'(?i)chaos$',
        'Catena': r'(?i)catena$',
        'Regio': r'(?i)regio$',
        'Sulcus': r'(?i)sulcus$',
        'Linea': r'(?i)linea$',
        'Fossa': r'(?i)fossa$',
        'Tessera': r'(?i)tessera$',
        'Sinus': r'(?i)sinus$',
        'Promontorium': r'(?i)promontorium$',
    }
    
    for category, pattern in category_patterns.items():
        if re.search(pattern, name):
            return category
    
    return 'Crater'  # Default assumption

def download_kmz(url: str) -> bytes:
    """Download KMZ file from URL"""
    print(f"  Downloading from {url}...")
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    return response.content

def parse_kmz_to_features(kmz_data: bytes, body: str) -> List[Dict]:
    """Parse KMZ file and extract planetary features"""
    features = []
    
    # Open KMZ (which is a ZIP file)
    with zipfile.ZipFile(io.BytesIO(kmz_data), 'r') as z:
        # Find KML file inside KMZ
        kml_files = [f for f in z.namelist() if f.endswith('.kml')]
        if not kml_files:
            raise ValueError(f"No KML file found in KMZ for {body}")
        
        kml_data = z.read(kml_files[0]).decode('utf-8')
    
    # Parse KML XML
    root = ET.fromstring(kml_data)
    ns = {'kml': 'http://www.opengis.net/kml/2.2'}
    
    for placemark in root.findall('.//kml:Placemark', ns):
        try:
            # Extract name
            name_elem = placemark.find('.//kml:name', ns)
            if name_elem is None:
                continue
            name = name_elem.text.strip()
            
            # Extract coordinates
            coords_elem = placemark.find('.//kml:coordinates', ns)
            if coords_elem is None:
                continue
            coords_text = coords_elem.text.strip()
            lon, lat, *_ = coords_text.split(',')
            
            # Extract description (contains metadata)
            desc_elem = placemark.find('.//kml:description', ns)
            description = desc_elem.text if desc_elem is not None else ""
            
            # Parse diameter from description if present
            diameter = None
            diameter_match = re.search(r'Diameter[:\s]+([0-9.]+)\s*km', description, re.IGNORECASE)
            if diameter_match:
                diameter = float(diameter_match.group(1))
            
            # Extract origin/etymology
            origin = None
            origin_match = re.search(r'Origin[:\s]+(.+?)(?:\n|<br>|$)', description, re.IGNORECASE | re.DOTALL)
            if origin_match:
                origin = origin_match.group(1).strip()[:500]  # Limit length
            
            # Determine category
            category = extract_category_from_name(name)
            
            # Generate keywords
            keywords = [
                body.lower(),
                category.lower(),
                name.lower(),
            ]
            if diameter:
                if diameter > 100:
                    keywords.append('large')
                elif diameter < 10:
                    keywords.append('small')
            
            feature = {
                'id': f"{body.lower()}_{name.lower().replace(' ', '_').replace('/', '_')}",
                'name': name,
                'body': body.lower(),
                'category': category,
                'lat': float(lat),
                'lon': float(lon),
                'diameter_km': diameter,
                'origin': origin,
                'keywords': keywords,
            }
            
            features.append(feature)
            
        except Exception as e:
            print(f"  Warning: Failed to parse placemark '{name if 'name' in locals() else 'unknown'}': {e}")
            continue
    
    return features

def process_all_nomenclature(bodies_to_process: List[str] = None):
    """Process KMZ files from URLs and save as JSON"""
    output_dir = Path('data/features')
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # If no specific bodies specified, process primary ones
    if bodies_to_process is None:
        bodies_to_process = ['moon', 'mars', 'mercury']
    
    all_features = []
    
    for body in bodies_to_process:
        if body not in KMZ_SOURCES:
            print(f"Skipping {body}: No KMZ source URL available")
            continue
        
        try:
            print(f"\nProcessing {body.upper()}...")
            
            # Download KMZ
            kmz_data = download_kmz(KMZ_SOURCES[body])
            
            # Parse features
            features = parse_kmz_to_features(kmz_data, body)
            print(f"  Found {len(features)} features")
            
            # Save body-specific file
            body_output = output_dir / f"{body}_features.json"
            with open(body_output, 'w', encoding='utf-8') as f:
                json.dump(features, f, indent=2, ensure_ascii=False)
            
            all_features.extend(features)
            
        except Exception as e:
            print(f"  Error processing {body}: {e}")
            continue
    
    if not all_features:
        print("\n No features were processed successfully")
        return
    
    # Save combined file
    combined_output = output_dir / 'all_features.json'
    with open(combined_output, 'w', encoding='utf-8') as f:
        json.dump(all_features, f, indent=2, ensure_ascii=False)
    
    print(f"\n{'='*50}")
    print(f"Total features processed: {len(all_features)}")
    print(f"Saved to: {output_dir}")
    
    # Print body breakdown
    print(f"\n{'Body':<15} {'Features':>10}")
    print('-' * 27)
    body_counts = {}
    for feature in all_features:
        body = feature['body']
        body_counts[body] = body_counts.get(body, 0) + 1
    
    for body, count in sorted(body_counts.items()):
        print(f"{body.capitalize():<15} {count:>10}")
    
    # Print category breakdown
    print(f"\n{'Category':<20} {'Count':>10}")
    print('-' * 32)
    categories = {}
    for feature in all_features:
        cat = feature['category']
        categories[cat] = categories.get(cat, 0) + 1
    
    for cat, count in sorted(categories.items(), key=lambda x: -x[1])[:15]:
        print(f"{cat:<20} {count:>10}")
    
    print(f"{'='*50}\n")

if __name__ == '__main__':
    import sys
    
    # Allow specifying bodies as command line arguments
    # Example: python kmzparser.py moon mars venus
    bodies = sys.argv[1:] if len(sys.argv) > 1 else None
    
    process_all_nomenclature(bodies)