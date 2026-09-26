import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/icon-button';
import { LanguagePill } from '@/components/language-pill';
import { MessageActionSheet, type MessageTarget } from '@/components/message-action-sheet';
import { MicButton, type MicState } from '@/components/mic-button';
import { Radius } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import { useSpeechInput } from '@/hooks/use-speech-input';
import { useTheme } from '@/hooks/use-theme';
import type { Message } from '@/lib/conversation';
import { getLanguage } from '@/lib/languages';
import { runTranslation, toggleSpeak, translateHeard } from '@/services/pipeline';
import { prefetchSttToken } from '@/services/stt-token';
import { useActiveSession, useSessions } from '@/store/sessions';
import { useSettings } from '@/store/settings';
import { showToast } from '@/store/toast';

const NO_MESSAGES: Message[] = [];

/**
 * One-way, continuous translation: a guide, an announcement, a conversation you are
 * listening to. Every pause produces a new translated card.
 */
export default function ListenScreen() {
  useKeepAwake();
  const colors = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const source = getLanguage(useSettings((s) => s.listenSource));
  const target = getLanguage(useSettings((s) => s.listenTarget));
  const inputMode = useSettings((s) => s.inputMode);
  const swap = useSettings((s) => s.swapListenLanguages);
  const session = useActiveSession('listen');
  const messages = session?.messages ?? NO_MESSAGES;
  const { playingId, preparingId } = usePlayback();
  const [actionTarget, setActionTarget] = useState<MessageTarget | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

  const speech = useSpeechInput({
    onSegment: (text) => {
      void translateHeard(text);
    },
    onError: (message) => showToast(message, 'error'),
  });
  const active = speech.phase !== 'idle';

  useEffect(() => {
    if (inputMode === 'live' && speech.liveAvailable) prefetchSttToken();
  }, [inputMode, speech.liveAvailable]);

  const micState: MicState =
    speech.phase === 'listening'
      ? 'listening'
      : speech.phase === 'idle'
        ? 'idle'
        : speech.phase === 'transcribing'
          ? 'transcribing'
          : 'starting';

  const toggle = () => {
    if (active) {
      speech.stop();
      return;
    }
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    void speech.start({ tag: 'listen', language: source.id, continuous: true });
  };

  const pressCard = (message: Message) => {
    if (!session) return;
    if (message.status === 'error') void runTranslation(session.id, message.id, false);
    else if (message.status === 'done') toggleSpeak(session.id, message);
  };

  const chooseLanguage = (slot: 'listenSource' | 'listenTarget') => {
    if (active) {
      showToast('Stop listening to change languages.');
      return;
    }
    router.push({ pathname: '/languages', params: { slot } });
  };

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              icon="add-circle-outline"
              label="Start a new transcript"
              disabled={!session || active}
              onPress={() => useSessions.getState().startNewSession('listen')}
            />
          ),
        }}
      />

      <View style={styles.languages}>
        <LanguagePill language={source} accent={colors.them} onPress={() => chooseLanguage('listenSource')} />
        <IconButton
          icon="arrow-forward"
          label="Swap languages"
          disabled={active}
          onPress={swap}
          color={colors.textSecondary}
        />
        <LanguagePill language={target} accent={colors.me} onPress={() => chooseLanguage('listenTarget')} />
      </View>

      {messages.length === 0 && !active ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Hear the world in {target.name}</Text>
          <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
            Start listening and hold the phone towards a guide, an announcement or anyone speaking{' '}
            {source.name}. Translations appear here after each pause.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => pressCard(item)}
              onLongPress={() => session && setActionTarget({ sessionId: session.id, message: item })}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: pressed ? colors.surfacePressed : colors.surface,
                  borderColor: item.status === 'error' ? colors.danger : colors.border,
                },
              ]}>
              {item.status === 'translating' ? (
                <ActivityIndicator color={colors.me} style={styles.cardSpinner} />
              ) : (
                <Text style={[styles.translation, { color: item.status === 'error' ? colors.danger : colors.text }]}>
                  {item.status === 'done' ? item.translation : `${item.error ?? 'Failed'} · tap to retry`}
                </Text>
              )}
              <Text style={[styles.original, { color: colors.textSecondary }]}>{item.original}</Text>
              {(playingId === item.id || preparingId === item.id) && (
                <Text style={[styles.playing, { color: colors.me }]}>
                  {preparingId === item.id ? 'Loading audio…' : 'Playing…'}
                </Text>
              )}
            </Pressable>
          )}
          ListFooterComponent={
            active ? (
              <View style={[styles.card, styles.liveCard, { borderColor: colors.them }]}>
                <Text style={[styles.liveText, { color: speech.partial ? colors.text : colors.textSecondary }]}>
                  {speech.partial || source.ui.listening}
                </Text>
              </View>
            ) : null
          }
        />
      )}

      <View style={styles.controls}>
        <MicButton
          state={micState}
          color={colors.them}
          level={speech.level}
          onPress={toggle}
          size={84}
          label={active ? 'Stop listening' : 'Start listening'}
        />
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {active ? 'Listening — tap to stop' : 'Tap to start listening'}
        </Text>
      </View>

      <MessageActionSheet target={actionTarget} onClose={() => setActionTarget(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  languages: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
  },
  list: {
    padding: 14,
    gap: 10,
  },
  card: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 6,
  },
  cardSpinner: {
    alignSelf: 'flex-start',
    marginVertical: 6,
  },
  translation: {
    fontSize: 21,
    lineHeight: 28,
    fontWeight: '600',
  },
  original: {
    fontSize: 15,
    lineHeight: 20,
  },
  playing: {
    fontSize: 13,
    fontWeight: '600',
  },
  liveCard: {
    borderStyle: 'dashed',
    borderWidth: 1,
  },
  liveText: {
    fontSize: 17,
    lineHeight: 23,
    fontStyle: 'italic',
  },
  controls: {
    alignItems: 'center',
    gap: 10,
    paddingTop: 12,
    paddingBottom: 16,
  },
  hint: {
    fontSize: 14,
    fontWeight: '500',
  },
});
