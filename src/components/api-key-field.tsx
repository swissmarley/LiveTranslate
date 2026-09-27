import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { checkOwnKey, errorMessage } from '@/services/api-client';
import { saveApiKey, SERVICE_NAMES, useApiKeys, type KeyService } from '@/store/api-keys';
import { showToast } from '@/store/toast';

const KEY_PAGES: Record<KeyService, string> = {
  supertext: 'https://www.supertext.com/en/cockpit/api',
  elevenlabs: 'https://elevenlabs.io/app/settings/api-keys',
};

type Check =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ok' }
  | { state: 'error'; message: string };

/** Entry for the user's own API key: saved on this phone, then tried with a real request. */
export function ApiKeyField({ service }: { service: KeyService }) {
  const colors = useTheme();
  const saved = useApiKeys((state) => state[service]);
  const [draft, setDraft] = useState(saved);
  const [shown, setShown] = useState(saved);
  if (saved !== shown) {
    // Saved or removed: show the stored value.
    setShown(saved);
    setDraft(saved);
  }
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  const run = useRef(0);
  const name = SERVICE_NAMES[service];

  const test = async (key: string) => {
    const id = ++run.current;
    setCheck({ state: 'checking' });
    try {
      await checkOwnKey(service, key);
      if (run.current === id) setCheck({ state: 'ok' });
    } catch (error) {
      if (run.current === id) setCheck({ state: 'error', message: errorMessage(error) });
    }
  };

  const save = async (value: string) => {
    const key = value.trim();
    if (key === saved) return;
    try {
      await saveApiKey(service, key);
    } catch {
      showToast(`Could not save the ${name} key on this phone.`, 'error');
      return;
    }
    if (key) {
      void test(key);
    } else {
      run.current++;
      setCheck({ state: 'idle' });
    }
  };

  const status = (() => {
    if (!saved) {
      return { icon: 'key-outline', color: colors.textTertiary, text: 'Not set' } as const;
    }
    switch (check.state) {
      case 'checking':
        return null;
      case 'ok':
        return { icon: 'checkmark-circle', color: colors.success, text: 'Works' } as const;
      case 'error':
        return { icon: 'close-circle', color: colors.danger, text: check.message } as const;
      default:
        return { icon: 'lock-closed', color: colors.textSecondary, text: 'Saved on this phone' } as const;
    }
  })();

  return (
    <View style={styles.field}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: colors.text }]}>{name}</Text>
        <Pressable
          accessibilityRole="link"
          hitSlop={8}
          onPress={() => void WebBrowser.openBrowserAsync(KEY_PAGES[service]).catch(() => {})}>
          <Text style={[styles.link, { color: colors.me }]}>Get a key</Text>
        </Pressable>
      </View>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onEndEditing={() => void save(draft)}
        placeholder={`Paste your ${name} API key`}
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel={`${name} API key`}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        importantForAutofill="no"
        returnKeyType="done"
        style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt }]}
      />
      <View style={styles.statusRow}>
        {status ? (
          <Ionicons name={status.icon} size={16} color={status.color} />
        ) : (
          <ActivityIndicator size="small" />
        )}
        <Text style={[styles.statusText, { color: status?.color ?? colors.textSecondary }]}>
          {status?.text ?? 'Checking…'}
        </Text>
        {saved ? (
          <>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void test(saved)}>
              <Text style={[styles.link, { color: colors.me }]}>Check</Text>
            </Pressable>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void save('')}>
              <Text style={[styles.link, { color: colors.danger }]}>Remove</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 16,
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
});
