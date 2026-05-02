/**
 * SafeZonePopup — Shows 3 nearby safe zones with Uber booking
 *
 * Triggered by:
 *   1. "Take me to safety" button
 *   2. LLM recommending safe zones in chat
 *
 * Each zone card shows:
 *   - Name, type icon, distance
 *   - Why it's safe
 *   - "Book Uber" button → opens Uber deep link
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Colors, Type, Space, Radii } from '../theme';

interface SafeZone {
  name: string;
  type: string;
  lat: number;
  lon: number;
  why_safe: string;
  distance_km: number | null;
  uber_deeplink: string | null;
}

interface SafeZonePopupProps {
  visible: boolean;
  loading: boolean;
  zones: SafeZone[];
  locality: string;
  onClose: () => void;
}

const TYPE_ICONS: Record<string, string> = {
  police: '🚔',
  hospital: '🏥',
  mall: '🛍️',
  market: '🏪',
  temple: '🛕',
  gurudwara: '🙏',
  unknown: '📍',
};

export default function SafeZonePopup({
  visible,
  loading,
  zones,
  locality,
  onClose,
}: SafeZonePopupProps) {
  const openUber = async (deeplink: string) => {
    try {
      const supported = await Linking.canOpenURL(deeplink);
      if (supported) {
        await Linking.openURL(deeplink);
      } else {
        // Fallback: open in browser (works for Uber web)
        await Linking.openURL(deeplink);
      }
    } catch (err) {
      console.log('[SafeZone] Uber deep link error:', err);
    }
  };

  const openMaps = (lat: number, lon: number, name: string) => {
    const url = Platform.select({
      android: `google.navigation:q=${lat},${lon}`,
      ios: `maps://app?daddr=${lat},${lon}&dirflg=d`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&destination_place_id=${encodeURIComponent(name)}`,
    });
    if (url) Linking.openURL(url);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.handle} />
            <Text style={styles.title}>🛡️ Nearby Safe Zones</Text>
            <Text style={styles.subtitle}>
              {loading ? 'Finding safe places...' : `Near ${locality}`}
            </Text>
          </View>

          {/* Loading state */}
          {loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.accent} />
              <Text style={styles.loadingText}>
                AI is finding real safe zones near you...
              </Text>
            </View>
          )}

          {/* Zone cards */}
          {!loading && zones.map((zone, idx) => (
            <View key={idx} style={styles.zoneCard}>
              <View style={styles.zoneHeader}>
                <Text style={styles.zoneIcon}>
                  {TYPE_ICONS[zone.type] || TYPE_ICONS.unknown}
                </Text>
                <View style={styles.zoneInfo}>
                  <Text style={styles.zoneName}>{zone.name}</Text>
                  <Text style={styles.zoneType}>
                    {zone.type.charAt(0).toUpperCase() + zone.type.slice(1)}
                    {zone.distance_km != null && (
                      ` · ${zone.distance_km < 1
                        ? `${(zone.distance_km * 1000).toFixed(0)}m`
                        : `${zone.distance_km.toFixed(1)}km`
                      } away`
                    )}
                  </Text>
                </View>
              </View>

              <Text style={styles.whySafe}>{zone.why_safe}</Text>

              <View style={styles.actionRow}>
                {/* Navigate button */}
                <TouchableOpacity
                  style={styles.navBtn}
                  onPress={() => openMaps(zone.lat, zone.lon, zone.name)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.navBtnText}>📍 Navigate</Text>
                </TouchableOpacity>

                {/* Uber button */}
                {zone.uber_deeplink && (
                  <TouchableOpacity
                    style={styles.uberBtn}
                    onPress={() => openUber(zone.uber_deeplink!)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.uberBtnText}>🚗 Book Uber</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}

          {/* Close button */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.bgSurface,
    borderTopLeftRadius: Radii.xxl,
    borderTopRightRadius: Radii.xxl,
    paddingHorizontal: Space.xl,
    paddingBottom: Space.xxl + 10,
    maxHeight: '85%',
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    alignItems: 'center',
    paddingTop: Space.m,
    paddingBottom: Space.l,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginBottom: Space.l,
  },
  title: {
    fontSize: 20,
    color: Colors.text,
    ...Type.bold,
    marginBottom: Space.xs,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textTertiary,
    ...Type.regular,
  },

  // Loading
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: Space.xxl,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 14,
    ...Type.medium,
    marginTop: Space.m,
  },

  // Zone cards
  zoneCard: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radii.l,
    padding: Space.m + 2,
    marginBottom: Space.m,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  zoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Space.s,
  },
  zoneIcon: {
    fontSize: 28,
    marginRight: Space.m,
  },
  zoneInfo: {
    flex: 1,
  },
  zoneName: {
    fontSize: 15,
    color: Colors.text,
    ...Type.bold,
  },
  zoneType: {
    fontSize: 12,
    color: Colors.textTertiary,
    ...Type.regular,
    marginTop: 2,
  },
  whySafe: {
    fontSize: 13,
    color: Colors.textSecondary,
    ...Type.regular,
    lineHeight: 18,
    marginBottom: Space.m,
    paddingLeft: Space.xs,
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: Space.s,
  },
  navBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: Radii.m,
    paddingVertical: Space.s + 2,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  navBtnText: {
    color: Colors.text,
    fontSize: 13,
    ...Type.bold,
  },
  uberBtn: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderRadius: Radii.m,
    paddingVertical: Space.s + 2,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  uberBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    ...Type.bold,
  },

  // Close
  closeBtn: {
    marginTop: Space.s,
    paddingVertical: Space.m,
    alignItems: 'center',
  },
  closeBtnText: {
    color: Colors.textTertiary,
    fontSize: 15,
    ...Type.medium,
  },
});
