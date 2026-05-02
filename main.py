"""
WSI FastAPI Backend — Main Application
"""
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

from config import CORS_ORIGINS
from models.schemas import (
    PredictRequest,
    PredictResponse,
    LocalityStats,
    LocalityOverview,
    LuxAdjustment,
    HealthResponse,
    ChatRequest,
    SOSRequest,
    SOSResponse,
    SafeZoneRequest,
    SafeZoneItem,
    SafeZoneResponse,
)
from config import BACKEND_ROOT
from services import geo_service, prediction_service, llm_service, poi_service


# ─────────────────────────────────────────────
# App lifespan — load data once at startup
# ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load ML artifacts into memory on startup."""
    n_localities = geo_service.load_localities()
    n_aggregates = prediction_service.load_aggregates()
    print(f"[OK] Loaded {n_localities} localities, {n_aggregates} aggregate profiles")
    yield  # app is running
    print("[STOP] Shutting down WSI backend")


# ─────────────────────────────────────────────
# FastAPI instance
# ─────────────────────────────────────────────
app = FastAPI(
    title="Women Safety Index — Delhi & Punjab",
    description=(
        "Backend API for the WSI mobile app. "
        "Accepts location coordinates + ambient light (lux) and returns "
        "a dynamic safety score with real-time lux penalties."
    ),
    version="1.1.0",
    lifespan=lifespan,
)

# CORS — allow the Expo dev client to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────
@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health():
    """Health-check endpoint."""
    return HealthResponse(
        status="ok",
        localities_loaded=len(geo_service.get_all_localities()),
        model_loaded=True,
    )


@app.post("/predict", response_model=PredictResponse, tags=["Prediction"])
async def predict(req: PredictRequest):
    """
    Accepts GPS coordinates + optional Lux reading + hour.
    Resolves the nearest locality, looks up the base safety score,
    then applies real-time lux penalties to produce a dynamic score.
    """
    # 1. Find nearest locality
    locality_name, distance_km = geo_service.find_nearest(req.lat, req.lon)

    # 2. Look up pre-computed safety data
    data = prediction_service.get_prediction(locality_name)
    if data is None:
        raise HTTPException(
            status_code=404,
            detail=f"No safety data available for locality: {locality_name}",
        )

    base_safety = data["mean_safety"]
    location_type = data.get("location_type", "residential")

    # 3. Apply lux penalty (location-type-aware + temporal coupling)
    lux_result = prediction_service.apply_lux_adjustment(
        base_score=base_safety,
        lux=req.lux,
        hour=req.hour,
        location_type=location_type,
    )

    adjusted_safety = lux_result["adjusted_score"]
    category = prediction_service.categorise(adjusted_safety)

    return PredictResponse(
        locality=locality_name,
        location_type=location_type,
        distance_km=distance_km,
        safety_index=round(base_safety, 4),
        adjusted_safety_index=adjusted_safety,
        category=category,
        stats=LocalityStats(
            mean_safety=round(data["mean_safety"], 4),
            median_safety=round(data["median_safety"], 4),
            n_incidents=data["n_incidents"],
            mean_severity=round(data["mean_severity"], 4),
            median_lighting=round(data["median_lighting"], 4),
            median_crowd=round(data["median_crowd"], 4),
        ),
        lux_adjustment=LuxAdjustment(
            adjusted_score=lux_result["adjusted_score"],
            multiplier=lux_result["multiplier"],
            lux_used=lux_result["lux_used"],
            hour_used=lux_result["hour_used"],
            nighttime=lux_result["nighttime"],
            risk_level=lux_result["risk_level"],
            shadow_active=lux_result["shadow_active"],
            temporal_bypass=lux_result["temporal_bypass"],
            location_type=lux_result["location_type"],
            expected_night_lux=lux_result["expected_night_lux"],
        ),
    )

@app.post("/chat", tags=["AI"])
async def chat(req: ChatRequest):
    """
    Accepts a user message + coordinates + lux.
    Fetches the context, applies lux adjustments, and streams the Gemini LLM response.
    """
    try:
        locality_name, distance_km = geo_service.find_nearest(req.lat, req.lon)
        data = prediction_service.get_prediction(locality_name)
        
        if not data:
            raise HTTPException(status_code=404, detail="No safety data found.")

        base_safety = data["mean_safety"]
        location_type = data.get("location_type", "residential")

        lux_result = prediction_service.apply_lux_adjustment(
            base_score=base_safety,
            lux=req.lux,
            hour=req.hour,
            location_type=location_type,
        )

        context_res = PredictResponse(
            locality=locality_name,
            location_type=location_type,
            distance_km=distance_km,
            safety_index=round(base_safety, 4),
            adjusted_safety_index=lux_result["adjusted_score"],
            category=prediction_service.categorise(lux_result["adjusted_score"]),
            stats=LocalityStats(
                mean_safety=round(data["mean_safety"], 4),
                median_safety=round(data["median_safety"], 4),
                n_incidents=data["n_incidents"],
                mean_severity=round(data["mean_severity"], 4),
                median_lighting=round(data["median_lighting"], 4),
                median_crowd=round(data["median_crowd"], 4),
            ),
            lux_adjustment=LuxAdjustment(**lux_result)
        )

        return StreamingResponse(
            llm_service.generate_chat_stream(
                req.message, 
                context_res, 
                req.history
            ), 
            media_type="text/event-stream"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────
# SOS Endpoint
# ─────────────────────────────────────────────
SOS_LOG = BACKEND_ROOT / "sos_log.json"


@app.post("/sos", response_model=SOSResponse, tags=["Emergency"])
async def sos_dispatch(req: SOSRequest):
    """
    Receives the 'Golden Packet' from the app when SOS is triggered.
    Logs the event and generates a well-formatted emergency summary.
    """
    sos_id = str(uuid.uuid4())[:8].upper()
    server_ts = datetime.now(timezone.utc).isoformat()
    local_ts = datetime.now().strftime("%I:%M %p, %d %B %Y")

    # Build context
    locality_name = req.locality or "Unknown Location"
    safety_pct = f"{req.safety_index * 100:.0f}%" if req.safety_index else "N/A"
    risk_label = req.category or "Unknown"
    maps_link = f"https://www.google.com/maps?q={req.lat},{req.lon}"

    # Describe lighting
    lux_desc = "Unknown"
    if req.lux is not None:
        if req.lux < 5:
            lux_desc = "⚫ Pitch black / No light"
        elif req.lux < 20:
            lux_desc = "🌑 Very dim / Poor visibility"
        elif req.lux < 60:
            lux_desc = "🌙 Low light"
        else:
            lux_desc = "💡 Well lit"

    # Build the formatted emergency message
    emergency_msg = (
        f"🚨 EMERGENCY SOS ALERT\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"\n"
        f"⚠️ A user has triggered an emergency alert and needs immediate help.\n"
        f"\n"
        f"📍 LOCATION\n"
        f"• Area: {locality_name}\n"
        f"• Coordinates: {req.lat:.4f}, {req.lon:.4f}\n"
        f"• Map: {maps_link}\n"
        f"\n"
        f"🕐 TIME\n"
        f"• Triggered at: {local_ts}\n"
        f"\n"
        f"📊 SAFETY ASSESSMENT\n"
        f"• Safety Index: {safety_pct}\n"
        f"• Risk Level: {risk_label}\n"
        f"• Lighting: {lux_desc}\n"
        f"\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"🆔 Alert ID: {sos_id}\n"
        f"📱 Sent via WSI Safety App\n"
        f"\n"
        f"If you receive this message, please try to contact the sender or call emergency services (112)."
    )

    # Log to file (append-only)
    log_entry = {
        "sos_id": sos_id,
        "lat": req.lat,
        "lon": req.lon,
        "lux": req.lux,
        "locality": locality_name,
        "safety_index": req.safety_index,
        "category": req.category,
        "client_timestamp": req.timestamp,
        "server_timestamp": server_ts,
        "message": emergency_msg,
        "maps_link": maps_link,
    }

    try:
        existing = []
        if SOS_LOG.exists():
            existing = json.loads(SOS_LOG.read_text(encoding="utf-8"))
        existing.append(log_entry)
        SOS_LOG.write_text(json.dumps(existing, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        print(f"[SOS] Failed to write log: {e}")

    print(f"[SOS] Alert {sos_id} dispatched for {locality_name}")

    return SOSResponse(
        status="dispatched",
        sos_id=sos_id,
        message=emergency_msg,
        timestamp=server_ts,
    )


# ─────────────────────────────────────────────
# Safe Zone Discovery
# ─────────────────────────────────────────────
def _haversine_quick(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Quick haversine distance in km."""
    import math
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


def _build_uber_deeplink(pickup_lat: float, pickup_lon: float, dest_lat: float, dest_lon: float, dest_name: str) -> str:
    """Build an Uber deep link URL for ride booking."""
    import urllib.parse
    # Uber universal deep link format
    params = urllib.parse.urlencode({
        "action": "setPickup",
        "pickup[latitude]": f"{pickup_lat:.6f}",
        "pickup[longitude]": f"{pickup_lon:.6f}",
        "pickup[nickname]": "Current Location",
        "dropoff[latitude]": f"{dest_lat:.6f}",
        "dropoff[longitude]": f"{dest_lon:.6f}",
        "dropoff[nickname]": dest_name,
    })
    return f"https://m.uber.com/ul/?{params}"


@app.post("/safe-zones", response_model=SafeZoneResponse, tags=["Safety"])
async def find_safe_zones(req: SafeZoneRequest):
    """
    Finds 3 real safe zones near the user's location.
    Uses LLM to discover real places, caches results per locality.
    Returns zones with Uber deep links for one-tap booking.
    """
    # 1. Resolve locality if not provided
    locality_name = req.locality
    if not locality_name:
        locality_name, _ = geo_service.find_nearest(req.lat, req.lon)

    # 2. Fetch safe zones (cache-first, LLM fallback)
    zones_raw = await poi_service.fetch_safe_zones(locality_name, req.lat, req.lon)

    # 3. Determine source
    cache = poi_service._load_cache()
    source = "cache" if locality_name.lower().strip() in cache else "llm"

    # 4. Enrich with distance + Uber deep links
    zones = []
    for z in zones_raw:
        dist = round(_haversine_quick(req.lat, req.lon, z["lat"], z["lon"]), 2)
        uber_link = _build_uber_deeplink(req.lat, req.lon, z["lat"], z["lon"], z["name"])

        zones.append(SafeZoneItem(
            name=z["name"],
            type=z["type"],
            lat=z["lat"],
            lon=z["lon"],
            why_safe=z["why_safe"],
            distance_km=dist,
            uber_deeplink=uber_link,
        ))

    # Sort by distance
    zones.sort(key=lambda z: z.distance_km or 999)

    return SafeZoneResponse(
        locality=locality_name,
        zones=zones,
        source=source,
    )


@app.get(
    "/localities",
    response_model=list[LocalityOverview],
    tags=["Data"],
)
async def list_localities():
    """
    Returns all 101 Delhi localities with their coordinates
    and pre-computed safety scores (for rendering on the map).
    """
    results = []
    for loc in geo_service.get_all_localities():
        data = prediction_service.get_prediction(loc["name"])
        if data is None:
            continue
        safety = data["mean_safety"]
        results.append(
            LocalityOverview(
                name=loc["name"],
                lat=loc["lat"],
                lon=loc["lon"],
                mean_safety=round(safety, 4),
                category=prediction_service.categorise(safety),
            )
        )
    return results


# ─────────────────────────────────────────────
# Run directly: python -m backend.main
# ─────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    from config import HOST, PORT

    uvicorn.run("backend.main:app", host=HOST, port=PORT, reload=True)
