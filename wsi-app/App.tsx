/**
 * WSI — Women Safety Index  (v3 — Galaxy AI Layout)
 *
 * Layout:
 *   ┌──────────────────────┐
 *   │  Header (WSI brand)  │
 *   │                      │
 *   │  ┌────────────────┐  │
 *   │  │  Square Card   │  │  ← Swipeable: Map ↔ Safety Summary
 *   │  │  (centered)    │  │
 *   │  └────────────────┘  │
 *   │  ● ○   page dots     │
 *   │                      │
 *   │  Chat messages       │
 *   │  (scrollable)        │
 *   │                      │
 *   │  ✨[ Ask about... ]↑ │  ← Glowing Galaxy AI input
 *   └──────────────────────┘
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  StatusBar,
  Animated,
  ScrollView,
  Dimensions,
  useWindowDimensions,
  TouchableOpacity,
  PanResponder,
  Modal,
  ActivityIndicator,
  Vibration,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import MapView from 'react-native-maps';
import EventSource from 'react-native-sse';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors, Space, Radii, Type } from './src/theme';
import { ChatMessage, SafetyData, createMessage } from './src/types';
import {
  fetchPrediction,
  fetchLocalities,
  PredictResponse,
  LocalityOverview,
  SafeZoneItem,
  fetchSafeZones,
  API_BASE_URL,
} from './src/api';
import MapSection, { getCatColor, getCatBg } from './src/components/MapSection';
import ChatBubble from './src/components/ChatBubble';
import ChatInput from './src/components/ChatInput';
import SafetyCard from './src/components/SafetyCard';
import LuxSimulator from './src/components/LuxSimulator';
import AreaIntelligenceFab from './src/components/AreaIntelligenceFab';
import SOSOverlay from './src/components/SOSOverlay';
import SafeZonePopup from './src/components/SafeZonePopup';
import useLux from './src/hooks/useLux';
import useSafetySystem from './src/hooks/useSafetySystem';
import useAudioBuffer from './src/hooks/useAudioBuffer';
import useKinematicDetection from './src/hooks/useKinematicDetection';

// ─────────────────────────────────────────
// Main App
// ─────────────────────────────────────────
function MainApp() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { lux, available: luxAvailable, setManualLux } = useLux();

  // Card size — square, with padding
  const cardPadding = Space.xl;
  const cardSize = Math.min(screenWidth - cardPadding * 2, 340);

  // State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userLoc, setUserLoc] = useState<{ lat: number; lon: number } | null>(null);
  const [localities, setLocalities] = useState<LocalityOverview[]>([]);
  const [curLocality, setCurLocality] = useState<string | null>(null);
  const [safetyIdx, setSafetyIdx] = useState<number | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [latestSafety, setLatestSafety] = useState<SafetyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exactAddress, setExactAddress] = useState<string | null>(null);
  const [showFab, setShowFab] = useState(true);
  const [isSafetyCardVisible, setIsSafetyCardVisible] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([
    'Provide Summary of the location',
    'Compare safety to nearby areas',
    'Tips for walking here at night'
  ]);

  // Audio evidence buffer
  const audioBuffer = useAudioBuffer();

  // SOS system — passes audio lock as onDispatch callback
  const sos = useSafetySystem(
    userLoc, lux, curLocality, safetyIdx, category,
    () => { audioBuffer.lockAndPreserve(); }  // Lock audio evidence on dispatch
  );

  // Kinematic detection — auto-triggers SOS on snatch/drop
  const kinematic = useKinematicDetection(
    (event) => {
      console.log(`[Kinematic] ${event} detected — triggering SOS`);
      sos.triggerSOS('kinematic');
    },
    Platform.OS !== 'web',  // Only enable on native
  );

  // SOS Pulse animation ref (must be declared before pulse useEffect below)
  const sosPulseAnim = useRef(new Animated.Value(1)).current;

  // Auto-start audio buffer on Android
  useEffect(() => {
    if (Platform.OS !== 'web' && !audioBuffer.isRecording) {
      audioBuffer.startBuffer();
    }
  }, []);

  // SOS Pulse Animation — continuous heartbeat glow
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(sosPulseAnim, {
          toValue: 1.25,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(sosPulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [sosPulseAnim]);

  // Long-press SOS — skip countdown, dispatch immediately with heavy haptics
  const handleSOSLongPress = useCallback(() => {
    if (Platform.OS !== 'web') {
      Vibration.vibrate([0, 100, 50, 100, 50, 300]); // Aggressive burst
    }
    if (sos.sosState === 'IDLE') {
      sos.triggerSOS('button');
      // Immediately confirm (skip countdown)
      setTimeout(() => sos.confirmSOS(), 100);
    }
  }, [sos]);

  // Safe zone state
  const [safeZoneVisible, setSafeZoneVisible] = useState(false);
  const [safeZoneLoading, setSafeZoneLoading] = useState(false);
  const [safeZones, setSafeZones] = useState<SafeZoneItem[]>([]);
  const [safeZoneLocality, setSafeZoneLocality] = useState('');


  const fadeAnim = useRef(new Animated.Value(0)).current;
  const listRef = useRef<FlatList>(null);
  const mapRef = useRef<MapView>(null);

  // ── Helpers ──
  const push = useCallback((m: ChatMessage) => {
    setMessages((p) => [...p, m]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);
  }, []);

  const describeResult = (d: PredictResponse): string => {
    const adjPct = (d.adjusted_safety_index * 100).toFixed(1);
    const rawPct = (d.safety_index * 100).toFixed(1);
    const sev = d.stats.mean_severity > 0.6 ? 'elevated' : d.stats.mean_severity > 0.3 ? 'moderate' : 'low';
    const crowd = d.stats.median_crowd > 0.6 ? 'dense' : d.stats.median_crowd > 0.3 ? 'moderate' : 'sparse';

    let tip = '';
    if (d.adjusted_safety_index < 0.4) {
      tip = '\n\nStay alert — keep your phone accessible and share your live location.';
    } else if (d.adjusted_safety_index < 0.7) {
      tip = '\n\nExercise standard caution, especially after dark.';
    } else {
      tip = '\n\nThis area has a good safety record.';
    }

    let luxNote = '';
    if (d.lux_adjustment.lux_used !== null && d.lux_adjustment.multiplier !== 1.0) {
      const pctChange = Math.abs((1 - d.lux_adjustment.multiplier) * 100).toFixed(0);
      if (d.lux_adjustment.multiplier < 1) {
        luxNote = `\n\n🔦 Ambient light: ${d.lux_adjustment.lux_used} lx — ${pctChange}% safety penalty applied.`;
      } else {
        luxNote = `\n\n💡 Good lighting (${d.lux_adjustment.lux_used} lx) — ${pctChange}% bonus.`;
      }
    }

    return (
      `Safety score for ${d.locality}: ${adjPct}/100.\n\n` +
      `Severity: ${sev} · Crowd: ${crowd} · ${d.stats.n_incidents.toLocaleString()} records analyzed.` +
      luxNote + tip
    );
  };

  const buildSafetyData = (d: PredictResponse): SafetyData => ({
    locality: d.locality,
    safetyIndex: d.safety_index,
    adjustedSafetyIndex: d.adjusted_safety_index,
    category: d.category,
    distanceKm: d.distance_km,
    stats: {
      meanSeverity: d.stats.mean_severity,
      medianLighting: d.stats.median_lighting,
      medianCrowd: d.stats.median_crowd,
      nIncidents: d.stats.n_incidents,
    },
    lux: {
      multiplier: d.lux_adjustment.multiplier,
      luxUsed: d.lux_adjustment.lux_used,
      hourUsed: d.lux_adjustment.hour_used,
      nighttime: d.lux_adjustment.nighttime,
      riskLevel: d.lux_adjustment.risk_level,
    },
  });

  // ── Load safety data silently (for map + swipeable card) ──
  const loadSafetyData = useCallback(
    async (lat: number, lon: number, luxVal?: number | null) => {
      try {
        const hour = new Date().getHours();
        const data = await fetchPrediction(lat, lon, luxVal, hour);
        setCurLocality(data.locality);
        setSafetyIdx(data.adjusted_safety_index);
        setCategory(data.category);
        setLatestSafety(buildSafetyData(data));
        return data;
      } catch {
        return null;
      }
    },
    []
  );

  // ── Fetch + chat response (user-triggered only) ──
  const checkSafety = useCallback(
    async (lat: number, lon: number, luxVal?: number | null) => {
      try {
        const hour = new Date().getHours();
        const data = await fetchPrediction(lat, lon, luxVal, hour);
        setCurLocality(data.locality);
        setSafetyIdx(data.adjusted_safety_index);
        setCategory(data.category);
        setLatestSafety(buildSafetyData(data));
        push(createMessage('assistant', describeResult(data)));
      } catch (err: any) {
        push(
          createMessage('assistant', `Could not reach safety server.\n\n${err.message}`)
        );
      }
    },
    [push]
  );

  // ── Startup — load silently, no chat messages ──
  useEffect(() => {
    let alive = true;

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        push(createMessage('assistant', 'Location access needed. Please grant permission and restart.'));
        setLoading(false);
        return;
      }

      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!alive) return;

        const coords = { lat: loc.coords.latitude, lon: loc.coords.longitude };
        setUserLoc(coords);

        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lon}`, {
            headers: { 'User-Agent': 'WSI-App' }
          });
          const geo = await res.json();
          if (geo && geo.name) {
            setExactAddress(geo.name);
          } else if (geo && geo.address) {
            setExactAddress(geo.address.suburb || geo.address.neighbourhood || geo.address.village || geo.address.city || null);
          }
        } catch { }

        fetchLocalities()
          .then((l) => alive && setLocalities(l))
          .catch(() => { });

        // Silent load — no chat message
        await loadSafetyData(coords.lat, coords.lon, lux);
      } catch (err: any) {
        push(createMessage('assistant', `Could not get location.\n\n${err.message}`));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, []);

  // ── Sync Safety Data with Sensor ──
  useEffect(() => {
    if (userLoc && lux !== null) {
      const timeout = setTimeout(() => {
        // We use loadSafetyData which updates the state silently
        loadSafetyData(userLoc.lat, userLoc.lon, lux);
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [lux, userLoc]);

  // ── Chat handler ──
  const handleSend = useCallback(
    async (text: string) => {
      setShowFab(false);
      push(createMessage('user', text));

      const lc = text.toLowerCase();

      // Standard refresh command
      if (/check|refresh|update|location/.test(lc) && !lc.includes('read the area') && !lc.includes('summary')) {
        push(createMessage('system', 'Refreshing safety data...'));
        setLoading(true);
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          const c = { lat: loc.coords.latitude, lon: loc.coords.longitude };
          setUserLoc(c);

          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${c.lat}&lon=${c.lon}`, {
              headers: { 'User-Agent': 'WSI-App' }
            });
            const geo = await res.json();
            if (geo && geo.name) {
              setExactAddress(geo.name);
            } else if (geo && geo.address) {
              setExactAddress(geo.address.suburb || geo.address.neighbourhood || geo.address.village || geo.address.city || null);
            }
          } catch { }

          await checkSafety(c.lat, c.lon, lux);
        } catch {
          push(createMessage('assistant', 'Unable to refresh location.'));
        } finally {
          setLoading(false);
        }
        return;
      }

      // ── Gemini AI Chat Request ──
      if (!userLoc) {
        push(createMessage('assistant', 'I need your location first. Please type "refresh".'));
        return;
      }

      const aiMsg = createMessage('assistant', '');
      push(aiMsg);

      try {
        const es = new EventSource(`${API_BASE_URL}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            lat: userLoc.lat,
            lon: userLoc.lon,
            lux: lux,
            history: messages.slice(-6).map(m => ({ role: m.role, text: m.text })),
            hour: new Date().getHours(),
          })
        });

        let fullText = '';

        es.addEventListener('message', (event: any) => {
          console.log('DEBUG SSE CHUNK:', event.data);
          if (event.data === '[DONE]') {
            es.close();
            return;
          }

          if (event.data) {
            try {
              const data = JSON.parse(event.data);
              if (data.error) {
                setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, text: `⚠️ ${data.error}` } : m));
                es.close();
                return;
              }

              fullText += data.chunk;
              let displayMsg = fullText;
              let newBento = undefined;

              const bentoRegex = /<bento>([\s\S]*?)<\/bento>/i;
              const match = fullText.match(bentoRegex);

              if (match) {
                try {
                  let cleanJson = match[1].replace(/```json/gi, '').replace(/```/g, '').trim();
                  newBento = JSON.parse(cleanJson);
                } catch (e) { }
                displayMsg = fullText.replace(match[0], '').trim();
              } else {
                // Check for Markdown JSON blocks too
                const mdMatch = fullText.match(/```json([\s\S]*?)```/i);
                if (mdMatch) {
                  try {
                    newBento = JSON.parse(mdMatch[1].trim());
                  } catch (e) { }
                  displayMsg = fullText.replace(mdMatch[0], '').trim();
                } else {
                  // HACK: If we are currently inside a <bento> tag or it looks like raw JSON is starting...
                  const partialMatch = fullText.match(/<bento>([\s\S]*)/i);
                  const rawJsonMatch = fullText.match(/^[\s\n]*\{[\s\S]*/i);

                  if (partialMatch) {
                    displayMsg = fullText.replace(partialMatch[0], '').trim();
                  } else if (rawJsonMatch && !fullText.includes('}')) {
                    // If it starts with { but hasn't closed yet, hide it
                    displayMsg = '';
                  } else if (rawJsonMatch && fullText.includes('}')) {
                    // If it's a completed JSON block without tags, try to parse it
                    try {
                      const endIdx = fullText.lastIndexOf('}') + 1;
                      const jsonPart = fullText.substring(0, endIdx);
                      newBento = JSON.parse(jsonPart);
                      displayMsg = fullText.substring(endIdx).trim();
                    } catch (e) {
                      displayMsg = fullText.trim();
                    }
                  } else {
                    displayMsg = fullText.trim();
                  }
                }
              }

              // If Gemini ONLY outputs bento and no text, give a default message
              if (match && displayMsg === '') {
                displayMsg = 'Here is the area analysis based on current data.';
              }

              setMessages(prev => prev.map(m => m.id === aiMsg.id ? {
                ...m,
                text: displayMsg,
                bentoData: newBento || m.bentoData,
                confidence: data.confidence || m.confidence
              } : m));

            } catch (err) {
              console.log('SSE parse error', err);
            }
          }
        });

        es.addEventListener('error', (err: any) => {
          console.log('SSE Error', err);
          setMessages(prev => prev.map(m => m.id === aiMsg.id && !m.text ? { ...m, text: `⚠️ Connection failed. Please check backend.` } : m));
          es.close();
        });
      } catch (err: any) {
        setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, text: `⚠️ Exception: ${err.message}` } : m));
      }
    },
    [push, checkSafety, lux, luxAvailable, userLoc]
  );

  const handleSuggestionClick = useCallback((text: string) => {
    setSuggestions((prev) => prev.filter((s) => s !== text));
    handleSend(text);
  }, [handleSend]);

  const handleLocationPress = useCallback((lat: number, lon: number) => {
    setIsSafetyCardVisible(false); // Close modal if open
    setTimeout(() => {
      mapRef.current?.animateToRegion({
        latitude: lat,
        longitude: lon,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 1000);
    }, 300);
  }, []);

  const handleRecenter = useCallback(() => {
    if (userLoc) {
      handleLocationPress(userLoc.lat, userLoc.lon);
    }
  }, [userLoc, handleLocationPress]);

  // ── Safe Zone handler ──
  const handleFindSafeZones = useCallback(async () => {
    if (!userLoc) return;

    setSafeZoneVisible(true);
    setSafeZoneLoading(true);
    setSafeZones([]);

    try {
      const result = await fetchSafeZones(userLoc.lat, userLoc.lon, curLocality);
      setSafeZones(result.zones);
      setSafeZoneLocality(result.locality);
      console.log(`[SafeZone] Got ${result.zones.length} zones`);
    } catch (err: any) {
      console.error('[SafeZone] Error:', err);
    } finally {
      setSafeZoneLoading(false);
    }
  }, [userLoc, curLocality]);

  // ── Render ──
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* 1. Absolute Background Map */}
      <View style={StyleSheet.absoluteFillObject}>
        <MapSection
          ref={mapRef}
          userLocation={userLoc}
          localities={localities}
          currentLocality={curLocality}
          safetyIndex={safetyIdx}
          category={category}
          loading={loading}
          exactAddress={exactAddress}
          onPressPill={() => setIsSafetyCardVisible(true)}
        />
      </View>

      {/* 2. HUD Gradient Fade overlay (Slate Blue tinted for map blending) */}
      <LinearGradient
        colors={['transparent', 'rgba(17, 24, 39, 1)', 'rgba(17, 24, 39, 1)']}
        locations={[0.40, 0.60, 1]}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      <KeyboardAvoidingView
        style={styles.hudOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Top Section (Header) */}
        <View style={[styles.topSection, { paddingTop: insets.top + Space.s }]}>
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.headerPill}
              activeOpacity={0.7}
              onPress={() => setIsSafetyCardVisible(true)}
            >
              {loading ? (
                <ActivityIndicator size="small" color={Colors.accent} />
              ) : (
                <>
                  <View style={[styles.dot, { backgroundColor: getCatColor(category) }]} />
                  <Text style={styles.pillText} numberOfLines={1}>
                    {exactAddress ?? curLocality ?? 'Getting location...'}
                  </Text>
                  {/* DEBUG URL */}
                  <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', position: 'absolute', bottom: -12 }}>
                    {API_BASE_URL}
                  </Text>
                  {safetyIdx !== null && (
                    <View style={[styles.scoreBadge, { backgroundColor: getCatBg(category) }]}>
                      <Text style={[styles.scoreText, { color: getCatColor(category) }]}>
                        {(safetyIdx * 100).toFixed(0)}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </TouchableOpacity>

            {/* SOS Button with Pulse Ring */}
            <View style={styles.sosTouchArea}>
              <Animated.View
                style={[
                  styles.sosPulseRing,
                  sos.sosState === 'IDLE' && {
                    transform: [{ scale: sosPulseAnim }],
                    opacity: sosPulseAnim.interpolate({
                      inputRange: [1, 1.25],
                      outputRange: [0.6, 0],
                    }),
                  },
                ]}
              />
              <TouchableOpacity
                style={[
                  styles.sosButton,
                  sos.sosState !== 'IDLE' && styles.sosButtonActive,
                ]}
                onPress={() => sos.triggerSOS('button')}
                onLongPress={handleSOSLongPress}
                delayLongPress={600}
                activeOpacity={0.7}
                disabled={sos.sosState !== 'IDLE'}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.sosButtonText}>SOS</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Center / Bottom Section (Chat and FAB) */}
        <View style={styles.bottomSection}>
          <View style={styles.actionRowContainer}>
            {/* GPS Recenter Button */}
            <TouchableOpacity style={styles.gpsButton} onPress={handleRecenter} activeOpacity={0.7}>
              <Text style={styles.gpsIcon}>🎯</Text>
            </TouchableOpacity>

            <View style={styles.actionRow}>
              {/* Take me to Safety button */}
              <TouchableOpacity
                style={styles.safetyButton}
                onPress={handleFindSafeZones}
                activeOpacity={0.7}
                disabled={!userLoc || loading}
              >
                <Text style={styles.safetyButtonIcon}>🛡️</Text>
                <Text style={styles.safetyButtonText}>Take me to nearest safe zone</Text>
              </TouchableOpacity>

              {/* Read the Area FAB */}
              <AreaIntelligenceFab
                visible={showFab && !loading}
                onPress={() => handleSend('Read the Area')}
              />
            </View>
          </View>

          {/* Lux Simulator — web only */}
          {Platform.OS === 'web' && (
            <LuxSimulator value={lux} onChange={setManualLux} />
          )}

          {/* Chat Interface */}
          <View style={styles.chatContainer}>
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(m) => m.id}
              renderItem={({ item }) => <ChatBubble message={item} onLocationPress={handleLocationPress} />}
              style={styles.chatList}
              contentContainerStyle={styles.chatContent}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Animated.View style={[styles.emptyChat, { opacity: fadeAnim }]}>
                  {loading && (
                    <>
                      <Text style={styles.emptyIcon}>✦</Text>
                      <Text style={styles.emptyText}>Analyzing your area...</Text>
                    </>
                  )}
                </Animated.View>
              }
              ListFooterComponent={
                !loading && suggestions.length > 0 ? (
                  <View style={styles.suggestionsContainer}>
                    {suggestions.map((suggestion) => (
                      <TouchableOpacity
                        key={suggestion}
                        style={styles.suggestionBtn}
                        activeOpacity={0.7}
                        onPress={() => handleSuggestionClick(suggestion)}
                      >
                        <Text style={styles.suggestionIcon}>✨</Text>
                        <Text style={styles.suggestionText}>{suggestion}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null
              }
            />

            {/* Input Area */}
            <ChatInput onSend={handleSend} disabled={loading} />
            <View style={{ height: Math.max(insets.bottom, Space.xs) }} />
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* SOS Overlay — renders on top of everything */}
      <SOSOverlay
        sosState={sos.sosState}
        countdown={sos.countdown}
        lastResult={sos.lastResult}
        onCancel={sos.cancelSOS}
        onConfirm={sos.confirmSOS}
      />

      {/* Safe Zone Popup */}
      <SafeZonePopup
        visible={safeZoneVisible}
        loading={safeZoneLoading}
        zones={safeZones}
        locality={safeZoneLocality || curLocality || ''}
        onClose={() => setSafeZoneVisible(false)}
      />

      {/* Safety Details Modal */}
      <Modal
        visible={isSafetyCardVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsSafetyCardVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setIsSafetyCardVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.modalContent, { width: '80%', height: '50%' }]}>
            <SafetyCard safetyData={latestSafety} loading={loading} liveLux={lux} />

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setIsSafetyCardVisible(false)}
            >
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────
// Root
// ─────────────────────────────────────────
export default function App() {
  if (Platform.OS === 'web') {
    return (
      <SafeAreaProvider>
        <View style={styles.webBg}>
          <View style={styles.webFrame}>
            <MainApp />
          </View>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <MainApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  webBg: {
    flex: 1,
    backgroundColor: '#08080C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  webFrame: {
    width: '100%',
    maxWidth: 400,
    height: '100%',
    maxHeight: 860,
    backgroundColor: Colors.bg,
    overflow: 'hidden',
    borderRadius: Platform.OS === 'web' ? Radii.xxl : 0,
    borderWidth: Platform.OS === 'web' ? 1 : 0,
    borderColor: 'rgba(255,255,255,0.06)',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 8px 60px rgba(0,0,0,0.5)' }
      : {}),
  },
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  hudOverlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topSection: {
    paddingHorizontal: Space.l,
    paddingBottom: Space.m,
  },
  bottomSection: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: Space.s,
  },
  actionRowContainer: {
    alignItems: 'flex-end',
    paddingHorizontal: Space.l,
    marginBottom: Space.s,
  },
  gpsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(28,28,30,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Space.m,
  },
  gpsIcon: {
    fontSize: 18,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    flexWrap: 'wrap',
    gap: Space.m,
  },
  safetyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22C55E', // Solid Green
    borderWidth: 1,
    borderColor: '#16A34A',
    borderRadius: Radii.full,
    paddingVertical: Space.s + 2,
    paddingHorizontal: Space.l,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  chatContainer: {
    height: '45%',
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    backgroundColor: 'transparent',
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.s,
  },
  headerPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(28,28,30,0.85)',
    borderRadius: Radii.full,
    paddingHorizontal: Space.m,
    paddingVertical: Space.s,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    marginRight: Space.m,
  },
  dot: {
    width: 8,
    height: 8,
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
  sosButton: {
    backgroundColor: '#EF4444',
    borderWidth: 1,
    borderColor: '#DC2626',
    borderRadius: Radii.m,
    paddingHorizontal: Space.l,
    paddingVertical: Space.s,
    elevation: 5,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    minWidth: 56,
    alignItems: 'center',
  },
  sosButtonActive: {
    backgroundColor: '#B91C1C',
  },
  sosButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    ...Type.bold,
    letterSpacing: 2,
  },
  sosTouchArea: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  sosPulseRing: {
    position: 'absolute',
    width: 64,
    height: 40,
    borderRadius: Radii.m + 4,
    borderWidth: 2,
    borderColor: '#EF4444',
  },

  safetyButtonIcon: {
    fontSize: 16,
    marginRight: Space.s,
  },
  safetyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    ...Type.bold,
  },

  // Map Card Area
  cardArea: {
    alignItems: 'center',
  },
  mapContainer: {
    borderRadius: Radii.xl,
    overflow: 'hidden',
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  mapInner: {
    flex: 1,
    borderRadius: Radii.xl,
    overflow: 'hidden',
  },
  fabWrapper: {
    marginTop: Space.s,
    alignItems: 'center',
  },

  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    borderRadius: Radii.xl,
    overflow: 'hidden',
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    ...(Platform.OS === 'web' ? { boxShadow: '0 8px 30px rgba(0,0,0,0.5)' } : {}),
  },
  modalCloseBtn: {
    position: 'absolute',
    top: Space.m,
    right: Space.m,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  modalCloseText: {
    color: '#FFF',
    fontSize: 16,
    ...Type.bold,
  },

  // Chat
  chatList: {
    flex: 1,
  },
  chatContent: {
    paddingTop: Space.m,
    paddingBottom: Space.s,
  },
  emptyChat: {
    paddingTop: Space.m,
    paddingBottom: Space.l,
    alignItems: 'center',
  },
  emptyIcon: {
    color: Colors.accent,
    fontSize: 22,
    marginBottom: Space.s,
  },
  emptyText: {
    color: Colors.textTertiary,
    fontSize: 13,
    ...Type.medium,
    textAlign: 'center',
  },
  suggestionsContainer: {
    paddingHorizontal: Space.xl,
    width: '100%',
    alignItems: 'flex-start',
  },
  suggestionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgInput,
    paddingHorizontal: Space.m,
    paddingVertical: Space.s + 2,
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: 'rgba(212, 165, 116, 0.25)', // accent border
    marginBottom: Space.s,
  },
  suggestionIcon: {
    fontSize: 14,
    marginRight: Space.s,
  },
  suggestionText: {
    color: Colors.text,
    fontSize: 14,
    ...Type.medium,
  },
});
