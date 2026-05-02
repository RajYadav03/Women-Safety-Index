/**
 * useKinematicDetection — Snatch & Drop Detection
 *
 * Uses Accelerometer and Gyroscope from expo-sensors to detect:
 *
 * 1. SNATCH: Sudden high G-force (>25 m/s²) + rapid rotation
 *    → Phone ripped from hand
 *
 * 2. DROP: Near-zero G (weightlessness) followed by high-G impact
 *    → Phone thrown or dropped (possible assault)
 *
 * When detected, fires a callback to trigger the SOS system.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { Accelerometer, Gyroscope } from 'expo-sensors';

// ── Thresholds ──
const SNATCH_G_THRESHOLD = 25;       // m/s² — sudden yank
const SNATCH_ROTATION_THRESHOLD = 8; // rad/s — rapid spin after yank
const DROP_WEIGHTLESS_THRESHOLD = 2; // m/s² — near zero G (freefall)
const DROP_IMPACT_THRESHOLD = 30;    // m/s² — hard impact after freefall
const WEIGHTLESS_DURATION_MS = 200;  // Must be weightless for at least 200ms
const COOLDOWN_MS = 10000;           // 10s cooldown between detections

// Sensor update interval
const SENSOR_INTERVAL_MS = 50; // 20 Hz

export type KinematicEvent = 'snatch' | 'drop' | null;

interface UseKinematicDetectionReturn {
  isMonitoring: boolean;
  lastEvent: KinematicEvent;
  currentG: number;
  startMonitoring: () => void;
  stopMonitoring: () => void;
}

export default function useKinematicDetection(
  onThreatDetected: (event: 'snatch' | 'drop') => void,
  enabled: boolean = true,
): UseKinematicDetectionReturn {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [lastEvent, setLastEvent] = useState<KinematicEvent>(null);
  const [currentG, setCurrentG] = useState(9.8);

  // Refs for sensor data (avoid re-renders on every tick)
  const accelRef = useRef({ x: 0, y: 0, z: 9.8 });
  const gyroRef = useRef({ x: 0, y: 0, z: 0 });
  const weightlessStartRef = useRef<number | null>(null);
  const lastTriggerRef = useRef(0);
  const accelSubRef = useRef<any>(null);
  const gyroSubRef = useRef<any>(null);

  // ── Calculate resultant G-force ──
  const calcG = (x: number, y: number, z: number): number => {
    return Math.sqrt(x * x + y * y + z * z);
  };

  // ── Calculate rotation magnitude ──
  const calcRotation = (x: number, y: number, z: number): number => {
    return Math.sqrt(x * x + y * y + z * z);
  };

  // ── Fire detection event ──
  const fireEvent = useCallback((event: 'snatch' | 'drop') => {
    const now = Date.now();
    if (now - lastTriggerRef.current < COOLDOWN_MS) return; // Cooldown active

    lastTriggerRef.current = now;
    setLastEvent(event);
    console.log(`[Kinematic] ${event.toUpperCase()} detected! G=${calcG(
      accelRef.current.x,
      accelRef.current.y,
      accelRef.current.z
    ).toFixed(1)}`);

    onThreatDetected(event);
  }, [onThreatDetected]);

  // ── Process sensor data on each tick ──
  const processTick = useCallback(() => {
    const g = calcG(accelRef.current.x, accelRef.current.y, accelRef.current.z);
    const rotation = calcRotation(gyroRef.current.x, gyroRef.current.y, gyroRef.current.z);

    setCurrentG(g);

    // --- SNATCH Detection ---
    // High G + high rotation = phone being yanked away
    if (g > SNATCH_G_THRESHOLD && rotation > SNATCH_ROTATION_THRESHOLD) {
      fireEvent('snatch');
      return;
    }

    // --- DROP Detection (2-phase) ---
    const now = Date.now();

    // Phase 1: Detect weightlessness (freefall)
    if (g < DROP_WEIGHTLESS_THRESHOLD) {
      if (weightlessStartRef.current === null) {
        weightlessStartRef.current = now;
      }
    } else {
      // Phase 2: Impact after sufficient weightlessness
      if (weightlessStartRef.current !== null) {
        const weightlessDuration = now - weightlessStartRef.current;

        if (weightlessDuration >= WEIGHTLESS_DURATION_MS && g > DROP_IMPACT_THRESHOLD) {
          fireEvent('drop');
        }
      }
      weightlessStartRef.current = null;
    }
  }, [fireEvent]);

  // ── Start monitoring ──
  const startMonitoring = useCallback(() => {
    if (Platform.OS === 'web' || isMonitoring) return;

    // Set sensor update intervals
    Accelerometer.setUpdateInterval(SENSOR_INTERVAL_MS);
    Gyroscope.setUpdateInterval(SENSOR_INTERVAL_MS);

    // Subscribe to accelerometer
    accelSubRef.current = Accelerometer.addListener((data) => {
      // expo-sensors returns G in units of g (9.8 m/s²), convert to m/s²
      accelRef.current = {
        x: data.x * 9.81,
        y: data.y * 9.81,
        z: data.z * 9.81,
      };
      processTick();
    });

    // Subscribe to gyroscope
    gyroSubRef.current = Gyroscope.addListener((data) => {
      gyroRef.current = data; // Already in rad/s
    });

    setIsMonitoring(true);
    console.log('[Kinematic] Monitoring started');
  }, [isMonitoring, processTick]);

  // ── Stop monitoring ──
  const stopMonitoring = useCallback(() => {
    if (accelSubRef.current) {
      accelSubRef.current.remove();
      accelSubRef.current = null;
    }
    if (gyroSubRef.current) {
      gyroSubRef.current.remove();
      gyroSubRef.current = null;
    }
    setIsMonitoring(false);
    weightlessStartRef.current = null;
    console.log('[Kinematic] Monitoring stopped');
  }, []);

  // ── Auto-start when enabled ──
  useEffect(() => {
    if (enabled && Platform.OS !== 'web') {
      startMonitoring();
    }
    return () => stopMonitoring();
  }, [enabled]);

  return {
    isMonitoring,
    lastEvent,
    currentG,
    startMonitoring,
    stopMonitoring,
  };
}
