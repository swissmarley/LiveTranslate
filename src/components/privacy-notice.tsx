import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { HISTORY_RETENTION_DETAIL, useSettings } from '@/store/settings';

import type { IconName } from './icon-button';

/** Shown once, before the first conversation: what is sent where and what stays on the device. */
export function PrivacyNotice() {
  const colors = useTheme();
  const seen = useSettings((s) => s.privacyNoticeSeen);
  const keepHistory = useSettings((s) => s.keepHistory);
  const dismiss = () => useSettings.getState().update({ privacyNoticeSeen: true });

  const points: { icon: IconName; text: string }[] = [
    {
      icon: 'cloud-upload-outline',
      text: 'What both of you say is sent to ElevenLabs to be recognized and read aloud, and the text to Supertext to be translated.',
    },
    {
      icon: 'phone-portrait-outline',
      text: `${HISTORY_RETENTION_DETAIL[keepHistory]} You can change this in Settings → History.`,
    },
    {
      icon: 'people-outline',
      text: 'Let the person you are talking to know that the app records and translates what they say.',
    },
  ];

  return (
    <Modal visible={!seen} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={[styles.backdrop, { backgroundColor: colors.scrim }]}>
        <View
          accessibilityViewIsModal
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
              Before you start
            </Text>
            {points.map((point) => (
              <View key={point.icon} style={styles.point}>
                <Ionicons name={point.icon} size={22} color={colors.me} />
                <Text style={[styles.text, { color: colors.textSecondary }]}>{point.text}</Text>
              </View>
            ))}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            onPress={dismiss}
            style={({ pressed }) => [styles.button, { backgroundColor: colors.me, opacity: pressed ? 0.85 : 1 }]}>
            <Text style={[styles.buttonText, { color: colors.onAccent }]}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    gap: 16,
  },
  content: {
    gap: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  point: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  text: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
  },
  button: {
    minHeight: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
