/**
 * LuxSimulator — Web-only slider for testing lux penalties
 * Shows a sleek slider + lux readout so you can simulate
 * different lighting conditions in the browser.
 */
import React, { useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Colors, Radii, Space, Type } from '../theme';

interface Props {
  value: number | null;
  onChange: (lux: number | null) => void;
}

const PRESETS = [
  { label: 'Pitch Black', lux: 2, color: Colors.danger },
  { label: 'Dim Alley', lux: 10, color: Colors.moderate },
  { label: 'Street Light', lux: 50, color: Colors.text },
  { label: 'Well Lit', lux: 200, color: Colors.safe },
];

const getLuxIcon = (lux: number | null): string => {
  if (lux === null) return '○';
  if (lux < 5) return '◐';
  if (lux < 20) return '◑';
  if (lux < 100) return '◕';
  return '●';
};

const getLuxColor = (lux: number | null): string => {
  if (lux === null) return Colors.textTertiary;
  if (lux < 5) return Colors.danger;
  if (lux < 20) return Colors.moderate;
  if (lux < 100) return Colors.text;
  return Colors.safe;
};

export default function LuxSimulator({ value, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.container}>
      {/* Compact bar */}
      <TouchableOpacity
        style={styles.bar}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <Text style={[styles.icon, { color: getLuxColor(value) }]}>
          {getLuxIcon(value)}
        </Text>
        <Text style={styles.label}>
          Lux: {value !== null ? `${value} lx` : 'Off'}
        </Text>
        <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
      </TouchableOpacity>

      {/* Expanded panel */}
      {expanded && (
        <View style={styles.panel}>
          {/* Slider — using a native HTML range input for smooth control */}
          <View style={styles.sliderRow}>
            <Text style={styles.sliderLabel}>0</Text>
            <input
              type="range"
              min="0"
              max="500"
              step="1"
              value={value ?? 50}
              onChange={(e) => onChange(Number(e.target.value))}
              style={{
                flex: 1,
                accentColor: '#D4A574',
                height: 4,
                margin: '0 8px',
              }}
            />
            <Text style={styles.sliderLabel}>500</Text>
          </View>

          {/* Presets */}
          <View style={styles.presets}>
            {PRESETS.map((p) => (
              <TouchableOpacity
                key={p.label}
                style={[
                  styles.presetBtn,
                  value === p.lux && { borderColor: p.color, backgroundColor: p.color + '15' },
                ]}
                onPress={() => onChange(p.lux)}
                activeOpacity={0.7}
              >
                <Text style={[styles.presetText, { color: p.color }]}>
                  {p.label}
                </Text>
                <Text style={[styles.presetLux, { color: p.color }]}>
                  {p.lux} lx
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Off button */}
          <TouchableOpacity
            style={styles.offBtn}
            onPress={() => onChange(null)}
            activeOpacity={0.7}
          >
            <Text style={styles.offText}>
              {value === null ? '● Sensor Off' : 'Turn Sensor Off'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Space.l,
    marginBottom: Space.xs,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgElevated,
    borderRadius: Radii.full,
    paddingHorizontal: Space.m,
    paddingVertical: Space.xs + 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  icon: {
    fontSize: 12,
    marginRight: Space.s,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 11,
    ...Type.medium,
    flex: 1,
  },
  chevron: {
    color: Colors.textTertiary,
    fontSize: 10,
  },
  panel: {
    backgroundColor: Colors.bgSurface,
    borderRadius: Radii.m,
    marginTop: Space.xs,
    padding: Space.m,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Space.m,
  },
  sliderLabel: {
    color: Colors.textTertiary,
    fontSize: 10,
    ...Type.regular,
    width: 24,
    textAlign: 'center',
  },
  presets: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Space.s,
  },
  presetBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Space.xs + 1,
    marginHorizontal: 2,
    borderRadius: Radii.s,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetText: {
    fontSize: 9,
    ...Type.semibold,
    letterSpacing: 0.3,
  },
  presetLux: {
    fontSize: 10,
    ...Type.regular,
    marginTop: 1,
  },
  offBtn: {
    alignItems: 'center',
    paddingVertical: Space.xs,
  },
  offText: {
    color: Colors.textTertiary,
    fontSize: 10,
    ...Type.medium,
  },
});
