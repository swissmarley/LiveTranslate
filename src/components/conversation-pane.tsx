import type { ReactNode } from 'react';
import { Animated, FlatList, StyleSheet, Text, View } from 'react-native';

import { accentFor, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { otherSpeaker, type Message, type Speaker } from '@/lib/conversation';
import type { Language } from '@/lib/languages';

import { LanguagePill } from './language-pill';
import { MessageBubble } from './message-bubble';
import { MicButton, type MicState } from './mic-button';
import { TypingDots } from './typing-dots';

interface ConversationPaneProps {
  /** The person reading this half of the screen. */
  reader: Speaker;
  language: Language;
  messages: Message[];
  micState: MicState;
  level: Animated.Value;
  /** The reader's live transcript while they speak. */
  partial: string;
  /** The other person is speaking right now. */
  otherSpeaking: boolean;
  playingId: string | null;
  preparingId: string | null;
  onMicPress: () => void;
  onLanguagePress: () => void;
  onMessagePress: (message: Message) => void;
  onMessageLongPress: (message: Message) => void;
  leftAccessory?: ReactNode;
  rightAccessory?: ReactNode;
}

/** One person's half of the face-to-face screen, entirely in their language. */
export function ConversationPane({
  reader,
  language,
  messages,
  micState,
  level,
  partial,
  otherSpeaking,
  playingId,
  preparingId,
  onMicPress,
  onLanguagePress,
  onMessagePress,
  onMessageLongPress,
  leftAccessory,
  rightAccessory,
}: ConversationPaneProps) {
  const colors = useTheme();
  const { accent, soft } = accentFor(colors, reader);
  const other = accentFor(colors, otherSpeaker(reader));
  const speaking = micState === 'listening' || micState === 'starting';
  const newestFirst = [...messages].reverse();
  const latestIncomingId = newestFirst.find((m) => m.speaker !== reader)?.id;

  const live = (
    <>
      {otherSpeaking && (
        <View style={[styles.liveRow, styles.liveOther]}>
          <View style={[styles.liveBubble, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TypingDots color={other.accent} />
          </View>
        </View>
      )}
      {speaking && (
        <View style={[styles.liveRow, styles.liveOwn]}>
          <View style={[styles.liveBubble, { backgroundColor: soft }]}>
            <Text style={[styles.liveText, { color: partial ? colors.text : colors.textSecondary }]}>
              {partial || language.ui.listening}
            </Text>
          </View>
        </View>
      )}
    </>
  );

  return (
    <View style={styles.pane}>
      <View style={styles.header}>
        <LanguagePill language={language} accent={accent} native onPress={onLanguagePress} />
      </View>

      {messages.length === 0 && !speaking && !otherSpeaking ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{language.ui.tapToSpeak}</Text>
        </View>
      ) : (
        <FlatList
          inverted
          data={newestFirst}
          keyExtractor={(m) => m.id}
          ListHeaderComponent={live}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              reader={reader}
              readerLanguage={language}
              emphasized={item.id === latestIncomingId}
              playing={playingId === item.id}
              preparing={preparingId === item.id}
              onPress={() => onMessagePress(item)}
              onLongPress={() => onMessageLongPress(item)}
            />
          )}
        />
      )}

      <View style={styles.footer}>
        <View style={styles.accessory}>{leftAccessory}</View>
        <MicButton
          state={micState}
          color={accent}
          level={level}
          onPress={onMicPress}
          label={micState === 'listening' ? 'Stop and translate' : `Speak ${language.name}`}
        />
        <View style={styles.accessory}>{rightAccessory}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pane: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  list: {
    paddingVertical: 8,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '500',
    textAlign: 'center',
  },
  liveRow: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    flexDirection: 'row',
  },
  liveOwn: {
    justifyContent: 'flex-end',
  },
  liveOther: {
    justifyContent: 'flex-start',
  },
  liveBubble: {
    maxWidth: '88%',
    borderRadius: Radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  liveText: {
    fontSize: 17,
    lineHeight: 23,
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 6,
    paddingBottom: 14,
  },
  accessory: {
    width: 48,
    alignItems: 'center',
  },
});
