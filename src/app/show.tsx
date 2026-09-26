import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { accentFor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getLanguage } from '@/lib/languages';
import { toggleSpeak } from '@/services/pipeline';
import { useSessions } from '@/store/sessions';

/** A translation in huge type, to show someone in a noisy place. */
export default function ShowScreen() {
  const colors = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ session?: string; message?: string }>();
  const message = useSessions((s) =>
    s.sessions.find((x) => x.id === params.session)?.messages.find((m) => m.id === params.message)
  );
  const [flipped, setFlipped] = useState(false);
  const { accent } = accentFor(colors, message?.speaker ?? 'me');
  const target = getLanguage(message?.target);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View style={[styles.root, { backgroundColor: accent, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.toolbar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={styles.tool}>
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
        <View style={styles.toolGroup}>
          {message?.translation && params.session ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Read aloud"
              onPress={() => toggleSpeak(params.session!, message)}
              style={styles.tool}>
              <Ionicons name="volume-high" size={26} color="#fff" />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Turn text upside down"
            onPress={() => setFlipped((f) => !f)}
            style={styles.tool}>
            <Ionicons name="sync-outline" size={26} color="#fff" />
          </Pressable>
        </View>
      </View>

      <Pressable style={[styles.body, flipped && styles.flipped]} onPress={close}>
        <Text style={styles.language}>
          {target.flag} {target.nativeName}
        </Text>
        <Text adjustsFontSizeToFit minimumFontScale={0.3} numberOfLines={12} style={styles.text}>
          {message?.translation ?? '—'}
        </Text>
        {message ? (
          <Text numberOfLines={3} style={styles.original}>
            {message.original}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  toolGroup: {
    flexDirection: 'row',
  },
  tool: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 18,
  },
  flipped: {
    transform: [{ rotate: '180deg' }],
  },
  language: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 18,
    fontWeight: '600',
  },
  text: {
    color: '#fff',
    fontSize: 46,
    lineHeight: 56,
    fontWeight: '700',
  },
  original: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 16,
    lineHeight: 22,
  },
});
