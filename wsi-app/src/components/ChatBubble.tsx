/**
 * WSI — Chat Bubble
 * Clean, Claude-inspired message bubbles with embedded safety cards.
 */
import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Colors, Radii, Space, Type } from '../theme';
import { ChatMessage } from '../types';
import StreamingText from './StreamingText';
import TypingIndicator from './TypingIndicator';

interface Props {
  message: ChatMessage;
  onLocationPress?: (lat: number, lon: number) => void;
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

const catLabel = (c: string) => {
  if (c.includes('High')) return 'Safe';
  if (c.includes('Moderate')) return 'Moderate';
  return 'Unsafe';
};

export default function ChatBubble({ message, onLocationPress }: Props) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  // ── System pill ──
  if (isSystem) {
    return (
      <View style={styles.systemRow}>
        <View style={styles.systemPill}>
          <Text style={styles.systemText}>{message.text}</Text>
        </View>
      </View>
    );
  }

  // ── User / Assistant bubble ──
  return (
    <View style={[styles.row, isUser ? styles.rowR : styles.rowL]}>
      {/* AI avatar */}
      {!isUser && (
        <View style={styles.avatar}>
          <Text style={styles.avatarIcon}>✦</Text>
        </View>
      )}

      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAi,
        ]}
      >
        {/* ── Confidence Header ── */}
        {!isUser && message.confidence && (
          <View style={styles.confidenceRow}>
            <View style={styles.confidenceDot} />
            <Text style={styles.confidenceText}>
              Area Intelligence · {message.confidence}% Confidence
            </Text>
          </View>
        )}

        {isUser ? (
          <Text style={[styles.msgText, { color: Colors.bubbleUserText }]}>
            {message.text}
          </Text>
        ) : (message.text || message.bentoData) ? (
          message.text ? (
            <StreamingText
              text={message.text}
              style={styles.msgText}
              onLocationPress={onLocationPress}
              stream={false}
            />
          ) : null
        ) : (
          <TypingIndicator />
        )}

        {/* ── Bento Grid ── */}
        {message.bentoData && (
          <View style={styles.bentoGrid}>
            <View style={[styles.bentoCard, { backgroundColor: Colors.safeBg }]}>
              <Text style={styles.bentoLabel}>Current Vibe</Text>
              <Text style={[styles.bentoValue, { color: Colors.safe }]}>{message.bentoData.vibe}</Text>
            </View>
            <View style={styles.bentoRow}>
              <View style={[styles.bentoCard, { flex: 1, backgroundColor: Colors.moderateBg, marginRight: Space.xs }]}>
                <Text style={styles.bentoLabel}>Crowd Density</Text>
                <Text style={[styles.bentoValue, { color: Colors.moderate }]}>{message.bentoData.crowd}</Text>
              </View>
              <View style={[styles.bentoCard, { flex: 1, backgroundColor: Colors.dangerBg, marginLeft: Space.xs }]}>
                <Text style={styles.bentoLabel}>Recent Incidents</Text>
                <Text style={[styles.bentoValue, { color: Colors.danger }]}>{message.bentoData.incidents}</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Safety Data Card ── */}
        {message.safetyData && (
          <View style={styles.card}>
            {/* Header row */}
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardLocality}>
                  {message.safetyData.locality}
                </Text>
                <Text style={styles.cardSubtitle}>India</Text>
              </View>
              <View
                style={[
                  styles.catChip,
                  { backgroundColor: catBg(message.safetyData.category) },
                ]}
              >
                <View
                  style={[
                    styles.catDot,
                    { backgroundColor: catColor(message.safetyData.category) },
                  ]}
                />
                <Text
                  style={[
                    styles.catText,
                    { color: catColor(message.safetyData.category) },
                  ]}
                >
                  {catLabel(message.safetyData.category)}
                </Text>
              </View>
            </View>

            {/* Score section — shows ADJUSTED score as primary */}
            <View style={styles.scoreSection}>
              <Text style={styles.scoreNumber}>
                {(message.safetyData.adjustedSafetyIndex * 100).toFixed(1)}
              </Text>
              <Text style={styles.scoreUnit}>/ 100</Text>
            </View>

            {/* Progress bar — uses adjusted score */}
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${message.safetyData.adjustedSafetyIndex * 100}%`,
                    backgroundColor: catColor(message.safetyData.category),
                  },
                ]}
              />
            </View>

            {/* Lux penalty indicator */}
            {message.safetyData.lux.luxUsed !== null && (
              <View style={styles.luxRow}>
                <Text style={styles.luxIcon}>
                  {message.safetyData.lux.riskLevel === 'critical' ? '◐' :
                   message.safetyData.lux.riskLevel === 'moderate' ? '◑' :
                   message.safetyData.lux.riskLevel === 'safe' ? '●' : '◕'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.luxLabel}>
                    Ambient Light: {message.safetyData.lux.luxUsed} lx
                    {message.safetyData.lux.nighttime ? ' (Night)' : ''}
                  </Text>
                  {message.safetyData.lux.multiplier !== 1.0 && (
                    <Text style={[
                      styles.luxPenalty,
                      { color: message.safetyData.lux.multiplier < 1 ? Colors.danger : Colors.safe },
                    ]}>
                      {message.safetyData.lux.multiplier < 1
                        ? `${((1 - message.safetyData.lux.multiplier) * 100).toFixed(0)}% penalty applied`
                        : `${((message.safetyData.lux.multiplier - 1) * 100).toFixed(0)}% bonus applied`}
                      {' '}(base: {(message.safetyData.safetyIndex * 100).toFixed(1)})
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Divider */}
            <View style={styles.cardDivider} />

            {/* Stats */}
            <View style={styles.statsRow}>
              <StatItem
                label="Severity"
                value={message.safetyData.stats.meanSeverity.toFixed(2)}
              />
              <View style={styles.statDivider} />
              <StatItem
                label="Lux"
                value={message.safetyData.lux.luxUsed !== null
                  ? `${message.safetyData.lux.luxUsed}`
                  : '—'}
              />
              <View style={styles.statDivider} />
              <StatItem
                label="Crowd"
                value={message.safetyData.stats.medianCrowd.toFixed(2)}
              />
              <View style={styles.statDivider} />
              <StatItem
                label="Incidents"
                value={
                  message.safetyData.stats.nIncidents >= 1000
                    ? `${(message.safetyData.stats.nIncidents / 1000).toFixed(1)}k`
                    : String(message.safetyData.stats.nIncidents)
                }
              />
            </View>
          </View>
        )}

        {/* Timestamp */}
        <Text style={[styles.time, isUser && { color: 'rgba(26,18,7,0.4)' }]}>
          {message.timestamp.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
    </View>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Layout
  row: {
    flexDirection: 'row',
    paddingHorizontal: Space.l,
    marginBottom: Space.m,
  },
  rowR: { justifyContent: 'flex-end' },
  rowL: { justifyContent: 'flex-start', alignItems: 'flex-start' },

  // Avatar
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.accentMuted,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Space.s,
    marginTop: 2,
  },
  avatarIcon: {
    color: Colors.accent,
    fontSize: 13,
  },

  // Bubbles
  bubble: {
    maxWidth: '82%',
    borderRadius: Radii.l,
    paddingHorizontal: Space.l,
    paddingVertical: Space.m,
  },
  bubbleUser: {
    backgroundColor: Colors.bubbleUser,
    borderBottomRightRadius: 4,
  },
  bubbleAi: {
    backgroundColor: Colors.bubbleAi,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.bubbleAiBorder,
  },

  // Confidence Header
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Space.xs,
  },
  confidenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.safe,
    marginRight: Space.xs,
  },
  confidenceText: {
    color: Colors.textTertiary,
    fontSize: 11,
    ...Type.medium,
  },

  // Bento Grid
  bentoGrid: {
    marginTop: Space.m,
  },
  bentoRow: {
    flexDirection: 'row',
    marginTop: Space.xs,
  },
  bentoCard: {
    padding: Space.m,
    borderRadius: Radii.m,
  },
  bentoLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    ...Type.medium,
    marginBottom: Space.xxs,
  },
  bentoValue: {
    fontSize: 15,
    ...Type.bold,
  },

  // Text
  msgText: {
    color: Colors.text,
    fontSize: 14.5,
    lineHeight: 22,
    ...Type.regular,
    letterSpacing: 0.1,
  },
  time: {
    color: Colors.textTertiary,
    fontSize: 10,
    marginTop: Space.xs,
    textAlign: 'right',
    ...Type.regular,
  },

  // System
  systemRow: {
    alignItems: 'center',
    paddingVertical: Space.xs,
    paddingHorizontal: Space.xl,
  },
  systemPill: {
    backgroundColor: Colors.bgElevated,
    paddingHorizontal: Space.m,
    paddingVertical: Space.xs,
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  systemText: {
    color: Colors.textTertiary,
    fontSize: 11,
    ...Type.medium,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // ── Safety Card ──
  card: {
    marginTop: Space.m,
    backgroundColor: Colors.bg,
    borderRadius: Radii.m,
    padding: Space.l,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Space.m,
  },
  cardLocality: {
    color: Colors.text,
    fontSize: 16,
    ...Type.semibold,
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    color: Colors.textTertiary,
    fontSize: 11,
    ...Type.regular,
    marginTop: 1,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.s + 2,
    paddingVertical: Space.xs + 1,
    borderRadius: Radii.full,
  },
  catDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginRight: Space.xs + 1,
  },
  catText: {
    fontSize: 11,
    ...Type.semibold,
    letterSpacing: 0.3,
  },

  // Score
  scoreSection: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: Space.s,
  },
  scoreNumber: {
    color: Colors.text,
    fontSize: 32,
    ...Type.bold,
    letterSpacing: -1,
  },
  scoreUnit: {
    color: Colors.textTertiary,
    fontSize: 14,
    ...Type.regular,
    marginLeft: Space.xs,
  },

  // Progress
  progressTrack: {
    height: 4,
    backgroundColor: Colors.bgElevated,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: Space.l,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Divider
  cardDivider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginBottom: Space.m,
  },

  // Lux penalty row
  luxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgElevated,
    borderRadius: Radii.s,
    padding: Space.s,
    marginBottom: Space.m,
  },
  luxIcon: {
    fontSize: 14,
    marginRight: Space.s,
    color: Colors.moderate,
  },
  luxLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    ...Type.medium,
  },
  luxPenalty: {
    fontSize: 10,
    ...Type.semibold,
    marginTop: 1,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.divider,
  },
  statValue: {
    color: Colors.text,
    fontSize: 14,
    ...Type.semibold,
  },
  statLabel: {
    color: Colors.textTertiary,
    fontSize: 10,
    ...Type.regular,
    marginTop: 2,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});
