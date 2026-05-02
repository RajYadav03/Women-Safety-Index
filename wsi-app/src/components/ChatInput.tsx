/**
 * WSI — Galaxy AI Glowing Chat Input Bar
 * Animated gradient glow border that pulses when focused.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Keyboard,
  Platform,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radii, Space, Type } from '../theme';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled = false }: Props) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const glowAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.timing(glowAnim, {
      toValue: focused ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();

    if (focused) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: false }),
          Animated.timing(pulseAnim, { toValue: 0.5, duration: 1500, useNativeDriver: false }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(0.6);
    }
  }, [focused]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
    if (Platform.OS !== 'web') Keyboard.dismiss();
  };

  const hasText = text.trim().length > 0;

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  return (
    <View style={styles.bar}>
      {/* Glow container */}
      <Animated.View style={[styles.glowWrap, { opacity: pulseAnim }]}>
        <LinearGradient
          colors={['#D4A574', '#FBBF24', '#4ADE80', '#60A5FA', '#D4A574']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.glowGradient}
        />
      </Animated.View>

      {/* Input container (sits on top of glow) */}
      <View style={styles.inputContainer}>
        <View style={styles.inputRow}>
          {/* Sparkle icon */}
          <TouchableOpacity style={styles.iconBtn} activeOpacity={0.6}>
            <Ionicons name="sparkles" size={18} color={Colors.accent} />
          </TouchableOpacity>

          {/* Text field */}
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Ask about safety..."
            placeholderTextColor={Colors.textTertiary}
            multiline
            maxLength={500}
            editable={!disabled}
            onSubmitEditing={send}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            blurOnSubmit
          />

          {/* Send button */}
          <TouchableOpacity
            style={[
              styles.sendBtn,
              hasText && !disabled && styles.sendBtnActive,
            ]}
            onPress={send}
            disabled={!hasText || disabled}
            activeOpacity={0.7}
          >
            <Ionicons
              name="arrow-up"
              size={16}
              color={hasText && !disabled ? Colors.textInverse : Colors.textTertiary}
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: Space.l,
    paddingTop: Space.s,
    paddingBottom: Space.m,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  glowWrap: {
    position: 'absolute',
    top: Space.s - 1,
    left: Space.l - 1,
    right: Space.l - 1,
    bottom: Space.m - 1,
    borderRadius: Radii.xxl + 1,
    overflow: 'hidden',
  },
  glowGradient: {
    flex: 1,
    borderRadius: Radii.xxl + 1,
  },
  inputContainer: {
    borderRadius: Radii.xxl,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    margin: 1.5,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: Colors.bgInput,
    borderRadius: Radii.xxl,
    paddingLeft: Space.xs,
    paddingRight: Space.xs,
    paddingVertical: Space.xs,
    minHeight: 46,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    ...Type.regular,
    maxHeight: 100,
    paddingVertical: Platform.OS === 'web' ? Space.s : Space.s - 1,
    paddingHorizontal: Space.s,
    lineHeight: 20,
    // @ts-ignore — web-only
    outlineStyle: 'none' as any,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Space.xxs,
  },
  sendBtnActive: {
    backgroundColor: Colors.accent,
  },
});
