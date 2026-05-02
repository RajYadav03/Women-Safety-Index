/**
 * SOSOverlay — Full-screen emergency overlay
 *
 * States:
 *   TRIGGERED:  Pulsing SOS + countdown ring + Cancel/Confirm buttons
 *   DISPATCHED: Auto-shares message + shows formatted alert + "Sent to" contacts
 *   COOLDOWN:   Fading out
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  Share,
  ScrollView,
  Linking,
} from 'react-native';
import { SOSState, SOSResult } from '../hooks/useSafetySystem';
import { Colors, Type, Space, Radii } from '../theme';

// ── Hardcoded emergency contacts (user can customize later) ──
const EMERGENCY_CONTACTS = [
  { name: 'Emergency Services', number: '112', icon: '🚔' },
  { name: 'Women Helpline', number: '1091', icon: '📞' },
  { name: 'Family Contact', number: 'Saved Contact', icon: '👤' },
];

interface SOSOverlayProps {
  sosState: SOSState;
  countdown: number;
  lastResult: SOSResult | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function SOSOverlay({
  sosState,
  countdown,
  lastResult,
  onCancel,
  onConfirm,
}: SOSOverlayProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const hasSharedRef = useRef(false);

  // ── Pulse animation for SOS text ──
  useEffect(() => {
    if (sosState === 'TRIGGERED') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [sosState]);

  // ── Fade in overlay ──
  useEffect(() => {
    if (sosState === 'TRIGGERED' || sosState === 'DISPATCHED') {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else if (sosState === 'COOLDOWN') {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }).start();
    } else {
      fadeAnim.setValue(0);
      hasSharedRef.current = false;
    }
  }, [sosState]);

  // ── Auto-share when dispatched ──
  useEffect(() => {
    if (sosState === 'DISPATCHED' && lastResult?.message && !hasSharedRef.current) {
      hasSharedRef.current = true;
      // Small delay so the UI renders first
      setTimeout(async () => {
        try {
          await Share.share({
            message: lastResult.message,
            title: 'WSI Emergency Alert',
          });
        } catch {}
      }, 600);
    }
  }, [sosState, lastResult]);

  // ── Parse the structured message into display sections ──
  const parseMessage = (msg: string) => {
    const sections: { title: string; items: string[] }[] = [];
    let currentSection = { title: '', items: [] as string[] };
    const alertId = msg.match(/🆔 Alert ID: (.+)/)?.[1] || '';

    const lines = msg.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('━') || trimmed.startsWith('🚨') || trimmed.startsWith('📱')) continue;

      // Section headers (emoji + CAPS)
      if (
        (trimmed.startsWith('📍') || trimmed.startsWith('🕐') || trimmed.startsWith('📊') || trimmed.startsWith('⚠️')) &&
        !trimmed.startsWith('•')
      ) {
        if (currentSection.title && currentSection.items.length > 0) {
          sections.push({ ...currentSection });
        }
        currentSection = { title: trimmed, items: [] };
      } else if (trimmed.startsWith('•')) {
        currentSection.items.push(trimmed.substring(2).trim());
      }
    }
    if (currentSection.title && currentSection.items.length > 0) {
      sections.push(currentSection);
    }

    return { sections, alertId };
  };

  // ── Re-share handler ──
  const reshare = async () => {
    if (!lastResult?.message) return;
    try {
      await Share.share({
        message: lastResult.message,
        title: 'WSI Emergency Alert',
      });
    } catch {}
  };

  // Don't render if IDLE
  if (sosState === 'IDLE') return null;

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      {sosState === 'TRIGGERED' && (
        <View style={styles.triggeredContainer}>
          {/* Countdown ring */}
          <View style={styles.ringOuter}>
            <View style={styles.ringInner}>
              <Animated.Text
                style={[
                  styles.sosText,
                  { transform: [{ scale: pulseAnim }] },
                ]}
              >
                SOS
              </Animated.Text>
              <Text style={styles.countdownText}>{countdown}</Text>
            </View>
          </View>

          <Text style={styles.triggerLabel}>
            Emergency alert will be sent in {countdown}s
          </Text>

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onCancel}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelBtnText}>FALSE ALARM</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={onConfirm}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmBtnText}>CONFIRM NOW</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {sosState === 'DISPATCHED' && lastResult && (
        <ScrollView
          style={styles.dispatchedScroll}
          contentContainerStyle={styles.dispatchedContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Success header */}
          <View style={styles.successHeader}>
            <View style={styles.checkCircle}>
              <Text style={styles.checkMark}>✓</Text>
            </View>
            <Text style={styles.dispatchedTitle}>Alert Sent</Text>
            <Text style={styles.sosId}>ID: {lastResult.sos_id}</Text>
          </View>

          {/* Formatted message card */}
          <View style={styles.messageCard}>
            <View style={styles.messageHeader}>
              <Text style={styles.messageHeaderIcon}>🚨</Text>
              <Text style={styles.messageHeaderText}>EMERGENCY SOS ALERT</Text>
            </View>

            {(() => {
              const { sections } = parseMessage(lastResult.message);
              return sections.map((section, idx) => (
                <View key={idx} style={styles.messageSection}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  {section.items.map((item, i) => {
                    // Check if it's a map link
                    const isLink = item.startsWith('Map: http');
                    return (
                      <View key={i} style={styles.bulletRow}>
                        <Text style={styles.bullet}>•</Text>
                        {isLink ? (
                          <TouchableOpacity
                            onPress={() => Linking.openURL(item.replace('Map: ', ''))}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.bulletText, styles.linkText]}>
                              📍 Open in Google Maps
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <Text style={styles.bulletText}>{item}</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              ));
            })()}
          </View>

          {/* Sent to contacts section */}
          <View style={styles.contactsCard}>
            <Text style={styles.contactsTitle}>📤 Message shared with</Text>
            {EMERGENCY_CONTACTS.map((contact, idx) => (
              <View key={idx} style={styles.contactRow}>
                <Text style={styles.contactIcon}>{contact.icon}</Text>
                <View style={styles.contactInfo}>
                  <Text style={styles.contactName}>{contact.name}</Text>
                  <Text style={styles.contactNumber}>{contact.number}</Text>
                </View>
                <View style={styles.sentBadge}>
                  <Text style={styles.sentBadgeText}>Shared</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Re-share button */}
          <TouchableOpacity
            style={styles.reshareBtn}
            onPress={reshare}
            activeOpacity={0.7}
          >
            <Text style={styles.reshareBtnText}>📤 Share Again</Text>
          </TouchableOpacity>

          {/* Emergency call */}
          <TouchableOpacity
            style={styles.callBtn}
            onPress={() => Linking.openURL('tel:112')}
            activeOpacity={0.7}
          >
            <Text style={styles.callBtnText}>📞 Call 112</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {sosState === 'COOLDOWN' && (
        <View style={styles.cooldownContainer}>
          <Text style={styles.cooldownText}>Returning to safety mode...</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12, 0, 0, 0.97)',
    zIndex: 9999,
  },

  // ── TRIGGERED state ──
  triggeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.xl,
  },
  ringOuter: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 4,
    borderColor: '#FF2D2D',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.xl,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 0 60px rgba(255, 45, 45, 0.4)' }
      : {}),
  },
  ringInner: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255, 30, 30, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosText: {
    fontSize: 48,
    color: '#FF2D2D',
    ...Type.bold,
    letterSpacing: 8,
  },
  countdownText: {
    fontSize: 28,
    color: 'rgba(255, 255, 255, 0.9)',
    ...Type.bold,
    marginTop: Space.xs,
  },
  triggerLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 15,
    ...Type.medium,
    textAlign: 'center',
    marginBottom: Space.xxl,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Space.m,
    width: '100%',
    justifyContent: 'center',
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: Radii.l,
    paddingVertical: Space.m + 4,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    ...Type.bold,
    letterSpacing: 1,
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: '#FF2D2D',
    borderRadius: Radii.l,
    paddingVertical: Space.m + 4,
    alignItems: 'center',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 4px 20px rgba(255, 45, 45, 0.5)' }
      : {}),
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    ...Type.bold,
    letterSpacing: 1,
  },

  // ── DISPATCHED state ──
  dispatchedScroll: {
    flex: 1,
  },
  dispatchedContainer: {
    paddingHorizontal: Space.xl,
    paddingTop: Space.xxl + 20,
    paddingBottom: Space.xxl + 40,
  },
  successHeader: {
    alignItems: 'center',
    marginBottom: Space.l,
  },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.m,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 0 30px rgba(34, 197, 94, 0.4)' }
      : {}),
  },
  checkMark: {
    fontSize: 32,
    color: '#FFFFFF',
    ...Type.bold,
  },
  dispatchedTitle: {
    fontSize: 24,
    color: '#FFFFFF',
    ...Type.bold,
  },
  sosId: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.4)',
    ...Type.medium,
    marginTop: 4,
  },

  // Message card
  messageCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: Radii.l,
    padding: Space.l,
    borderWidth: 1,
    borderColor: 'rgba(255, 60, 60, 0.2)',
    marginBottom: Space.m,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Space.m,
    paddingBottom: Space.s,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  messageHeaderIcon: {
    fontSize: 18,
    marginRight: Space.s,
  },
  messageHeaderText: {
    fontSize: 14,
    color: '#FF6B6B',
    ...Type.bold,
    letterSpacing: 1,
  },
  messageSection: {
    marginBottom: Space.m,
  },
  sectionTitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    ...Type.bold,
    marginBottom: Space.xs,
  },
  bulletRow: {
    flexDirection: 'row',
    paddingLeft: Space.xs,
    marginBottom: 4,
  },
  bullet: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 13,
    marginRight: Space.s,
    marginTop: 1,
  },
  bulletText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 14,
    ...Type.regular,
    flex: 1,
    lineHeight: 20,
  },
  linkText: {
    color: '#60A5FA',
    textDecorationLine: 'underline',
  },

  // Contacts card
  contactsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: Radii.l,
    padding: Space.l,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: Space.l,
  },
  contactsTitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    ...Type.bold,
    marginBottom: Space.m,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.s + 2,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  contactIcon: {
    fontSize: 22,
    marginRight: Space.m,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    ...Type.bold,
  },
  contactNumber: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    ...Type.regular,
    marginTop: 2,
  },
  sentBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderRadius: Radii.m,
    paddingHorizontal: Space.m,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  sentBadgeText: {
    color: '#22C55E',
    fontSize: 12,
    ...Type.bold,
  },

  // Action buttons
  reshareBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: Radii.full,
    paddingVertical: Space.m,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginBottom: Space.s,
  },
  reshareBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    ...Type.bold,
  },
  callBtn: {
    backgroundColor: '#22C55E',
    borderRadius: Radii.full,
    paddingVertical: Space.m,
    alignItems: 'center',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 4px 20px rgba(34, 197, 94, 0.4)' }
      : {}),
  },
  callBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    ...Type.bold,
  },

  // ── COOLDOWN state ──
  cooldownContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cooldownText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 16,
    ...Type.medium,
  },
});
