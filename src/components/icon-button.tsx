import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

interface IconButtonProps {
  icon: IconName;
  /** Accessibility label. */
  label: string;
  onPress?: () => void;
  size?: number;
  color?: string;
  filled?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon,
  label,
  onPress,
  size = 22,
  color,
  filled = false,
  disabled = false,
  style,
}: IconButtonProps) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={6}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        filled && { backgroundColor: colors.surfaceAlt },
        pressed && { backgroundColor: colors.surfacePressed },
        disabled && styles.disabled,
        style,
      ]}>
      <Ionicons name={icon} size={size} color={color ?? colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.35,
  },
});
