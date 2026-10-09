import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
} from 'react-native';

import { accentFor, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { canRetry, type Message, type Speaker } from '@/lib/conversation';
import type { Language } from '@/lib/languages';

interface MessageBubbleProps {
  message: Message;
  /** Whose half of the screen the bubble is shown in. */
  reader: Speaker;
  readerLanguage: Language;
  /** Newest incoming translation — shown larger so it can be read at a glance. */
  emphasized: boolean;
  playing: boolean;
  preparing: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

/**
 * The reader's own words appear on the right in their language; the other person's words
 * appear on the left, translated into the reader's language.
 */
export function MessageBubble({
  message,
  reader,
  readerLanguage,
  emphasized,
  playing,
  preparing,
  onPress,
  onLongPress,
}: MessageBubbleProps) {
  const colors = useTheme();
  const own = message.speaker === reader;
  const { accent, soft } = accentFor(colors, message.speaker);
  const failed = message.status === 'error';
  const retry = canRetry(message);

  // Long-press opens the message's actions; screen readers reach them as a custom action.
  const a11y = {
    accessibilityRole: 'button' as const,
    accessibilityHint: failed ? (retry ? 'Retries the translation' : undefined) : 'Plays the translation',
    accessibilityActions: [{ name: 'activate' }, { name: 'more', label: 'More actions' }],
    onAccessibilityAction: (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === 'activate') onPress();
      else if (event.nativeEvent.actionName === 'more') onLongPress();
    },
  };

  const audioBadge = preparing ? (
    <ActivityIndicator size="small" color={accent} />
  ) : playing ? (
    <Ionicons name="volume-high" size={18} color={accent} />
  ) : null;

  if (own) {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        {...a11y}
        accessibilityLabel={failed ? `${message.original}. Not translated` : message.original}
        style={[styles.row, styles.rowOwn]}>
        <View style={[styles.bubble, styles.bubbleOwn, { backgroundColor: soft }]}>
          <Text style={[styles.ownText, { color: colors.text }]}>{message.original}</Text>
          {(message.status === 'translating' || failed || audioBadge) && (
            <View style={styles.meta}>
              {message.status === 'translating' && <ActivityIndicator size="small" color={accent} />}
              {failed && (
                <>
                  <Ionicons name="alert-circle" size={16} color={colors.danger} />
                  {/* The app's own messages are in English, the owner's language. */}
                  {reader === 'me' && (
                    <Text style={[styles.metaText, { color: colors.danger }]}>
                      Not translated{message.error ? `: ${message.error}` : ''}
                      {retry ? ' · tap to retry' : ''}
                    </Text>
                  )}
                </>
              )}
              {audioBadge}
            </View>
          )}
        </View>
      </Pressable>
    );
  }

  const text =
    message.status === 'done'
      ? message.translation
      : message.status === 'translating'
        ? readerLanguage.ui.translating
        : reader === 'me'
          ? (message.error ?? 'Translation failed')
          : '…';

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      {...a11y}
      accessibilityLabel={text}
      style={[styles.row, styles.rowOther]}>
      <View
        style={[
          styles.bubble,
          styles.bubbleOther,
          { backgroundColor: colors.surface, borderColor: failed ? colors.danger : colors.border },
        ]}>
        <View style={[styles.stripe, { backgroundColor: accent }]} />
        <Text
          style={[
            emphasized ? styles.incomingLarge : styles.incoming,
            {
              color:
                message.status === 'done' ? colors.text : failed ? colors.danger : colors.textSecondary,
            },
          ]}>
          {text}
        </Text>
        {audioBadge && <View style={styles.meta}>{audioBadge}</View>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    flexDirection: 'row',
  },
  rowOwn: {
    justifyContent: 'flex-end',
  },
  rowOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '88%',
    borderRadius: Radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  bubbleOwn: {
    borderBottomRightRadius: 6,
  },
  bubbleOther: {
    borderBottomLeftRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 20,
    overflow: 'hidden',
  },
  stripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  ownText: {
    fontSize: 16,
    lineHeight: 22,
  },
  incoming: {
    fontSize: 19,
    lineHeight: 26,
    fontWeight: '500',
  },
  incomingLarge: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '600',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  metaText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '500',
  },
});
