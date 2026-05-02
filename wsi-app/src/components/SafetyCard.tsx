/**
 * WSI — Safety Summary Card
 * Shown when user swipes from the map card.
 * Displays detailed safety info for the current location.
 */
import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Colors, Radii, Space, Type } from '../theme';
import { SafetyData } from '../types';

interface Props {
  safetyData: SafetyData | null;
  loading: boolean;
  liveLux: number | null;
}

const catColor = (c: string) => {
  if (c.includes('High')) return Colors.safe;
  if (c.includes('Moderate')) return Colors.moderate;
  return Colors.danger;
};

const catBg = (c: string) => {
  if (c.includes('High')) return Colors.safeBg;
  if (c.includes('Moderate')) return Colors.moderateBg;
  return Colors.dangerBg;
};

export default function SafetyCard({ safetyData, loading, liveLux }: Props) {
  if (loading || !safetyData) {
    return (
      <View style={styles.card}>
        <View style={styles.centerWrap}>
          <Text style={styles.loadingIcon}>✦</Text>
          <Text style={styles.loadingText}>
            {loading ? 'Analyzing area...' : 'No safety data yet'}
          </Text>
        </View>
      </View>
    );
  }

  const pct = (safetyData.adjustedSafetyIndex * 100).toFixed(1);
  const color = catColor(safetyData.category);

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.locality}>{safetyData.locality}</Text>
          <Text style={styles.locType}>
            {safetyData.lux.luxUsed !== null
              ? `${safetyData.lux.luxUsed} lx · `
              : ''}
            {safetyData.lux.riskLevel}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: catBg(safetyData.category) }]}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={[styles.badgeText, { color }]}>
            {safetyData.category.replace(' Safety', '')}
          </Text>
        </View>
      </View>

      {/* Big score */}
      <View style={styles.scoreRow}>
        <Text style={[styles.scoreNum, { color }]}>{pct}</Text>
        <Text style={styles.scoreUnit}>/100</Text>
      </View>

      {/* Progress */}
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>

      {/* Lux detail */}
      {safetyData.lux.luxUsed !== null && safetyData.lux.multiplier !== 1.0 && (
        <View style={styles.luxRow}>
          <Text style={styles.luxEmoji}>
            {safetyData.lux.riskLevel === 'critical' ? '🔴' :
             safetyData.lux.riskLevel === 'moderate' ? '🟡' : '🟢'}
          </Text>
          <Text style={styles.luxText}>
            {safetyData.lux.multiplier < 1
              ? `${((1 - safetyData.lux.multiplier) * 100).toFixed(0)}% Light Penalty`
              : `Safe Lighting`}
            {safetyData.lux.nighttime ? ' (night)' : ''}
          </Text>
        </View>
      )}

      {/* Stats grid */}
      <View style={styles.statsGrid}>
        <StatBox label="Severity" value={safetyData.stats.meanSeverity.toFixed(2)} />
        <StatBox label="Crowd" value={safetyData.stats.medianCrowd.toFixed(2)} />
        <StatBox
          label="Incidents"
          value={
            safetyData.stats.nIncidents >= 1000
              ? `${(safetyData.stats.nIncidents / 1000).toFixed(1)}k`
              : String(safetyData.stats.nIncidents)
          }
        />
        <StatBox
          label="Lux"
          value={liveLux !== null ? `${Math.round(liveLux)}` : '—'}
        />
      </View>
    </View>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.bgSurface,
    borderRadius: Radii.xl,
    padding: Space.l,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  centerWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingIcon: {
    color: Colors.accent,
    fontSize: 24,
    marginBottom: Space.s,
  },
  loadingText: {
    color: Colors.textTertiary,
    fontSize: 13,
    ...Type.medium,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Space.m,
  },
  locality: {
    color: Colors.text,
    fontSize: 18,
    ...Type.bold,
    letterSpacing: -0.3,
  },
  locType: {
    color: Colors.textTertiary,
    fontSize: 11,
    ...Type.regular,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.s + 2,
    paddingVertical: Space.xs + 1,
    borderRadius: Radii.full,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: Space.xs + 1,
  },
  badgeText: {
    fontSize: 11,
    ...Type.semibold,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: Space.s,
  },
  scoreNum: {
    fontSize: 36,
    ...Type.bold,
    letterSpacing: -1.5,
  },
  scoreUnit: {
    color: Colors.textTertiary,
    fontSize: 16,
    ...Type.regular,
    marginLeft: Space.xs,
  },
  progressBg: {
    height: 4,
    backgroundColor: Colors.bgElevated,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: Space.m,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  luxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgElevated,
    borderRadius: Radii.s,
    padding: Space.s,
    marginBottom: Space.m,
  },
  luxEmoji: {
    fontSize: 12,
    marginRight: Space.s,
  },
  luxText: {
    color: Colors.textSecondary,
    fontSize: 12,
    ...Type.medium,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Space.s,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radii.s,
    marginHorizontal: 2,
  },
  statVal: {
    color: Colors.text,
    fontSize: 15,
    ...Type.bold,
  },
  statLbl: {
    color: Colors.textTertiary,
    fontSize: 9,
    ...Type.medium,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
