import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ApiKeyField } from '@/components/api-key-field';
import { SegmentedControl } from '@/components/segmented-control';
import { Radius } from '@/constants/theme';
import { describeServerProblem, useServerStatus } from '@/hooks/use-server-status';
import { STREAM_SUPPORTED } from '@/hooks/use-speech-input';
import { useTheme } from '@/hooks/use-theme';
import { useVoices } from '@/hooks/use-voices';
import type { Politeness } from '@/lib/api-types';
import type { Speaker } from '@/lib/conversation';
import { defaultServerUrl } from '@/services/api-client';
import { clearSpeechCache } from '@/services/speech-cache';
import { ownKeysSupported, useApiKeys } from '@/store/api-keys';
import { useSessions } from '@/store/sessions';
import {
  HISTORY_RETENTION_DETAIL,
  SPEEDS,
  useSettings,
  type HistoryRetention,
  type InputMode,
  type PauseLength,
} from '@/store/settings';
import { showToast } from '@/store/toast';

const POLITENESS: readonly { value: Politeness; label: string }[] = [
  { value: 'default', label: 'Automatic' },
  { value: 'more', label: 'Formal' },
  { value: 'less', label: 'Informal' },
];

const INPUT_MODES: readonly { value: InputMode; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: 'standard', label: 'Standard' },
];

const RETENTION: readonly { value: HistoryRetention; label: string }[] = [
  { value: 'forever', label: 'Always' },
  { value: '30d', label: '30 days' },
  { value: '7d', label: '7 days' },
  { value: '1d', label: '1 day' },
  { value: 'off', label: 'Off' },
];

const PAUSES: readonly { value: PauseLength; label: string }[] = [
  { value: 'short', label: 'Short' },
  { value: 'normal', label: 'Normal' },
  { value: 'long', label: 'Long' },
];

function Section({ title, footer, children }: { title: string; footer?: string; children: ReactNode }) {
  const colors = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>{children}</View>
      {footer ? <Text style={[styles.footer, { color: colors.textTertiary }]}>{footer}</Text> : null}
    </View>
  );
}

function Row({
  label,
  detail,
  value,
  onPress,
  right,
}: {
  label: string;
  detail?: string;
  value?: string;
  onPress?: () => void;
  right?: ReactNode;
}) {
  const colors = useTheme();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfacePressed }]}>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        {detail ? <Text style={[styles.rowDetail, { color: colors.textTertiary }]}>{detail}</Text> : null}
      </View>
      {value ? (
        <Text numberOfLines={1} style={[styles.rowValue, { color: colors.textSecondary }]}>
          {value}
        </Text>
      ) : null}
      {right}
      {onPress && !right ? <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} /> : null}
    </Pressable>
  );
}

function Divider() {
  const colors = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

function confirmDestructive(title: string, action: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(title)) onConfirm();
    return;
  }
  Alert.alert(title, 'This cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: action, style: 'destructive', onPress: onConfirm },
  ]);
}

export default function SettingsScreen() {
  const colors = useTheme();
  const router = useRouter();
  const settings = useSettings();
  const { status, checking, recheck } = useServerStatus();
  const problem = describeServerProblem(status);
  const { voices, defaultVoiceId } = useVoices();
  const [serverDraft, setServerDraft] = useState(settings.serverUrl);
  const allOwnKeys = useApiKeys((state) => Boolean(state.supertext && state.elevenlabs));

  const voiceName = (speaker: Speaker) => {
    const id = settings.voices[speaker] ?? defaultVoiceId;
    const voice = voices.find((v) => v.id === id);
    return voice ? voice.name : settings.voices[speaker] ? 'Custom voice' : 'Automatic';
  };

  const saveServer = () => {
    const value = serverDraft.trim();
    if (value && !/^https?:\/\//i.test(value)) {
      showToast('The server URL must start with http:// or https://', 'error');
      return;
    }
    settings.update({ serverUrl: value });
  };

  const inputModeDetail = !STREAM_SUPPORTED
    ? 'Records until you pause, then transcribes. Live recognition (words while you speak) needs the phone app.'
    : settings.inputMode === 'live'
      ? 'Words appear while you speak and are translated as soon as you pause (ElevenLabs Scribe Realtime).'
      : 'Records until you pause, then transcribes. Try this if live mode struggles on your network.';

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {ownKeysSupported ? (
        <Section
          title="API KEYS"
          footer="With your own keys the app talks to Supertext and ElevenLabs directly, so no server is needed. They are stored encrypted on this phone. The ElevenLabs key needs Text to Speech, Speech to Text and Voices (read).">
          <ApiKeyField service="supertext" />
          <Divider />
          <ApiKeyField service="elevenlabs" />
        </Section>
      ) : null}

      <Section title="SPEECH">
        <Row
          label="Voice for your words"
          detail="What the other person hears"
          value={voiceName('me')}
          onPress={() => router.push({ pathname: '/voices', params: { speaker: 'me' } })}
        />
        <Divider />
        <Row
          label="Voice for their words"
          detail="What you hear"
          value={voiceName('them')}
          onPress={() => router.push({ pathname: '/voices', params: { speaker: 'them' } })}
        />
        <Divider />
        <View style={styles.block}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>Speaking speed</Text>
          <SegmentedControl
            options={SPEEDS}
            value={settings.speed}
            onChange={(speed) => settings.update({ speed })}
          />
        </View>
        <Divider />
        <Row
          label="Read translations aloud"
          detail="Automatically, right after translating"
          right={
            <Switch
              accessibilityLabel="Read translations aloud"
              value={settings.autoSpeak}
              onValueChange={(autoSpeak) => settings.update({ autoSpeak })}
            />
          }
        />
      </Section>

      <Section
        title="TRANSLATION"
        footer="Formal or informal address (Sie/du, vous/tu, usted/tú) where Supertext supports it for the language pair.">
        <View style={styles.block}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>Formality</Text>
          <SegmentedControl
            options={POLITENESS}
            value={settings.politeness}
            onChange={(politeness) => settings.update({ politeness })}
          />
        </View>
      </Section>

      <Section title="RECOGNITION" footer={inputModeDetail}>
        {STREAM_SUPPORTED ? (
          <>
            <View style={styles.block}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Mode</Text>
              <SegmentedControl
                options={INPUT_MODES}
                value={settings.inputMode}
                onChange={(inputMode) => settings.update({ inputMode })}
              />
            </View>
            <Divider />
          </>
        ) : null}
        <View style={styles.block}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>Pause before translating</Text>
          <SegmentedControl options={PAUSES} value={settings.pause} onChange={(pause) => settings.update({ pause })} />
        </View>
      </Section>

      <Section title="LAYOUT">
        <Row
          label="Face-to-face"
          detail="Turn the other person's half upside down so they can read it across a table"
          right={
            <Switch
              accessibilityLabel="Face-to-face"
              value={settings.faceToFace}
              onValueChange={(faceToFace) => settings.update({ faceToFace })}
            />
          }
        />
      </Section>

      <Section
        title="SERVER"
        footer={
          ownKeysSupported
            ? 'Only needed for a service without your own key above: the server keeps its own Supertext and ElevenLabs keys. Leave the URL empty to use the development server (or EXPO_PUBLIC_API_URL).'
            : 'The server keeps the Supertext and ElevenLabs keys. Leave the URL empty to use the development server (or EXPO_PUBLIC_API_URL).'
        }>
        <View style={styles.block}>
          <TextInput
            accessibilityLabel="Server URL"
            value={serverDraft}
            onChangeText={setServerDraft}
            onEndEditing={saveServer}
            onSubmitEditing={saveServer}
            placeholder={defaultServerUrl() ?? 'https://your-server.expo.app'}
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
            style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt }]}
          />
          <View style={styles.statusRow}>
            {checking ? (
              <ActivityIndicator size="small" />
            ) : (
              <Ionicons
                name={problem ? 'close-circle' : 'checkmark-circle'}
                size={18}
                color={problem ? colors.danger : colors.success}
              />
            )}
            <Text style={[styles.statusText, { color: problem ? colors.danger : colors.textSecondary }]}>
              {allOwnKeys
                ? 'Not needed · the app uses your own keys'
                : status.state === 'checking'
                  ? 'Checking…'
                  : (problem ?? 'Connected · Supertext and ElevenLabs ready')}
            </Text>
            <Pressable accessibilityRole="button" onPress={recheck} hitSlop={8}>
              <Text style={[styles.link, { color: colors.me }]}>Check</Text>
            </Pressable>
          </View>
        </View>
      </Section>

      <Section title="HISTORY" footer={HISTORY_RETENTION_DETAIL[settings.keepHistory]}>
        <View style={styles.block}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>Keep conversations</Text>
          <SegmentedControl
            options={RETENTION}
            value={settings.keepHistory}
            onChange={(keepHistory) => settings.update({ keepHistory })}
          />
        </View>
      </Section>

      <Section title="DATA">
        <Row
          label="Clear audio cache"
          detail="Spoken translations are cached so replays are instant"
          onPress={() => {
            clearSpeechCache();
            showToast('Audio cache cleared');
          }}
        />
        <Divider />
        <Row
          label="Delete all history"
          onPress={() =>
            confirmDestructive('Delete all saved conversations?', 'Delete all', () => {
              useSessions.getState().clearHistory();
              clearSpeechCache();
              showToast('History deleted');
            })
          }
        />
      </Section>

      <Section title="PRIVACY">
        <Text style={[styles.privacy, { color: colors.textSecondary }]}>
          What both of you say is sent to ElevenLabs to be recognized, the text to Supertext to be
          translated, and the translation to ElevenLabs to be spoken
          {ownKeysSupported ? ' (through the server, unless you use your own keys)' : ' (through the server)'}.
          Nothing else from the conversation is shared. Conversations are saved only on this device
          (see History above), and spoken translations are cached here so replays are instant.
          {'\n\n'}Let the person you are talking to know that the app records and translates what
          they say.
        </Text>
      </Section>

      <Text style={[styles.about, { color: colors.textTertiary }]}>
        LiveTranslate {Constants.expoConfig?.version ?? ''}
        {'\n'}Translation by Supertext · Speech by ElevenLabs
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 48,
    gap: 22,
  },
  section: {
    gap: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  footer: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    minHeight: 52,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: 16,
  },
  rowDetail: {
    fontSize: 13,
  },
  rowValue: {
    fontSize: 15,
    maxWidth: '45%',
  },
  block: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 10,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  input: {
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  link: {
    fontSize: 14,
    fontWeight: '600',
  },
  privacy: {
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  about: {
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
  },
});
