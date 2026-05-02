"""
Prediction Service — Looks up pre-computed safety data from
locality_aggregates.json and applies real-time Lux + time-of-day
+ location-type-aware penalties to produce a dynamic safety score.
"""
import json
from datetime import datetime
from typing import Optional

from config import AGGREGATES_JSON, THRESHOLD_LOW, THRESHOLD_HIGH


# ── In-memory aggregates ──
_aggregates: dict[str, dict] = {}


def load_aggregates() -> int:
    """Load locality_aggregates.json into memory. Returns count loaded."""
    global _aggregates
    with open(AGGREGATES_JSON, "r", encoding="utf-8") as f:
        _aggregates = json.load(f)
    return len(_aggregates)


def categorise(safety_index: float) -> str:
    """Map a 0-1 safety index to a human-readable category."""
    if safety_index >= THRESHOLD_HIGH:
        return "High Safety"
    elif safety_index >= THRESHOLD_LOW:
        return "Moderate Safety"
    else:
        return "Low Safety"


def get_prediction(locality_name: str) -> Optional[dict]:
    """
    Look up the pre-computed safety data for a locality.

    Returns a dict with keys:
        mean_safety, median_safety, n_incidents,
        mean_severity, median_lighting, median_crowd,
        location_type, expected_night_lux, ...
    or None if the locality isn't found.
    """
    if not _aggregates:
        raise RuntimeError("Aggregates not loaded. Call load_aggregates() first.")

    # Try exact match first
    data = _aggregates.get(locality_name)
    if data:
        return data

    # Case-insensitive fallback
    name_lower = locality_name.strip().lower()
    for key, val in _aggregates.items():
        if key.lower() == name_lower:
            return val

    return None


# ─────────────────────────────────────────────
# Location-type lux profiles (from Safety_Requirements.md)
# ─────────────────────────────────────────────
LOCATION_TYPE_PROFILES = {
    "commercial": {
        "expected_night_lux": 350,
        "alert_threshold": 50,
        "shadow_lux_threshold": 20,
        "shadow_penalty": 0.40,
    },
    "campus": {
        "expected_night_lux": 100,
        "alert_threshold": 20,
        "shadow_lux_threshold": 10,
        "shadow_penalty": 0.25,
    },
    "highway": {
        "expected_night_lux": 40,
        "alert_threshold": 10,
        "shadow_lux_threshold": 5,
        "shadow_penalty": 0.20,
    },
    "residential": {
        "expected_night_lux": 15,
        "alert_threshold": 5,
        "shadow_lux_threshold": 3,
        "shadow_penalty": 0.0,
    },
    "safe_ip": {
        "expected_night_lux": 200,
        "alert_threshold": 30,
        "shadow_lux_threshold": 15,
        "shadow_penalty": 0.35,
    },
}


# ─────────────────────────────────────────────
# Lux Penalty System (v2: location-type-aware + temporal coupling)
# ─────────────────────────────────────────────

def _is_nighttime(hour: int) -> bool:
    """Check if the hour falls within nighttime (20:00 - 05:00)."""
    return hour >= 20 or hour < 6


def _is_daytime(hour: int) -> bool:
    """Check if the hour falls within daytime (6:00 - 18:00)."""
    return 6 <= hour <= 18


def compute_lux_penalty(lux: float, hour: int, location_type: str = "residential") -> dict:
    """
    Compute the penalty details based on lux, time, and location type.

    Returns dict with:
      multiplier: float (0.35 to 1.05)
      shadow_active: bool (is the "Shadow" penalty triggered)
      temporal_bypass: bool (daytime — lux ignored)
      risk_level: str
    """
    profile = LOCATION_TYPE_PROFILES.get(location_type, LOCATION_TYPE_PROFILES["residential"])

    # ── Temporal Coupling: daytime low lux = phone in pocket, ignore ──
    if _is_daytime(hour):
        return {
            "multiplier": 1.0,
            "shadow_active": False,
            "temporal_bypass": True,
            "risk_level": "normal",
        }

    # ── Nighttime: apply location-type-aware thresholds ──
    alert_threshold = profile["alert_threshold"]
    shadow_threshold = profile["shadow_lux_threshold"]

    # Base penalty from absolute lux level
    if lux < 5:
        base_multiplier = 0.60    # -40%
    elif lux < 20:
        base_multiplier = 0.80    # -20%
    elif lux < 100:
        base_multiplier = 1.00    # baseline
    else:
        base_multiplier = 1.00    # no bonus, just baseline

    # "Shadow" Penalty: location type expects higher lux but actual is very low
    shadow_active = False
    shadow_mult = 0.0
    if lux < shadow_threshold and profile["shadow_penalty"] > 0:
        shadow_active = True
        shadow_mult = profile["shadow_penalty"]

    # Combined multiplier
    multiplier = base_multiplier * (1.0 - shadow_mult)

    # Nighttime hard override: lux < 10 during night → force at least -30%
    if lux < 10 and _is_nighttime(hour):
        multiplier = min(multiplier, 0.70)

    multiplier = max(0.35, min(1.05, multiplier))  # clamp

    # Risk level
    if lux < alert_threshold:
        risk_level = "critical"
    elif lux < profile["expected_night_lux"] * 0.5:
        risk_level = "moderate"
    elif lux >= profile["expected_night_lux"]:
        risk_level = "safe"
    else:
        risk_level = "normal"

    return {
        "multiplier": round(multiplier, 2),
        "shadow_active": shadow_active,
        "temporal_bypass": False,
        "risk_level": risk_level,
    }


def apply_lux_adjustment(
    base_score: float,
    lux: Optional[float],
    hour: Optional[int],
    location_type: str = "residential",
) -> dict:
    """
    Apply lux penalty to a base safety score.

    Args:
        base_score: The raw safety index from aggregates (0-1)
        lux: Ambient light reading in lux (None if sensor unavailable)
        hour: Current hour (0-23) (None to use server time)
        location_type: Type of locality (commercial/campus/highway/residential/safe_ip)

    Returns:
        dict with:
            adjusted_score, multiplier, lux_used, hour_used,
            nighttime, risk_level, shadow_active, temporal_bypass,
            location_type, expected_night_lux
    """
    if hour is None:
        hour = datetime.now().hour

    profile = LOCATION_TYPE_PROFILES.get(location_type, LOCATION_TYPE_PROFILES["residential"])

    # If no lux data, return base score unchanged
    if lux is None:
        return {
            "adjusted_score": base_score,
            "multiplier": 1.0,
            "lux_used": None,
            "hour_used": hour,
            "nighttime": _is_nighttime(hour),
            "risk_level": "normal",
            "shadow_active": False,
            "temporal_bypass": False,
            "location_type": location_type,
            "expected_night_lux": profile["expected_night_lux"],
        }

    penalty = compute_lux_penalty(lux, hour, location_type)
    adjusted = max(0.0, min(1.0, base_score * penalty["multiplier"]))

    return {
        "adjusted_score": round(adjusted, 4),
        "multiplier": penalty["multiplier"],
        "lux_used": lux,
        "hour_used": hour,
        "nighttime": _is_nighttime(hour),
        "risk_level": penalty["risk_level"],
        "shadow_active": penalty["shadow_active"],
        "temporal_bypass": penalty["temporal_bypass"],
        "location_type": location_type,
        "expected_night_lux": profile["expected_night_lux"],
    }
