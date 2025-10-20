"""Enhanced search engine for planetary features with AI integration"""
import json
import logging
import time
from pathlib import Path
from typing import List, Dict, Optional
import re
import asyncio

from .deepseek_provider import DeepSeekProvider, KeywordProvider

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class FeatureSearchEngine:
    def __init__(self):
        self.features = []
        self.load_features()
    
    def load_features(self):
        """Load features from parsed JSON files"""
        features_file = Path('data/features/all_features.json')
        
        if not features_file.exists():
            print(f"Warning: {features_file} not found. Run: python backend/scripts/kmzparser.py moon")
            return
        
        try:
            with open(features_file, 'r', encoding='utf-8') as f:
                self.features = json.load(f)
            logger.info(f"Loaded {len(self.features)} planetary features from {features_file}")
            
            # Log feature distribution by body
            body_counts = {}
            for feature in self.features:
                body = feature.get('body', 'unknown')
                body_counts[body] = body_counts.get(body, 0) + 1
            logger.info(f"Feature distribution: {body_counts}")
        except Exception as e:
            logger.error(f"Error loading features from {features_file}: {e}")
    
    def search(self, query: str, body: Optional[str] = None, limit: int = 10) -> List[Dict]:
        """
        Simple text-based search through features
        
        Args:
            query: Search term (e.g., "tycho", "crater", "valley")
            body: Filter by celestial body (e.g., "moon", "mars")
            limit: Maximum results to return
        """
        if not self.features:
            return []
        
        query_lower = query.lower()
        results = []
        
        for feature in self.features:
            score = 0
            
            # Filter by body if specified
            if body and feature.get('body', '').lower() != body.lower():
                continue
            
            # Exact name match (highest priority)
            if query_lower == feature.get('name', '').lower():
                score = 100
            # Name contains query
            elif query_lower in feature.get('name', '').lower():
                score = 50
            # Keyword match
            elif any(query_lower in kw.lower() for kw in feature.get('keywords', [])):
                score = 25
            # Category match
            elif query_lower in feature.get('category', '').lower():
                score = 10
            
            if score > 0:
                results.append({**feature, '_match_score': score})
            
            if len(results) >= limit * 3:  # Get more for sorting
                break
        
        # Sort by match score
        results.sort(key=lambda x: x.get('_match_score', 0), reverse=True)
        return results[:limit]
    
    def parse_query(self, query: str) -> Dict:
        """Extract intent from natural language query"""
        query_lower = query.lower()
        
        # Extract body
        body = None
        if any(word in query_lower for word in ['moon', 'lunar', 'selene']):
            body = 'moon'
        elif any(word in query_lower for word in ['mars', 'martian', 'red planet']):
            body = 'mars'
        elif 'mercury' in query_lower:
            body = 'mercury'
        elif 'venus' in query_lower:
            body = 'venus'
        
        # Extract feature name (capitalized words)
        capitalized = re.findall(r'\b[A-Z][a-z]+\b', query)
        feature_name = ' '.join(capitalized) if capitalized else None
        
        # Extract search term
        search_term = feature_name if feature_name else query_lower
        
        # Remove common words
        stop_words = ['show', 'me', 'find', 'the', 'on', 'in', 'at', 'crater', 'craters']
        search_words = [w for w in search_term.split() if w.lower() not in stop_words]
        search_term = ' '.join(search_words) if search_words else search_term
        
        return {
            'body': body,
            'search_term': search_term,
            'raw_query': query
        }

# Global instance (loaded once at startup)
search_engine = FeatureSearchEngine()

async def search_features(query: str) -> Dict:
    """
    Main search function with AI provider fallback - returns formatted result for frontend
    
    Args:
        query: Natural language query (e.g., "Show me Tycho crater on the Moon")
    
    Returns:
        Dict with found status, feature data, and navigation info
    """
    start_time = time.time()
    provider_used = 'none'
    
    logger.info(f"Search request: '{query}' (length: {len(query)} chars)")
    
    # Initialize providers
    deepseek_provider = DeepSeekProvider()
    keyword_provider = KeywordProvider()
    
    logger.info(f"Provider status: DeepSeek={deepseek_provider.is_available()}, Keyword=always_available")
    
    # Try DeepSeek provider first
    search_result = None
    if deepseek_provider.is_available():
        try:
            logger.info("Attempting DeepSeek search...")
            search_result = await deepseek_provider.search(query, search_engine.features)
            if search_result:
                provider_used = 'deepseek'
                logger.info(f"DeepSeek success: found '{search_result.feature_name}' with confidence {search_result.confidence}")
        except Exception as e:
            logger.warning(f"DeepSeek provider failed: {e}")
    
    # Fallback to keyword provider
    if not search_result:
        try:
            logger.info("Attempting keyword search...")
            search_result = keyword_provider.search(query, search_engine.features)
            if search_result:
                provider_used = 'keyword'
                logger.info(f"Keyword success: found '{search_result.feature_name}'")
        except Exception as e:
            logger.warning(f"Keyword provider failed: {e}")
    
    # Fallback to original search engine
    if not search_result:
        logger.info("Attempting legacy search...")
        parsed = search_engine.parse_query(query)
        results = search_engine.search(
            parsed['search_term'],
            body=parsed['body'],
            limit=10
        )
        if results:
            provider_used = 'legacy'
            logger.info(f"Legacy search success: {len(results)} results")
    else:
        # Convert SearchResult to legacy format
        results = [{
            'name': search_result.feature_name,
            'body': search_result.body,
            'lat': search_result.lat,
            'lon': search_result.lon,
            'category': 'Feature',
            'keywords': search_result.tags,
            '_match_score': search_result.confidence * 100
        }]
        
    search_time = time.time() - start_time
    logger.info(f"Search completed in {search_time*1000:.1f}ms using {provider_used} provider")
    
    if not results:
        logger.info(f"No results found for query: '{query}'")
        return {
            'found': False,
            'message': f'No results found for "{query}"',
            'suggestions': [
                'Try: "Show me Tycho crater"',
                'Try: "Find valleys on Mars"',
                'Try: "Show me Olympus Mons"',
                'Try: "Mercury craters"'
            ],
            'provider': provider_used,
            'search_time_ms': search_time * 1000
        }
    
    # Format primary result
    primary = results[0]
    
        return {
            'found': True,
            'body': primary.get('body'),
            'center': {
                'lat': primary.get('lat'),
                'lon': primary.get('lon')
            },
            'feature': {
                'name': primary.get('name'),
                'category': primary.get('category'),
                'diameter_km': primary.get('diameter_km'),
                'origin': primary.get('origin')
            },
            'zoom': 6,
            'layer': f"{primary.get('body')}_default",
            'related_features': [
                {
                    'name': f.get('name'),
                    'category': f.get('category'),
                    'lat': f.get('lat'),
                    'lon': f.get('lon')
                }
                for f in results[1:6]  # Next 5 results
            ],
            'total_results': len(results),
            'provider': provider_used,
            'search_time_ms': search_time * 1000
        }
        
        logger.info(f"Search success: '{primary.get('name')}' on {primary.get('body')} via {provider_used} provider")
