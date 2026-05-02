/**
 * MapSection — WEB version
 * Premium OpenStreetMap embed with glassmorphic overlay
 */
import React from 'react';
import { View, StyleSheet, Text, ActivityIndicator } from 'react-native';
import { Colors, Radii, Space, Type } from '../theme';
import { LocalityOverview } from '../api';

interface MapSectionProps {
  userLocation: { lat: number; lon: number } | null;
  localities: LocalityOverview[];
  currentLocality: string | null;
  safetyIndex: number | null;
  category: string | null;
  loading: boolean;
  exactAddress?: string | null;
}

const getCatColor = (cat: string | null) => {
  if (!cat) return Colors.textTertiary;
  if (cat.includes('High')) return Colors.safe;
  if (cat.includes('Moderate')) return Colors.moderate;
  return Colors.danger;
};

const getCatBg = (cat: string | null) => {
  if (!cat) return 'transparent';
  if (cat.includes('High')) return Colors.safeBg;
  if (cat.includes('Moderate')) return Colors.moderateBg;
  return Colors.dangerBg;
};

export default function MapSection({
  userLocation,
  localities,
  currentLocality,
  safetyIndex,
  category,
  loading,
  exactAddress,
}: MapSectionProps) {
  const lat = userLocation?.lat ?? 28.6139;
  const lon = userLocation?.lon ?? 77.209;
  const zoom = 14;

  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.03},${lat - 0.02},${lon + 0.03},${lat + 0.02}&layer=mapnik&marker=${lat},${lon}`;

  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        {/* Map */}
        <iframe
          src={mapUrl}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
          }}
          // @ts-ignore
          loading="lazy"
          title="Safety Map"
        />

        {/* Floating location pill */}
        <View style={styles.pill}>
          {loading ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <>
              <View style={[styles.dot, { backgroundColor: getCatColor(category) }]} />
              <Text style={styles.pillText} numberOfLines={1}>
                {exactAddress ?? currentLocality ?? 'Getting location...'}
              </Text>
              {safetyIndex !== null && (
                <View style={[styles.scoreBadge, { backgroundColor: getCatBg(category) }]}>
                  <Text style={[styles.scoreText, { color: getCatColor(category) }]}>
                    {(safetyIndex * 100).toFixed(0)}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: Space.l,
    paddingTop: Space.s,
  },
  container: {
    height: '100%',
    borderRadius: Radii.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.mapBorder,
    position: 'relative',
    backgroundColor: Colors.bgSurface,
  },
  pill: {
    position: 'absolute',
    top: Space.m,
    left: Space.m,
    right: Space.m,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.mapOverlay,
    borderRadius: Radii.full,
    paddingHorizontal: Space.l,
    paddingVertical: Space.s + 2,
    borderWidth: 1,
    borderColor: Colors.border,
    // @ts-ignore — web backdrop-filter
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: Space.s,
  },
  pillText: {
    color: Colors.text,
    fontSize: 13,
    ...Type.medium,
    flex: 1,
  },
  scoreBadge: {
    width: 32,
    height: 22,
    borderRadius: Radii.s,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Space.s,
  },
  scoreText: {
    fontSize: 12,
    ...Type.bold,
  },
});
