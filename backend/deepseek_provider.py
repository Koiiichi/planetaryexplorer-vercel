"""DeepSeek API integration for natural language search"""
import json
import logging
import os
import re
import time
from typing import Dict, List, Optional, Any
from dataclasses import dataclass

import httpx

# Configure logging
logger = logging.getLogger(__name__)

@dataclass
class SearchResult:
    body: str
    lat: float
    lon: float
    layer_id: str
    confidence: float
    tags: List[str]
    feature_name: Optional[str] = None


class DeepSeekProvider:
    """DeepSeek-based natural language search provider"""
    
    def __init__(self):
        self.api_key = os.getenv('DEEPSEEK_API_KEY')
        self.model = os.getenv('DEEPSEEK_MODEL', 'deepseek-chat')
        self.timeout = int(os.getenv('AI_SEARCH_TIMEOUT_MS', '1500')) / 1000
        self.enabled = os.getenv('AI_SEARCH_ENABLE', 'false').lower() == 'true'
        
        # Synonym mapping for feature types and bodies
        self.synonyms = {
            "moon": ["moon", "luna", "selene", "lunar"],
            "mars": ["mars", "martian", "red planet"],
            "mercury": ["mercury"],
            "mountain": ["mountain", "mountains", "mons", "montes", "peak", "peaks"],
            "crater": ["crater", "craters"],
            "valley": ["vallis", "valley", "valleys", "valles"],
            "sea": ["mare", "maria", "sea", "seas"],
            "bay": ["sinus", "bay", "bays"],
            "ridge": ["dorsum", "dorsa", "ridge", "ridges"],
            "plain": ["planitia", "plains", "plain"],
        }
        
    def is_available(self) -> bool:
        """Check if DeepSeek provider is available"""
        return self.enabled and bool(self.api_key)
        
    async def search(self, query: str, gazetteer_features: List[Dict]) -> Optional[SearchResult]:
        """
        Use DeepSeek to parse natural language query and find matching feature
        
        Args:
            query: Natural language search query
            gazetteer_features: List of available features to search through
            
        Returns:
            SearchResult if found, None if not found or API unavailable
        """
        if not self.is_available():
            return None
            
        try:
            start_time = time.time()
            
            # Prepare context for DeepSeek
            sample_features = gazetteer_features[:50]  # Limit context size
            bodies = list(set(f.get('body', '') for f in sample_features))
            categories = list(set(f.get('category', '') for f in sample_features))
            
            # Create the prompt
            prompt = self._build_prompt(query, bodies, categories, sample_features)
            
            # Call DeepSeek API
            result = await self._call_deepseek_api(prompt)
            
            if result:
                # Find matching feature in gazetteer
                search_result = self._match_to_gazetteer(result, gazetteer_features)
                
                # Log performance
                latency = (time.time() - start_time) * 1000
                logger.info(f"DeepSeek API call completed: latency={latency:.1f}ms, result_found={search_result is not None}")
                
                if search_result:
                    logger.info(f"DeepSeek match: '{search_result.feature_name}' with confidence {search_result.confidence:.2f}")
                else:
                    logger.warning(f"DeepSeek found no matches for query: '{query}'")
                
                return search_result
                
        except Exception as e:
            logger.error(f"DeepSeek provider error: {e}")
            return None
            
        return None
        
    def _build_prompt(self, query: str, bodies: List[str], categories: List[str], sample_features: List[Dict]) -> str:
        """Build the prompt for DeepSeek API"""
        
        # Sample feature names for context
        feature_examples = [f.get('name', '') for f in sample_features[:10] if f.get('name')]
        
        prompt = f"""You are helping with planetary feature search. Parse this query and extract key information.

Query: "{query}"

Available bodies: {', '.join(bodies)}
Available categories: {', '.join(categories)}
Example features: {', '.join(feature_examples[:5])}

Please respond with a JSON object containing:
{{
    "body": "moon|mars|mercury|null",
    "feature_type": "crater|mountain|valley|sea|plain|ridge|bay|null", 
    "feature_name": "specific feature name if mentioned|null",
    "size_preference": "large|small|null",
    "confidence": 0.0-1.0
}}

Examples:
- "show me large mountains on moon" -> {{"body": "moon", "feature_type": "mountain", "feature_name": null, "size_preference": "large", "confidence": 0.9}}
- "find Tycho crater" -> {{"body": null, "feature_type": "crater", "feature_name": "Tycho", "size_preference": null, "confidence": 0.95}}
- "Mars valleys" -> {{"body": "mars", "feature_type": "valley", "feature_name": null, "size_preference": null, "confidence": 0.8}}

Respond only with valid JSON, no explanations."""
        
        return prompt
        
    async def _call_deepseek_api(self, prompt: str) -> Optional[Dict]:
        """Call DeepSeek API with timeout and error handling"""
        if not self.api_key:
            return None
            
        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json'
        }
        
        payload = {
            'model': self.model,
            'messages': [
                {'role': 'user', 'content': prompt}
            ],
            'max_tokens': 200,
            'temperature': 0.1
        }
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    'https://api.deepseek.com/v1/chat/completions',
                    headers=headers,
                    json=payload
                )
                
                if response.status_code == 200:
                    data = response.json()
                    content = data['choices'][0]['message']['content'].strip()
                    
                    # Parse JSON response
                    try:
                        return json.loads(content)
                    except json.JSONDecodeError:
                        # Try to extract JSON from response
                        json_match = re.search(r'\{.*\}', content, re.DOTALL)
                        if json_match:
                            return json.loads(json_match.group())
                        return None
                else:
                    logger.error(f"DeepSeek API error: HTTP {response.status_code}")
                    return None
                    
        except httpx.TimeoutException:
            logger.warning(f"DeepSeek API timeout after {self.timeout}s")
            return None
        except Exception as e:
            logger.error(f"DeepSeek API exception: {e}")
            return None
            
    def _match_to_gazetteer(self, parsed_result: Dict, gazetteer_features: List[Dict]) -> Optional[SearchResult]:
        """Match parsed DeepSeek result to actual gazetteer features"""
        
        body = parsed_result.get('body')
        feature_type = parsed_result.get('feature_type')
        feature_name = parsed_result.get('feature_name')
        size_preference = parsed_result.get('size_preference')
        confidence = parsed_result.get('confidence', 0.5)
        
        # Filter features based on parsed criteria
        candidates = []
        
        for feature in gazetteer_features:
            score = 0
            
            # Body match
            if body and feature.get('body', '').lower() == body.lower():
                score += 40
            elif not body:
                score += 10  # No body specified, slight bonus
                
            # Feature name exact match (highest priority)
            if feature_name and feature.get('name', '').lower() == feature_name.lower():
                score += 100
            elif feature_name and feature_name.lower() in feature.get('name', '').lower():
                score += 50
                
            # Feature type match using synonyms
            if feature_type:
                feature_category = feature.get('category', '').lower()
                feature_keywords = [kw.lower() for kw in feature.get('keywords', [])]
                
                # Check if feature type matches category or keywords
                synonyms_for_type = self.synonyms.get(feature_type, [feature_type])
                if any(syn in feature_category or syn in ' '.join(feature_keywords) 
                      for syn in synonyms_for_type):
                    score += 30
                    
            # Size preference (if diameter available)
            if size_preference and feature.get('diameter_km'):
                diameter = feature.get('diameter_km')
                if size_preference == 'large' and diameter > 50:
                    score += 20
                elif size_preference == 'small' and diameter < 10:
                    score += 20
                    
            if score > 0:
                candidates.append({
                    'feature': feature,
                    'score': score
                })
                
        if not candidates:
            return None
            
        # Sort by score and return best match
        candidates.sort(key=lambda x: x['score'], reverse=True)
        best_match = candidates[0]['feature']
        
        return SearchResult(
            body=best_match.get('body', ''),
            lat=best_match.get('lat', 0.0),
            lon=best_match.get('lon', 0.0), 
            layer_id=f"{best_match.get('body', '')}_default",
            confidence=confidence * (candidates[0]['score'] / 100),
            tags=best_match.get('keywords', []),
            feature_name=best_match.get('name')
        )


class KeywordProvider:
    """Fallback keyword-based search provider"""
    
    def __init__(self):
        self.synonyms = {
            "moon": ["moon", "luna", "selene", "lunar"],
            "mars": ["mars", "martian", "red planet"],
            "mercury": ["mercury"],
            "mountain": ["mountain", "mountains", "mons", "montes"],
            "crater": ["crater", "craters"], 
            "valley": ["vallis", "valley", "valleys"],
        }
        
    def search(self, query: str, gazetteer_features: List[Dict]) -> Optional[SearchResult]:
        """Simple keyword-based search through features"""
        
        query_lower = query.lower()
        candidates = []
        
        # Extract body and feature type from query
        body = None
        feature_type = None
        
        for body_key, synonyms in self.synonyms.items():
            if any(syn in query_lower for syn in synonyms):
                if body_key in ['moon', 'mars', 'mercury']:
                    body = body_key
                else:
                    feature_type = body_key
                    
        # Find matching features
        for feature in gazetteer_features:
            score = 0
            
            # Body filter
            if body and feature.get('body', '').lower() != body.lower():
                continue
                
            # Name match
            feature_name = feature.get('name', '').lower()
            if query_lower in feature_name or feature_name in query_lower:
                score += 50
                
            # Keyword match  
            keywords = [kw.lower() for kw in feature.get('keywords', [])]
            if any(query_lower in kw or kw in query_lower for kw in keywords):
                score += 25
                
            # Category match
            if feature_type and feature_type in feature.get('category', '').lower():
                score += 30
                
            if score > 0:
                candidates.append({
                    'feature': feature,
                    'score': score
                })
                
        if not candidates:
            return None
            
        # Return best match
        candidates.sort(key=lambda x: x['score'], reverse=True)
        best_match = candidates[0]['feature']
        
        logger.info(f"Keyword provider match: '{best_match.get('name')}' with score {candidates[0]['score']}")
        
        return SearchResult(
            body=best_match.get('body', ''),
            lat=best_match.get('lat', 0.0),
            lon=best_match.get('lon', 0.0),
            layer_id=f"{best_match.get('body', '')}_default", 
            confidence=0.7,
            tags=best_match.get('keywords', []),
            feature_name=best_match.get('name')
        )
