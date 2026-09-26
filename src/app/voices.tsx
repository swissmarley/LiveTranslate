import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import { useTheme } from '@/hooks/use-theme';
import { useVoices } from '@/hooks/use-voices';
import type { Voice } from '@/lib/api-types';
import type { Speaker } from '@/lib/conversation';
import { errorMessage } from '@/services/api-client';
import { beginPreparing, cancelPreparing, playAudio, stopPlayback } from '@/services/playback';
import { useSettings } from '@/store/settings';
import { showToast } from '@/store/toast';

const AUTOMATIC = '__automatic__';

export default function VoicesScreen() {
  const colors = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ speaker?: string }>();
  const speaker: Speaker = params.speaker === 'them' ? 'them' : 'me';
  const current = useSettings((s) => s.voices[speaker]);
  const setVoice = useSettings((s) => s.setVoice);
  const { voices, loading, error, reload } = useVoices();
  const { playingId, preparingId } = usePlayback();

  const preview = (voice: Voice) => {
    const clipId = `preview:${voice.id}`;
    if (playingId === clipId || preparingId === clipId) {
      stopPlayback();
      return;
    }
    if (!voice.previewUrl) {
      showToast('No preview available for this voice.');
      return;
    }
    const token = beginPreparing(clipId);
    playAudio(voice.previewUrl, clipId, token).catch((e: unknown) => {
      cancelPreparing(token);
      showToast(errorMessage(e), 'error');
    });
  };

  const select = (id: string | null) => {
    stopPlayback();
    setVoice(speaker, id);
    router.back();
  };

  const rows: (Voice | typeof AUTOMATIC)[] = [AUTOMATIC, ...voices];

  return (
    <>
      <Stack.Screen options={{ title: speaker === 'me' ? 'Voice for your words' : 'Voice for their words' }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
          <Pressable onPress={reload} accessibilityRole="button">
            <Text style={[styles.link, { color: colors.me }]}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => (item === AUTOMATIC ? AUTOMATIC : item.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={[styles.intro, { color: colors.textSecondary }]}>
              Voices come from your ElevenLabs account and speak every supported language. Add more in the
              ElevenLabs Voice Library.
            </Text>
          }
          renderItem={({ item }) => {
            if (item === AUTOMATIC) {
              return (
                <Pressable
                  onPress={() => select(null)}
                  style={({ pressed }) => [
                    styles.row,
                    { backgroundColor: pressed ? colors.surfacePressed : colors.surface, borderColor: colors.border },
                  ]}>
                  <View style={styles.body}>
                    <Text style={[styles.name, { color: colors.text }]}>Automatic</Text>
                    <Text style={[styles.meta, { color: colors.textTertiary }]}>The server&apos;s default voice</Text>
                  </View>
                  {current === null && <Ionicons name="checkmark" size={22} color={colors.me} />}
                </Pressable>
              );
            }
            const clipId = `preview:${item.id}`;
            const meta = [item.gender, item.accent, item.description].filter(Boolean).join(' · ');
            return (
              <Pressable
                onPress={() => select(item.id)}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: pressed ? colors.surfacePressed : colors.surface, borderColor: colors.border },
                ]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Preview ${item.name}`}
                  onPress={() => preview(item)}
                  hitSlop={8}
                  style={[styles.play, { backgroundColor: colors.surfaceAlt }]}>
                  {preparingId === clipId ? (
                    <ActivityIndicator size="small" />
                  ) : (
                    <Ionicons name={playingId === clipId ? 'stop' : 'play'} size={16} color={colors.text} />
                  )}
                </Pressable>
                <View style={styles.body}>
                  <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
                  {meta ? (
                    <Text numberOfLines={1} style={[styles.meta, { color: colors.textTertiary }]}>
                      {meta}
                    </Text>
                  ) : null}
                </View>
                {current === item.id && <Ionicons name="checkmark" size={22} color={colors.me} />}
              </Pressable>
            );
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  error: {
    fontSize: 15,
    textAlign: 'center',
  },
  link: {
    fontSize: 16,
    fontWeight: '600',
  },
  list: {
    padding: 14,
    gap: 8,
  },
  intro: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  play: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
  },
  meta: {
    fontSize: 13,
    textTransform: 'capitalize',
  },
});
