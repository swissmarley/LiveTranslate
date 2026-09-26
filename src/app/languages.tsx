import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { findLanguage, sortedLanguages, type Language } from '@/lib/languages';
import { SLOT_KEYS, useSettings, type LanguageSlot } from '@/store/settings';

const TITLES: Record<LanguageSlot, string> = {
  mine: 'Your language',
  theirs: 'Their language',
  listenSource: 'Language you hear',
  listenTarget: 'Translate into',
};

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export default function LanguagesScreen() {
  const colors = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ slot?: string }>();
  const slot: LanguageSlot = params.slot && params.slot in TITLES ? (params.slot as LanguageSlot) : 'mine';
  const selected = useSettings((s) => s[SLOT_KEYS[slot]]);
  const recentIds = useSettings((s) => s.recentLanguages);
  const setLanguage = useSettings((s) => s.setLanguage);
  const [query, setQuery] = useState('');

  const all = sortedLanguages();
  const q = normalize(query.trim());
  const sections = q
    ? [
        {
          title: 'Results',
          data: all.filter((l) =>
            [l.name, l.nativeName, l.id].some((field) => normalize(field).includes(q))
          ),
        },
      ]
    : [
        {
          title: 'Recent',
          data: recentIds.map((id) => findLanguage(id)).filter((l): l is Language => Boolean(l)),
        },
        { title: 'All languages', data: all },
      ].filter((section) => section.data.length > 0);

  const choose = (id: string) => {
    setLanguage(slot, id);
    router.back();
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: TITLES[slot] }} />
      <View style={[styles.search, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name="search" size={18} color={colors.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search languages"
          placeholderTextColor={colors.textTertiary}
          autoCorrect={false}
          clearButtonMode="while-editing"
          style={[styles.searchInput, { color: colors.text }]}
        />
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        renderSectionHeader={({ section }) => (
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{section.title.toUpperCase()}</Text>
        )}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => choose(item.id)}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfacePressed }]}>
            <Text style={styles.flag}>{item.flag}</Text>
            <View style={styles.names}>
              <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
              {item.nativeName !== item.name && (
                <Text style={[styles.native, { color: colors.textTertiary }]}>{item.nativeName}</Text>
              )}
            </View>
            {item.id === selected && <Ionicons name="checkmark" size={22} color={colors.me} />}
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No supported language matches.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 14,
    marginBottom: 4,
    paddingHorizontal: 12,
    borderRadius: Radius.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 10,
  },
  list: {
    paddingHorizontal: 8,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: Radius.sm,
  },
  flag: {
    fontSize: 24,
  },
  names: {
    flex: 1,
  },
  name: {
    fontSize: 16,
  },
  native: {
    fontSize: 13,
  },
  emptyText: {
    textAlign: 'center',
    padding: 24,
    fontSize: 15,
  },
});
