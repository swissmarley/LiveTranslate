import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Language } from '@/lib/languages';

interface LanguagePillProps {
  language: Language;
  accent: string;
  /** Show the name in the language itself (for the person who speaks it). */
  native?: boolean;
  onPress?: () => void;
}

export function LanguagePill({ language, accent, native = false, onPress }: LanguagePillProps) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${language.name}. Change language`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: pressed ? colors.surfacePressed : colors.surface, borderColor: colors.border },
      ]}>
      <View style={[styles.dot, { backgroundColor: accent }]} />
      <Text style={styles.flag}>{language.flag}</Text>
      <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
        {native ? language.nativeName : language.name}
      </Text>
      {onPress && <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 10,
    paddingRight: 12,
    height: 36,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 240,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  flag: {
    fontSize: 17,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
});
