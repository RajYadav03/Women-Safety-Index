/**
 * useLux — Hook for ambient light sensor
 *
 * Android: Uses expo-sensors LightSensor (real hardware)
 * iOS/Web: Not available — returns null
 *
 * On web, a LuxSimulator component lets users test with a slider.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';

interface LuxState {
  /** Current lux reading (null if sensor unavailable) */
  lux: number | null;
  /** Whether the sensor hardware is available */
  available: boolean;
  /** Manually override the lux value (for web simulator) */
  setManualLux: (value: number | null) => void;
}

export default function useLux(): LuxState {
  const [lux, setLux] = useState<number | null>(null);
  const [available, setAvailable] = useState(false);
  const [manualLux, setManualLux] = useState<number | null>(null);
  
  // Smoothing buffer
  const bufferRef = useRef<number[]>([]);

  useEffect(() => {
    // Web doesn't have a light sensor
    if (Platform.OS === 'web') {
      setAvailable(false);
      return;
    }

    let subscription: any = null;

    (async () => {
      try {
        // Dynamic import to avoid bundling on web
        const { LightSensor } = require('expo-sensors');

        const isAvailable = await LightSensor.isAvailableAsync();
        setAvailable(isAvailable);

        if (!isAvailable) return;

        // Set update interval (500ms is enough for our use case)
        LightSensor.setUpdateInterval(500);

        subscription = LightSensor.addListener(
          (data: { illuminance: number }) => {
            const raw = data.illuminance;
            
            // Apply simple 4-point moving average (2 seconds of data)
            bufferRef.current.push(raw);
            if (bufferRef.current.length > 4) bufferRef.current.shift();
            
            const avg = bufferRef.current.reduce((a, b) => a + b, 0) / bufferRef.current.length;
            setLux(Math.round(avg * 10) / 10);
          }
        );
      } catch {
        setAvailable(false);
      }
    })();

    return () => {
      subscription?.remove();
    };
  }, []);

  // On web, use manual override; on native, use real sensor
  const effectiveLux = manualLux !== null ? manualLux : lux;

  return {
    lux: effectiveLux,
    available: available || Platform.OS === 'web', // web "available" via simulator
    setManualLux,
  };
}
