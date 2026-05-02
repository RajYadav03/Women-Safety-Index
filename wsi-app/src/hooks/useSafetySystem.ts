/**
 * useSafetySystem — SOS Mission Control State Machine
 *
 * Lifecycle:
 *   IDLE  →  TRIGGERED  →  DISPATCHED  →  COOLDOWN  →  IDLE
 *              ↓ (cancel)
 *            IDLE
 *
 * This hook is the "Source of Truth" for all emergency modules.
 * Kinematics, Audio, and Chat will all plug into this.
 */
import { useState, useRef, useCallback } from 'react';
import { Vibration, Platform } from 'react-native';
import { API_BASE_URL } from '../api';

// ── Types ──
export type SOSState = 'IDLE' | 'TRIGGERED' | 'DISPATCHED' | 'COOLDOWN';

export interface GoldenPacket {
  lat: number;
  lon: number;
  lux: number | null;
  timestamp: string;
  locality: string | null;
  safety_index: number | null;
  category: string | null;
}

export interface SOSResult {
  status: string;
  sos_id: string;
  message: string;
  timestamp: string;
}

interface UseSafetySystemReturn {
  sosState: SOSState;
  countdown: number;
  lastResult: SOSResult | null;
  triggerSource: 'button' | 'kinematic' | 'chat' | null;
  triggerSOS: (source?: 'button' | 'kinematic' | 'chat') => void;
  cancelSOS: () => void;
  confirmSOS: () => void;
}

const COUNTDOWN_SECONDS = 5;
const COOLDOWN_SECONDS = 30;

export default function useSafetySystem(
  userLoc: { lat: number; lon: number } | null,
  lux: number | null,
  locality: string | null,
  safetyIndex: number | null,
  category: string | null,
  onDispatch?: () => Promise<void> | void,
): UseSafetySystemReturn {
  const [sosState, setSosState] = useState<SOSState>('IDLE');
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [lastResult, setLastResult] = useState<SOSResult | null>(null);
  const [triggerSource, setTriggerSource] = useState<'button' | 'kinematic' | 'chat' | null>(null);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Build the Golden Packet ──
  const buildGoldenPacket = useCallback((): GoldenPacket => {
    return {
      lat: userLoc?.lat ?? 0,
      lon: userLoc?.lon ?? 0,
      lux: lux,
      timestamp: new Date().toISOString(),
      locality: locality,
      safety_index: safetyIndex,
      category: category,
    };
  }, [userLoc, lux, locality, safetyIndex, category]);

  // ── Dispatch to backend ──
  const dispatchSOS = useCallback(async () => {
    setSosState('DISPATCHED');

    // Call the onDispatch callback (e.g. lock audio evidence)
    if (onDispatch) {
      try { await onDispatch(); } catch {}
    }

    // Vibration pattern: long buzz for emergency
    if (Platform.OS !== 'web') {
      Vibration.vibrate([0, 500, 200, 500, 200, 500]);
    }

    const packet = buildGoldenPacket();

    try {
      const res = await fetch(`${API_BASE_URL}/sos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(packet),
      });

      if (!res.ok) throw new Error(`SOS dispatch failed: ${res.status}`);

      const result: SOSResult = await res.json();
      setLastResult(result);

      console.log(`[SOS] Dispatched: ${result.sos_id}`);
    } catch (err: any) {
      console.error('[SOS] Dispatch error:', err);
      setLastResult({
        status: 'failed',
        sos_id: 'LOCAL',
        message: `SOS triggered but backend unreachable. Location: ${packet.lat.toFixed(4)}, ${packet.lon.toFixed(4)}. Time: ${packet.timestamp}`,
        timestamp: packet.timestamp,
      });
    }

    // Move to cooldown after a brief display period
    cooldownRef.current = setTimeout(() => {
      setSosState('COOLDOWN');
      // Return to IDLE after cooldown
      cooldownRef.current = setTimeout(() => {
        setSosState('IDLE');
        setLastResult(null);
      }, COOLDOWN_SECONDS * 1000);
    }, 5000); // Show "dispatched" for 5 seconds
  }, [buildGoldenPacket, onDispatch]);

  // ── Clear any running timers ──
  const clearTimers = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (cooldownRef.current) {
      clearTimeout(cooldownRef.current);
      cooldownRef.current = null;
    }
  }, []);

  // ── Trigger SOS — starts 5-second countdown ──
  const triggerSOS = useCallback((source: 'button' | 'kinematic' | 'chat' = 'button') => {
    if (sosState !== 'IDLE') return;

    clearTimers();
    setSosState('TRIGGERED');
    setCountdown(COUNTDOWN_SECONDS);
    setLastResult(null);
    setTriggerSource(source);

    // Haptic feedback
    if (Platform.OS !== 'web') {
      Vibration.vibrate(200);
    }

    // Start countdown
    let remaining = COUNTDOWN_SECONDS;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);

      // Tick vibration
      if (Platform.OS !== 'web') {
        Vibration.vibrate(100);
      }

      if (remaining <= 0) {
        clearTimers();
        dispatchSOS();
      }
    }, 1000);
  }, [sosState, clearTimers, dispatchSOS]);

  // ── Cancel SOS — "False Alarm" ──
  const cancelSOS = useCallback(() => {
    if (sosState !== 'TRIGGERED') return;

    clearTimers();
    setSosState('IDLE');
    setCountdown(COUNTDOWN_SECONDS);
    console.log('[SOS] Cancelled by user');
  }, [sosState, clearTimers]);

  // ── Confirm SOS — skip countdown, dispatch immediately ──
  const confirmSOS = useCallback(() => {
    if (sosState !== 'TRIGGERED') return;

    clearTimers();
    dispatchSOS();
  }, [sosState, clearTimers, dispatchSOS]);

  return {
    sosState,
    countdown,
    lastResult,
    triggerSource,
    triggerSOS,
    cancelSOS,
    confirmSOS,
  };
}
