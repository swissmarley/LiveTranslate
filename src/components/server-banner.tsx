import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Tappable warning shown when the translation server is unreachable or misconfigured. */
export function ServerBanner({ message, onPress }: { message: string; onPress: () => void }) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens settings"
      onPress={onPress}
      style={({ pressed }) => [
        styles.banner,
        { backgroundColor: colors.dangerSoft, borderColor: colors.danger, opacity: pressed ? 0.8 : 1 },
      ]}>
      <Ionicons name="cloud-offline-outline" size={18} color={colors.danger} />
      <Text numberOfLines={2} style={[styles.text, { color: colors.text }]}>
        {message}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    flex: 1,
    fontSize: 13,
    lineHeight: 17,
  },
});
