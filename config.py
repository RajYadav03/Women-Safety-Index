"""
WSI Backend — Configuration & Paths
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# ── Backend root is the current folder ──
BACKEND_ROOT = Path(__file__).resolve().parent

# ── Explicitly load .env ──
BACKEND_ENV = BACKEND_ROOT / ".env"
load_dotenv(BACKEND_ENV)

# ── Data files (now living inside the backend folder) ──
LOCALITIES_CSV = BACKEND_ROOT / "localities_delhi_geocoded.csv"
AGGREGATES_JSON = BACKEND_ROOT / "locality_aggregates.json"
MODEL_JSON = BACKEND_ROOT / "xgboost_wsi_model.json"

# ── Server ──
HOST = os.getenv("WSI_HOST", "0.0.0.0")
PORT = int(os.getenv("WSI_PORT", "8000"))

# ── CORS (React Native / Expo dev client) ──
CORS_ORIGINS = [
    "*",  # Allow all during local development
]

# ── Safety thresholds ──
THRESHOLD_LOW = 0.4
THRESHOLD_HIGH = 0.7

# ── External APIs ──
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
