import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Text, TextStyle, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Type } from '../theme';

interface Props {
  text: string;
  style?: TextStyle | TextStyle[];
  speed?: number; // ms per word
  onComplete?: () => void;
  stream?: boolean; // If false, renders instantly
  onLocationPress?: (lat: number, lon: number) => void;
}

type Token = 
  | { type: 'text'; content: string }
  | { type: 'link'; label: string; lat: number; lon: number; original: string };

// Parses "[text](map:lat,lon)" or regular text
function parseTokens(input: string): Token[] {
  const regex = /\[([^\]]+)\]\(map:([0-9.-]+),([0-9.-]+)\)/g;
  const tokens: Token[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(input)) !== null) {
    if (match.index > lastIndex) {
      // push preceding text, split by words
      const textBefore = input.substring(lastIndex, match.index);
      textBefore.split(/(\s+)/).forEach((word) => {
        if (word) tokens.push({ type: 'text', content: word });
      });
    }
    tokens.push({
      type: 'link',
      label: match[1],
      lat: parseFloat(match[2]),
      lon: parseFloat(match[3]),
      original: match[0],
    });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < input.length) {
    const textAfter = input.substring(lastIndex);
    textAfter.split(/(\s+)/).forEach((word) => {
      if (word) tokens.push({ type: 'text', content: word });
    });
  }

  return tokens;
}

export default function StreamingText({
  text,
  style,
  speed = 40,
  onComplete,
  stream = true,
  onLocationPress,
}: Props) {
  const [visibleCount, setVisibleCount] = useState(0);
  const tokens = useMemo(() => parseTokens(text), [text]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!stream) {
      setVisibleCount(tokens.length);
      if (onComplete && tokens.length > 0) onComplete();
      return;
    }

    if (visibleCount >= tokens.length) {
      return;
    }

    timerRef.current = setInterval(() => {
      setVisibleCount((prev) => {
        const next = prev + 1;
        if (next >= tokens.length) {
          if (timerRef.current) clearInterval(timerRef.current);
          if (onComplete) onComplete();
        }
        return next;
      });
    }, speed);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [stream, tokens.length, speed, onComplete]);

  return (
    <Text style={style}>
      {tokens.slice(0, visibleCount).map((token, i) => {
        if (token.type === 'text') {
          return <Text key={i}>{token.content}</Text>;
        }
        if (token.type === 'link') {
          return (
            <Text
              key={i}
              style={styles.link}
              onPress={() => {
                if (onLocationPress && token.lat && token.lon) {
                  onLocationPress(token.lat, token.lon);
                }
              }}
            >
              {token.label}
            </Text>
          );
        }
        return null;
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  link: {
    color: Colors.accent,
    textDecorationLine: 'underline',
    ...Type.semibold,
  },
});
