import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Animated, Platform } from 'react-native';
import { Colors, Radii, Space, Type } from '../theme';

interface Props {
  onPress: () => void;
  visible: boolean;
}

export default function AreaIntelligenceFab({ onPress, visible }: Props) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.05,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, opacityAnim, scaleAnim]);

  if (!visible && opacityAnim as unknown as number === 0) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: opacityAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <TouchableOpacity
        style={styles.btn}
        activeOpacity={0.8}
        onPress={onPress}
      >
        <Text style={styles.icon}>✨</Text>
        <Text style={styles.text}>Read the Area</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    zIndex: 100,
    borderRadius: Radii.full,
    // Glassmorphism effect
    backgroundColor: Platform.OS === 'web' ? 'rgba(28,28,30,0.65)' : 'rgba(28,28,30,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    // @ts-ignore
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.s + 2,
    paddingHorizontal: Space.l,
    borderRadius: Radii.full,
  },
  icon: {
    fontSize: 16,
    marginRight: Space.s,
  },
  text: {
    color: Colors.text,
    fontSize: 14,
    ...Type.bold,
  },
});
