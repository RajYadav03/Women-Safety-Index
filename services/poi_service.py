"""
POI Service — On-demand Safe Zone Discovery via LLM
 
Instead of pre-fetching all safe zones (rate limit risk), this service:
1. Checks a local cache for the user's current locality
2. On cache miss: asks Groq to identify real safe zones
3. Caches the result for future lookups

Safe zones = real places with high crowd density:
  - Police stations, hospitals, malls, markets, temples, gurudwaras
"""
import json
import httpx
from pathlib import Path
from typing import Optional

from config import GROQ_API_KEY, BACKEND_ROOT

# ── Cache file ──
CACHE_FILE = BACKEND_ROOT / "safe_zones_cache.json"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.1-8b-instant"


def _load_cache() -> dict:
    """Load the safe zones cache from disk."""
    if CACHE_FILE.exists():
        try:
            return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        except:
            return {}
    return {}


def _save_cache(cache: dict):
    """Save the cache to disk."""
    CACHE_FILE.write_text(
        json.dumps(cache, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


SAFE_ZONE_PROMPT = """You are a location expert for India. Given a locality name and its approximate coordinates, identify exactly 3 REAL, well-known safe zones nearby where a woman could go for safety.

Safe zones should be REAL places that exist — police stations, government hospitals, busy malls, famous temples/gurudwaras, or crowded market areas.

Locality: {locality}
Approximate coordinates: {lat}, {lon}
State/Region: {region}

Respond ONLY with a valid JSON array of exactly 3 objects. No markdown, no explanation, just the JSON.
Each object must have:
- "name": Full real name of the place (e.g. "Phagwara Civil Hospital", "Select CityWalk Mall")
- "type": one of "police", "hospital", "mall", "market", "temple", "gurudwara"
- "lat": approximate latitude (float)
- "lon": approximate longitude (float)  
- "why_safe": one short sentence explaining why this is safe (e.g. "24/7 staffed government hospital with security")

Example response format:
[
  {{"name": "Phagwara Civil Hospital", "type": "hospital", "lat": 31.224, "lon": 75.770, "why_safe": "24/7 government hospital with security guards"}},
  {{"name": "BMC Chowk Police Station", "type": "police", "lat": 31.229, "lon": 75.776, "why_safe": "Main police station with women's helpdesk"}},
  {{"name": "Lovely Mall Phagwara", "type": "mall", "lat": 31.221, "lon": 75.773, "why_safe": "Busy commercial mall with CCTV and security"}}
]"""


def _guess_region(locality: str, lat: float, lon: float) -> str:
    """Guess the region based on coordinates."""
    if lat > 30.0 and lon > 74.0 and lon < 77.5:
        return "Punjab"
    elif lat > 28.0 and lat < 29.0 and lon > 76.5 and lon < 77.5:
        return "Delhi NCR"
    else:
        return "North India"


async def fetch_safe_zones(
    locality: str,
    lat: float,
    lon: float,
) -> list[dict]:
    """
    Fetch 3 safe zones for a locality.
    Uses cache first, then falls back to LLM.
    """
    # 1. Check cache
    cache = _load_cache()
    cache_key = locality.lower().strip()

    if cache_key in cache:
        print(f"[POI] Cache HIT for '{locality}'")
        return cache[cache_key]

    # 2. Cache miss — ask Groq
    if not GROQ_API_KEY:
        print("[POI] No GROQ_API_KEY — returning fallback")
        return _fallback_zones(locality, lat, lon)

    print(f"[POI] Cache MISS for '{locality}' — querying LLM...")

    region = _guess_region(locality, lat, lon)
    prompt = SAFE_ZONE_PROMPT.format(
        locality=locality, lat=lat, lon=lon, region=region
    )

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                GROQ_URL,
                headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
                json={
                    "model": GROQ_MODEL,
                    "messages": [
                        {"role": "system", "content": "You are a JSON-only API. Output raw JSON arrays only."},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.3,
                    "max_tokens": 512,
                },
            )

            if response.status_code != 200:
                print(f"[POI] Groq error: {response.status_code}")
                return _fallback_zones(locality, lat, lon)

            data = response.json()
            content = data["choices"][0]["message"]["content"].strip()

            # Parse JSON — handle markdown code blocks
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
                content = content.strip()

            zones = json.loads(content)

            # Validate structure
            if not isinstance(zones, list) or len(zones) == 0:
                return _fallback_zones(locality, lat, lon)

            # Ensure all fields exist
            validated = []
            for z in zones[:3]:
                validated.append({
                    "name": z.get("name", f"{locality} Safe Zone"),
                    "type": z.get("type", "unknown"),
                    "lat": float(z.get("lat", lat)),
                    "lon": float(z.get("lon", lon)),
                    "why_safe": z.get("why_safe", "Crowded area with public presence"),
                })

            # 3. Cache the result
            cache[cache_key] = validated
            _save_cache(cache)
            print(f"[POI] Cached {len(validated)} zones for '{locality}'")

            return validated

    except Exception as e:
        print(f"[POI] LLM error: {e}")
        return _fallback_zones(locality, lat, lon)


def _fallback_zones(locality: str, lat: float, lon: float) -> list[dict]:
    """Fallback when LLM is unavailable — generic nearby points."""
    return [
        {
            "name": f"{locality} Police Station",
            "type": "police",
            "lat": round(lat + 0.003, 6),
            "lon": round(lon + 0.002, 6),
            "why_safe": "Nearest police station — call 112 for immediate help",
        },
        {
            "name": f"{locality} Government Hospital",
            "type": "hospital",
            "lat": round(lat - 0.004, 6),
            "lon": round(lon + 0.005, 6),
            "why_safe": "Government hospital with 24/7 emergency services",
        },
        {
            "name": f"{locality} Main Market",
            "type": "market",
            "lat": round(lat + 0.002, 6),
            "lon": round(lon - 0.003, 6),
            "why_safe": "Busy market area with high foot traffic",
        },
    ]
