import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useToast } from '@/store/toast';

/** Shows the current toast just below the middle of the screen (the owner's half). */
export function ToastHost() {
  const colors = useTheme();
  const toast = useToast((state) => state.toast);
  const hide = useToast((state) => state.hide);
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!toast) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
  }, [toast, opacity]);

  if (!toast) return null;
  const error = toast.kind === 'error';
  return (
    <View style={styles.overlay}>
      <Animated.View style={{ opacity }}>
        <Pressable
          accessibilityRole="alert"
          onPress={hide}
          style={[
            styles.toast,
            { backgroundColor: error ? colors.dangerSoft : colors.text, borderColor: error ? colors.danger : 'transparent' },
          ]}>
          <Ionicons
            name={error ? 'alert-circle' : 'information-circle'}
            size={20}
            color={error ? colors.danger : colors.background}
          />
          <Text style={[styles.text, { color: error ? colors.text : colors.background }]}>{toast.message}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    pointerEvents: 'box-none',
    left: 16,
    right: 16,
    top: '56%',
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 520,
    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
  },
  text: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
    flexShrink: 1,
  },
});
