import Ionicons from '@expo/vector-icons/Ionicons';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ComposeSheet } from '@/components/compose-sheet';
import { ConversationPane } from '@/components/conversation-pane';
import { IconButton } from '@/components/icon-button';
import { MessageActionSheet, type MessageTarget } from '@/components/message-action-sheet';
import type { MicState } from '@/components/mic-button';
import { ServerBanner } from '@/components/server-banner';
import { useDefaultVoices } from '@/hooks/use-default-voices';
import { usePlayback } from '@/hooks/use-playback';
import { describeServerProblem, useServerStatus } from '@/hooks/use-server-status';
import { useSpeechInput } from '@/hooks/use-speech-input';
import { useTheme } from '@/hooks/use-theme';
import type { Message, Speaker } from '@/lib/conversation';
import { getLanguage } from '@/lib/languages';
import { runTranslation, toggleSpeak, translateUtterance } from '@/services/pipeline';
import { prefetchSttToken } from '@/services/stt-token';
import { useActiveSession, useSessions } from '@/store/sessions';
import { useSettings } from '@/store/settings';
import { showToast } from '@/store/toast';

const NO_MESSAGES: Message[] = [];

function haptic() {
  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/**
 * Face-to-face conversation. The phone lies between two people: the top half is turned
 * towards the other person and shows everything in their language, the bottom half is the
 * owner's. Each side has its own microphone.
 */
export default function ConversationScreen() {
  useKeepAwake();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const myLanguage = getLanguage(useSettings((s) => s.myLanguage));
  const theirLanguage = getLanguage(useSettings((s) => s.theirLanguage));
  const faceToFace = useSettings((s) => s.faceToFace);
  const inputMode = useSettings((s) => s.inputMode);
  const swapLanguages = useSettings((s) => s.swapLanguages);

  const session = useActiveSession('conversation');
  const messages = session?.messages ?? NO_MESSAGES;
  const { playingId, preparingId } = usePlayback();
  const { status } = useServerStatus();
  const serverProblem = describeServerProblem(status);
  const serverReady = status.state === 'ok' && serverProblem === null;

  const [composing, setComposing] = useState(false);
  const [actionTarget, setActionTarget] = useState<MessageTarget | null>(null);

  const speech = useSpeechInput({
    onSegment: (text, { tag }) => {
      void translateUtterance(tag === 'them' ? 'them' : 'me', text);
    },
    onNoSpeech: () => showToast("Didn't catch that. Tap the microphone and try again."),
    onError: (message) => showToast(message, 'error'),
  });

  useDefaultVoices(serverReady);
  useEffect(() => {
    if (serverReady && inputMode === 'live' && speech.liveAvailable) prefetchSttToken();
  }, [serverReady, inputMode, speech.liveAvailable]);

  const languageOf = (side: Speaker) => (side === 'me' ? myLanguage : theirLanguage);

  const micState = (side: Speaker): MicState => {
    if (speech.activeTag === side) {
      if (speech.phase === 'listening') return 'listening';
      if (speech.phase === 'transcribing') return 'transcribing';
      return 'starting';
    }
    return speech.phase === 'idle' ? 'idle' : 'disabled';
  };

  const pressMic = (side: Speaker) => {
    if (speech.activeTag === side) {
      if (speech.phase === 'listening') speech.stop();
      else if (speech.phase === 'starting') speech.cancel();
      return;
    }
    if (speech.phase !== 'idle') return;
    haptic();
    void speech.start({ tag: side, language: languageOf(side).id });
  };

  const pressMessage = (message: Message) => {
    if (!session) return;
    if (message.status === 'error') {
      void runTranslation(session.id, message.id, useSettings.getState().autoSpeak);
    } else if (message.status === 'done') {
      toggleSpeak(session.id, message);
    }
  };

  /** Replays the most recent translation spoken by `from`. */
  const replayLast = (from: Speaker) => {
    const last = [...messages].reverse().find((m) => m.speaker === from && m.status === 'done');
    if (session && last) toggleSpeak(session.id, last);
  };

  const hasIncoming = (reader: Speaker) =>
    messages.some((m) => m.speaker !== reader && m.status === 'done');

  const newConversation = () => {
    speech.cancel();
    useSessions.getState().startNewSession('conversation');
    showToast('New conversation started');
  };

  const swap = () => {
    haptic();
    swapLanguages();
  };

  const renderPane = (reader: Speaker) => {
    const other: Speaker = reader === 'me' ? 'them' : 'me';
    const replay = (
      <IconButton
        icon="volume-high-outline"
        label="Play the last translation again"
        disabled={!hasIncoming(reader)}
        onPress={() => replayLast(other)}
        color={colors.textSecondary}
      />
    );
    return (
      <ConversationPane
        reader={reader}
        language={languageOf(reader)}
        messages={messages}
        micState={micState(reader)}
        level={speech.level}
        partial={speech.activeTag === reader ? speech.partial : ''}
        otherSpeaking={speech.activeTag === other && speech.phase !== 'idle'}
        playingId={playingId}
        preparingId={preparingId}
        onMicPress={() => pressMic(reader)}
        onLanguagePress={() =>
          router.push({ pathname: '/languages', params: { slot: reader === 'me' ? 'mine' : 'theirs' } })
        }
        onMessagePress={pressMessage}
        onMessageLongPress={(message) => session && setActionTarget({ sessionId: session.id, message })}
        leftAccessory={
          reader === 'me' ? (
            <IconButton
              icon="keypad-outline"
              label="Type instead"
              onPress={() => setComposing(true)}
              color={colors.textSecondary}
            />
          ) : null
        }
        rightAccessory={replay}
      />
    );
  };

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}>
      <View style={[styles.half, faceToFace && styles.rotated]}>{renderPane('them')}</View>

      <View style={[styles.bar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <IconButton icon="time-outline" label="History" onPress={() => router.push('/history')} />
        <IconButton icon="ear-outline" label="Listen mode" onPress={() => router.push('/listen')} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Swap languages"
          onPress={swap}
          style={({ pressed }) => [
            styles.swap,
            { backgroundColor: pressed ? colors.surfacePressed : colors.surfaceAlt },
          ]}>
          <Ionicons name="swap-vertical" size={22} color={colors.text} />
        </Pressable>
        <IconButton
          icon="add-circle-outline"
          label="New conversation"
          disabled={!session}
          onPress={newConversation}
        />
        <IconButton icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} />
      </View>

      <View style={styles.half}>
        {serverProblem && (
          <ServerBanner message={serverProblem} onPress={() => router.push('/settings')} />
        )}
        {renderPane('me')}
      </View>

      <ComposeSheet
        visible={composing}
        from={myLanguage}
        to={theirLanguage}
        onClose={() => setComposing(false)}
        onSubmit={(text) => {
          setComposing(false);
          void translateUtterance('me', text, 'text');
        }}
      />
      <MessageActionSheet target={actionTarget} onClose={() => setActionTarget(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  half: {
    flex: 1,
  },
  rotated: {
    transform: [{ rotate: '180deg' }],
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    height: 56,
    marginHorizontal: 12,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
  },
  swap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
