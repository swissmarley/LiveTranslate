import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useRouter } from 'expo-router';
import { Alert, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { IconButton } from '@/components/icon-button';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Session } from '@/lib/conversation';
import { formatWhen } from '@/lib/format';
import { getLanguage } from '@/lib/languages';
import { deleteConversation } from '@/services/pipeline';
import { clearSpeechCache } from '@/services/speech-cache';
import { useSessions } from '@/store/sessions';

function confirm(title: string, message: string, action: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: action, style: 'destructive', onPress: onConfirm },
  ]);
}

export default function HistoryScreen() {
  const colors = useTheme();
  const router = useRouter();
  const sessions = useSessions((s) => s.sessions);
  const visible = sessions.filter((s) => s.messages.length > 0);

  const renderItem = ({ item }: { item: Session }) => {
    const mine = getLanguage(item.languages.mine);
    const theirs = getLanguage(item.languages.theirs);
    const listen = item.kind === 'listen';
    const first = item.messages[0];
    return (
      <Pressable
        onPress={() => router.push({ pathname: '/history/[id]', params: { id: item.id } })}
        onLongPress={() =>
          confirm('Delete this conversation?', 'This cannot be undone.', 'Delete', () =>
            deleteConversation(item.id)
          )
        }
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: pressed ? colors.surfacePressed : colors.surface, borderColor: colors.border },
        ]}>
        <View style={[styles.icon, { backgroundColor: listen ? colors.themSoft : colors.meSoft }]}>
          <Ionicons
            name={listen ? 'ear-outline' : 'chatbubbles-outline'}
            size={20}
            color={listen ? colors.them : colors.me}
          />
        </View>
        <View style={styles.body}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
            {listen
              ? `${theirs.flag} ${theirs.name} → ${mine.flag} ${mine.name}`
              : `${mine.flag} ${mine.name} ⇄ ${theirs.flag} ${theirs.name}`}
          </Text>
          <Text numberOfLines={1} style={[styles.preview, { color: colors.textSecondary }]}>
            {first?.translation ?? first?.original}
          </Text>
        </View>
        <View style={styles.meta}>
          <Text style={[styles.when, { color: colors.textTertiary }]}>{formatWhen(item.updatedAt)}</Text>
          <Text style={[styles.count, { color: colors.textTertiary }]}>{item.messages.length}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              icon="trash-outline"
              label="Delete all history"
              disabled={visible.length === 0}
              onPress={() =>
                confirm('Delete all history?', 'Every saved conversation will be removed.', 'Delete all', () => {
                  useSessions.getState().clearHistory();
                  clearSpeechCache();
                })
              }
            />
          ),
        }}
      />
      {visible.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="time-outline" size={40} color={colors.textTertiary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Your conversations are saved here on this phone.
          </Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(s) => s.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListFooterComponent={
            <Text style={[styles.footer, { color: colors.textTertiary }]}>Long-press a conversation to delete it.</Text>
          }
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 14,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  preview: {
    fontSize: 14,
  },
  meta: {
    alignItems: 'flex-end',
    gap: 4,
  },
  when: {
    fontSize: 12,
  },
  count: {
    fontSize: 12,
    fontWeight: '600',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  footer: {
    textAlign: 'center',
    fontSize: 13,
    marginTop: 8,
  },
});
