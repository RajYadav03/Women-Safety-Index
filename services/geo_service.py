"""
Geo Service — Resolves (lat, lon) to the nearest known Delhi locality
using Haversine distance.
"""
import math
import csv
from pathlib import Path
from typing import Tuple, Optional

from config import LOCALITIES_CSV


# ── In-memory locality table ──
_localities: list[dict] = []


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Returns the great-circle distance in **kilometres** between two
    (lat, lon) points on Earth.
    """
    R = 6371.0  # Earth radius in km
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    Δφ = math.radians(lat2 - lat1)
    Δλ = math.radians(lon2 - lon1)

    a = math.sin(Δφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(Δλ / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def load_localities() -> int:
    """Load the geocoded CSV into memory. Returns count of localities loaded."""
    global _localities
    _localities = []

    with open(LOCALITIES_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row["name"].strip()
            if not name:
                continue
            _localities.append({
                "name": name,
                "lat": float(row["latitude"]),
                "lon": float(row["longitude"]),
            })

    return len(_localities)


def find_nearest(lat: float, lon: float) -> Tuple[str, float]:
    """
    Find the nearest known locality to the given coordinates.

    Returns:
        (locality_name, distance_km)
    """
    if not _localities:
        raise RuntimeError("Localities not loaded. Call load_localities() first.")

    best_name = ""
    best_dist = float("inf")

    for loc in _localities:
        d = _haversine(lat, lon, loc["lat"], loc["lon"])
        if d < best_dist:
            best_dist = d
            best_name = loc["name"]

    return best_name, round(best_dist, 3)


def get_all_localities() -> list[dict]:
    """Return the full list of loaded localities with coordinates."""
    return list(_localities)
