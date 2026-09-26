import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export type MicState = 'idle' | 'starting' | 'listening' | 'transcribing' | 'disabled';

interface MicButtonProps {
  state: MicState;
  color: string;
  /** Microphone loudness 0–1 (drives the inner ring while listening). */
  level: Animated.Value;
  onPress: () => void;
  label: string;
  size?: number;
}

export function MicButton({ state, color, level, onPress, label, size = 76 }: MicButtonProps) {
  const colors = useTheme();
  const [pulse] = useState(() => new Animated.Value(0));
  const listening = state === 'listening';
  const busy = state === 'starting' || state === 'transcribing';
  const disabled = state === 'disabled';

  useEffect(() => {
    if (!listening) return;
    pulse.setValue(0);
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [listening, pulse]);

  const circle = { width: size, height: size, borderRadius: size / 2 };
  const levelScale = level.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.65],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.wrap, circle]}>
      {listening && (
        <>
          <Animated.View
            style={[
              styles.ring,
              circle,
              {
                backgroundColor: color,
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
              },
            ]}
          />
          <Animated.View
            style={[styles.ring, circle, { backgroundColor: color, opacity: 0.28, transform: [{ scale: levelScale }] }]}
          />
        </>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled, busy }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          circle,
          { backgroundColor: disabled ? colors.surfaceAlt : color },
          pressed && styles.pressed,
        ]}>
        {busy ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Ionicons
            name={listening ? 'stop' : 'mic'}
            size={Math.round(size * (listening ? 0.34 : 0.42))}
            color={disabled ? colors.textTertiary : colors.onAccent}
          />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    pointerEvents: 'none',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.22)',
  },
  pressed: {
    transform: [{ scale: 0.94 }],
  },
});
