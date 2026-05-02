"""
Pydantic schemas for WSI API requests and responses.
"""
from pydantic import BaseModel, Field
from typing import Optional


# ────────────────────────────────────────────
# /predict
# ────────────────────────────────────────────
class PredictRequest(BaseModel):
    """Payload sent by the React Native app."""
    lat: float = Field(..., description="Latitude of the user's location")
    lon: float = Field(..., description="Longitude of the user's location")
    lux: Optional[float] = Field(
        None,
        description="Ambient light sensor reading (lux). None if sensor unavailable.",
    )
    hour: Optional[int] = Field(
        None,
        ge=0, le=23,
        description="Current hour (0-23). If omitted, server uses its own clock.",
    )

class ChatRequest(BaseModel):
    """Payload sent by the React Native app for Gemini chat."""
    message: str = Field(..., description="User's prompt or question")
    lat: float = Field(..., description="Latitude")
    lon: float = Field(..., description="Longitude")
    lux: Optional[float] = Field(None, description="Lux reading")
    hour: Optional[int] = Field(None, description="Current hour")
    history: Optional[list[dict]] = Field(None, description="Previous conversation messages")
class LocalityStats(BaseModel):
    """Pre-computed aggregate stats for a locality."""
    mean_safety: float
    median_safety: float
    n_incidents: int
    mean_severity: float
    median_lighting: float
    median_crowd: float


class LuxAdjustment(BaseModel):
    """Details of the lux-based safety penalty/bonus."""
    adjusted_score: float = Field(..., description="Safety score after lux penalty (0-1)")
    multiplier: float = Field(..., description="Penalty multiplier applied (e.g. 0.60 = -40%)")
    lux_used: Optional[float] = Field(None, description="Lux value used for calculation")
    hour_used: int = Field(..., description="Hour used (0-23)")
    nighttime: bool = Field(..., description="Whether it's nighttime (20:00-05:00)")
    risk_level: str = Field(..., description="critical / moderate / normal / safe")
    shadow_active: bool = Field(False, description="Whether Shadow Penalty is triggered (dark commercial zone)")
    temporal_bypass: bool = Field(False, description="If True, lux penalty was skipped (daytime = phone in pocket)")
    location_type: str = Field("residential", description="Location type of the matched locality")
    expected_night_lux: float = Field(15, description="Expected nighttime lux for this location type")


class PredictResponse(BaseModel):
    """Response returned to the app after prediction."""
    locality: str
    location_type: str = Field("residential", description="Location type (commercial/campus/highway/residential/safe_ip)")
    distance_km: float = Field(..., description="Distance from user to matched locality centre (km)")
    safety_index: float = Field(..., ge=0, le=1, description="Raw safety index from aggregates")
    adjusted_safety_index: float = Field(..., ge=0, le=1, description="Safety index after lux adjustment")
    category: str = Field(..., description="Low Safety / Moderate Safety / High Safety")
    stats: LocalityStats
    lux_adjustment: LuxAdjustment


# ────────────────────────────────────────────
# /localities
# ────────────────────────────────────────────
class LocalityOverview(BaseModel):
    """Compact locality info for the map view."""
    name: str
    lat: float
    lon: float
    mean_safety: float
    category: str


# ────────────────────────────────────────────
# /health
# ────────────────────────────────────────────
class HealthResponse(BaseModel):
    status: str = "ok"
    localities_loaded: int
    model_loaded: bool


# ────────────────────────────────────────────
# /sos
# ────────────────────────────────────────────
class SOSRequest(BaseModel):
    """The 'Golden Packet' — everything needed for emergency dispatch."""
    lat: float = Field(..., description="User latitude at time of SOS")
    lon: float = Field(..., description="User longitude at time of SOS")
    lux: Optional[float] = Field(None, description="Ambient light at time of SOS")
    timestamp: str = Field(..., description="ISO-8601 UTC timestamp of the trigger")
    locality: Optional[str] = Field(None, description="Resolved locality name")
    safety_index: Optional[float] = Field(None, description="Adjusted safety index at trigger time")
    category: Optional[str] = Field(None, description="Safety category at trigger time")


class SOSResponse(BaseModel):
    """Response after SOS dispatch."""
    status: str = Field(..., description="dispatched / failed")
    sos_id: str = Field(..., description="Unique identifier for this SOS event")
    message: str = Field(..., description="LLM-generated emergency summary")
    timestamp: str = Field(..., description="Server-side UTC timestamp")


# ────────────────────────────────────────────
# /safe-zones
# ────────────────────────────────────────────
class SafeZoneRequest(BaseModel):
    """Request to find safe zones near the user."""
    lat: float = Field(..., description="User latitude")
    lon: float = Field(..., description="User longitude")
    locality: Optional[str] = Field(None, description="Known locality name (skips geo lookup)")


class SafeZoneItem(BaseModel):
    """A single safe zone / POI."""
    name: str = Field(..., description="Real name of the safe zone")
    type: str = Field(..., description="police / hospital / mall / market / temple / gurudwara")
    lat: float
    lon: float
    why_safe: str = Field(..., description="Why this place is safe")
    distance_km: Optional[float] = Field(None, description="Distance from user")
    uber_deeplink: Optional[str] = Field(None, description="Uber deep link URL")


class SafeZoneResponse(BaseModel):
    """Response with nearby safe zones."""
    locality: str
    zones: list[SafeZoneItem]
    source: str = Field(..., description="'cache' or 'llm' — where the data came from")

