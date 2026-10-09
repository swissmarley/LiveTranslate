import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { MessageActionSheet, type MessageTarget } from '@/components/message-action-sheet';
import { accentFor, Radius } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import { useTheme } from '@/hooks/use-theme';
import { canRetry, type Message } from '@/lib/conversation';
import { formatWhen } from '@/lib/format';
import { getLanguage } from '@/lib/languages';
import { runTranslation, toggleSpeak } from '@/services/pipeline';
import { useSession } from '@/store/sessions';

export default function SessionScreen() {
  const colors = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useSession(id);
  const { playingId, preparingId } = usePlayback();
  const [actionTarget, setActionTarget] = useState<MessageTarget | null>(null);

  if (!session) {
    return (
      <View style={styles.missing}>
        <Stack.Screen options={{ title: 'Not found' }} />
        <Text style={{ color: colors.textSecondary }}>This conversation was deleted.</Text>
      </View>
    );
  }

  const listen = session.kind === 'listen';
  const renderItem = ({ item }: { item: Message }) => {
    const { accent } = accentFor(colors, item.speaker);
    const source = getLanguage(item.source);
    const busy = preparingId === item.id;
    const playing = playingId === item.id;
    return (
      <Pressable
        onPress={() =>
          canRetry(item)
            ? void runTranslation(session.id, item.id, false)
            : item.status === 'done' && toggleSpeak(session.id, item)
        }
        onLongPress={() => setActionTarget({ sessionId: session.id, message: item })}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: pressed ? colors.surfacePressed : colors.surface, borderColor: colors.border },
        ]}>
        <View style={styles.cardHeader}>
          <View style={[styles.dot, { backgroundColor: accent }]} />
          <Text style={[styles.who, { color: colors.textSecondary }]}>
            {listen ? source.name : item.speaker === 'me' ? 'You' : 'Them'} · {formatWhen(item.createdAt)}
          </Text>
          {busy ? (
            <ActivityIndicator size="small" color={accent} />
          ) : (
            <Ionicons name={playing ? 'volume-high' : 'play-circle-outline'} size={20} color={accent} />
          )}
        </View>
        <Text style={[styles.original, { color: colors.textSecondary }]}>{item.original}</Text>
        <Text style={[styles.translation, { color: item.status === 'error' ? colors.danger : colors.text }]}>
          {item.status === 'done'
            ? item.translation
            : item.status === 'error'
              ? `${item.error ?? 'Translation failed'}${canRetry(item) ? ' · tap to retry' : ''}`
              : 'Translating…'}
        </Text>
      </Pressable>
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: formatWhen(session.createdAt) }} />
      <FlatList
        data={session.messages}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
      <MessageActionSheet target={actionTarget} onClose={() => setActionTarget(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 14,
    gap: 10,
  },
  card: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  who: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  original: {
    fontSize: 15,
    lineHeight: 21,
  },
  translation: {
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '600',
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
