/**
 * MapSection — NATIVE version (iOS / Android)
 */
import React, { forwardRef } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, TouchableOpacity, useWindowDimensions } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
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
  onPressPill?: () => void;
}

export const getCatColor = (cat: string | null) => {
  if (!cat) return Colors.textTertiary;
  if (cat.includes('High')) return Colors.safe;
  if (cat.includes('Moderate')) return Colors.moderate;
  return Colors.danger;
};

export const getCatBg = (cat: string | null) => {
  if (!cat) return 'transparent';
  if (cat.includes('High')) return Colors.safeBg;
  if (cat.includes('Moderate')) return Colors.moderateBg;
  return Colors.dangerBg;
};

const getPin = (s: number) => (s >= 0.7 ? '#4ADE80' : s >= 0.4 ? '#FBBF24' : '#F87171');

const MapSection = forwardRef((props: MapSectionProps, ref: any) => {
  const {
    userLocation,
    localities,
    currentLocality,
    safetyIndex,
    category,
    loading,
    exactAddress,
    onPressPill,
  } = props;
  
  const { height } = useWindowDimensions();

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFillObject}
        mapPadding={{ top: 0, right: 0, bottom: height * 0.45, left: 0 }}
        initialRegion={{
          latitude: userLocation?.lat ?? 28.6139,
          longitude: userLocation?.lon ?? 77.209,
          latitudeDelta: 0.06,
          longitudeDelta: 0.06,
        }}
        region={userLocation ? {
          latitude: userLocation.lat,
          longitude: userLocation.lon,
          latitudeDelta: 0.06,
          longitudeDelta: 0.06,
        } : undefined}
        showsUserLocation
        showsMyLocationButton={false}
        userInterfaceStyle="dark"
      >
        {localities.map((l) => (
          <Marker
            key={l.name}
            coordinate={{ latitude: l.lat, longitude: l.lon }}
            title={l.name}
            description={`Safety: ${(l.mean_safety * 100).toFixed(0)}%`}
            pinColor={getPin(l.mean_safety)}
            opacity={l.name === currentLocality ? 1 : 0.5}
          />
        ))}
      </MapView>
    </View>
  );
});

const styles = StyleSheet.create({});

export default MapSection;
