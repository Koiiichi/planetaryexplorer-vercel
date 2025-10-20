#!/usr/bin/env python3
"""
Smoke test for search providers
"""

import asyncio
import json
import os
import sys
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent
sys.path.insert(0, str(backend_path))

from search_engine import search_features
from deepseek_provider import DeepSeekProvider, KeywordProvider


async def test_search_providers():
    """Test search providers with various queries"""
    
    print("🔍 Testing search providers...")
    
    # Test queries
    test_queries = [
        "show me large mountains on moon",
        "Tycho crater", 
        "Mars valleys",
        "Mercury craters",
        "Olympus Mons"
    ]
    
    # Initialize providers
    deepseek = DeepSeekProvider()
    keyword = KeywordProvider()
    
    print(f"DeepSeek available: {deepseek.is_available()}")
    print(f"DeepSeek config: enabled={deepseek.enabled}, has_key={bool(deepseek.api_key)}")
    print()
    
    passed_tests = 0
    total_tests = 0
    
    for query in test_queries:
        print(f"Testing query: '{query}'")
        total_tests += 1
        
        try:
            # Test main search function
            result = await search_features(query)
            
            if result.get('found'):
                print(f"  ✅ Found: {result['feature']['name']} on {result['body']}")
                print(f"  Provider: {result.get('provider', 'unknown')}")
                print(f"  Coordinates: {result['center']['lat']:.4f}, {result['center']['lon']:.4f}")
                passed_tests += 1
            else:
                print(f"  ❌ No results found")
                print(f"  Suggestions: {result.get('suggestions', [])}")
        
        except Exception as e:
            print(f"  ❌ Error: {e}")
        
        print()
    
    # Special test for Moon + Mons query
    moon_mountain_query = "show me large mountains on moon"
    print(f"🎯 Special test: '{moon_mountain_query}'")
    
    try:
        result = await search_features(moon_mountain_query)
        
        if result.get('found') and result.get('body') == 'moon':
            print("  ✅ Moon mountain query returned Moon result")
            # Validate that we got Moon coordinates
            lat, lon = result['center']['lat'], result['center']['lon']
            if -90 <= lat <= 90 and -180 <= lon <= 180:
                print("  ✅ Valid coordinates")
            else:
                print(f"  ❌ Invalid coordinates: {lat}, {lon}")
        else:
            print(f"  ❌ Expected Moon result, got: {result.get('body', 'None')}")
    except Exception as e:
        print(f"  ❌ Special test failed: {e}")
    
    print(f"\n📊 Results: {passed_tests}/{total_tests} tests passed")
    
    if passed_tests == 0:
        print("❌ All tests failed - check feature data loading")
        return False
    elif passed_tests < total_tests // 2:
        print("⚠️  Many tests failed - check configuration")
        return False
    else:
        print("✅ Search providers working correctly")
        return True


def validate_environment():
    """Validate environment configuration"""
    print("🔧 Validating environment...")
    
    issues = []
    
    # Check if features data exists
    features_file = Path("data/features/all_features.json")
    if not features_file.exists():
        issues.append(f"Missing features file: {features_file}")
    else:
        try:
            with open(features_file) as f:
                features = json.load(f)
                print(f"  ✅ Features loaded: {len(features)} items")
        except Exception as e:
            issues.append(f"Error reading features: {e}")
    
    # Check DeepSeek configuration
    ai_enabled = os.getenv('AI_SEARCH_ENABLE', 'false').lower() == 'true'
    api_key = os.getenv('DEEPSEEK_API_KEY')
    
    if ai_enabled:
        if api_key:
            print("  ✅ DeepSeek API key configured")
        else:
            issues.append("AI search enabled but no API key provided")
    else:
        print("  ℹ️  AI search disabled (set AI_SEARCH_ENABLE=true to enable)")
    
    if issues:
        print("\n❌ Environment issues:")
        for issue in issues:
            print(f"  - {issue}")
        return False
    
    print("  ✅ Environment validation passed")
    return True


async def main():
    """Run all tests"""
    print("🧪 Search Provider Test Suite")
    print("=" * 50)
    
    # Validate environment first
    if not validate_environment():
        print("\n❌ Environment validation failed")
        sys.exit(1)
    
    print()
    
    # Run search tests
    success = await test_search_providers()
    
    if success:
        print("\n🎉 All tests completed successfully!")
        sys.exit(0)
    else:
        print("\n❌ Some tests failed")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
