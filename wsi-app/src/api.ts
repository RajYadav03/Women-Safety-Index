/**
 * WSI App — API Client
 * Connects to the FastAPI backend.
 */
import { Platform } from 'react-native';

const getBaseUrl = (): string => {
  // FORCE LIVE BACKEND FOR TESTING
  return 'https://wsi-backend-c7232ca7eb02.herokuapp.com';
};

export const API_BASE_URL = getBaseUrl();

// ── Request / Response types ──

export interface LuxAdjustment {
  adjusted_score: number;
  multiplier: number;
  lux_used: number | null;
  hour_used: number;
  nighttime: boolean;
  risk_level: 'critical' | 'moderate' | 'normal' | 'safe';
}

export interface LocalityStats {
  mean_safety: number;
  median_safety: number;
  n_incidents: number;
  mean_severity: number;
  median_lighting: number;
  median_crowd: number;
}

export interface PredictResponse {
  locality: string;
  distance_km: number;
  safety_index: number;
  adjusted_safety_index: number;
  category: string;
  stats: LocalityStats;
  lux_adjustment: LuxAdjustment;
}

export interface LocalityOverview {
  name: string;
  lat: number;
  lon: number;
  mean_safety: number;
  category: string;
}

/**
 * Fetch safety prediction with optional lux + hour.
 */
export async function fetchPrediction(
  lat: number,
  lon: number,
  lux?: number | null,
  hour?: number | null
): Promise<PredictResponse> {
  const body: Record<string, any> = { lat, lon };
  if (lux != null) body.lux = lux;
  if (hour != null) body.hour = hour;

  try {
    console.log(`[API] Calling Predict: ${API_BASE_URL}/predict`);
    const res = await fetch(`${API_BASE_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    
    if (!res.ok) {
      console.error(`[API] Predict Failed with status: ${res.status}`);
      throw new Error(`Prediction failed: ${res.status}`);
    }
    
    const data = await res.json();
    console.log(`[API] Predict Success: ${data.category}`);
    return data;
  } catch (err) {
    console.error(`[API] Network Error in Predict:`, err);
    throw err;
  }
}

/**
 * Fetch all localities for the map overlay.
 */
export async function fetchLocalities(): Promise<LocalityOverview[]> {
  const res = await fetch(`${API_BASE_URL}/localities`);
  if (!res.ok) throw new Error(`Localities fetch failed: ${res.status}`);
  return res.json();
}

// ── Safe Zones ──

export interface SafeZoneItem {
  name: string;
  type: string;
  lat: number;
  lon: number;
  why_safe: string;
  distance_km: number | null;
  uber_deeplink: string | null;
}

export interface SafeZoneResponse {
  locality: string;
  zones: SafeZoneItem[];
  source: string;
}

/**
 * Fetch nearby safe zones. LLM discovers real places on cache miss.
 */
export async function fetchSafeZones(
  lat: number,
  lon: number,
  locality?: string | null,
): Promise<SafeZoneResponse> {
  const body: Record<string, any> = { lat, lon };
  if (locality) body.locality = locality;

  const res = await fetch(`${API_BASE_URL}/safe-zones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Safe zones fetch failed: ${res.status}`);
  return res.json();
}

