/**
 * The user's own Supertext and ElevenLabs API keys. With a key here the app calls that
 * service directly instead of going through the server, so the app works without one.
 * Kept in the platform's secure storage (Android Keystore / iOS Keychain), not in AsyncStorage.
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { useSettings } from './settings';

export type KeyService = 'supertext' | 'elevenlabs';

export const SERVICE_NAMES: Record<KeyService, string> = {
  supertext: 'Supertext',
  elevenlabs: 'ElevenLabs',
};

const STORAGE_KEYS: Record<KeyService, string> = {
  supertext: 'live-translate.supertext-api-key',
  elevenlabs: 'live-translate.elevenlabs-api-key',
};

/** Phones only: the web build is served by the server that holds the keys. */
export const ownKeysSupported = Platform.OS !== 'web';

interface ApiKeysState {
  supertext: string;
  elevenlabs: string;
  /** False until the keys have been read from secure storage. */
  loaded: boolean;
}

export const useApiKeys = create<ApiKeysState>()(() => ({
  supertext: '',
  elevenlabs: '',
  loaded: !ownKeysSupported,
}));

async function loadApiKeys(): Promise<void> {
  try {
    const [supertext, elevenlabs] = await Promise.all([
      SecureStore.getItemAsync(STORAGE_KEYS.supertext),
      SecureStore.getItemAsync(STORAGE_KEYS.elevenlabs),
    ]);
    useApiKeys.setState({ supertext: supertext ?? '', elevenlabs: elevenlabs ?? '', loaded: true });
  } catch {
    // Unreadable (e.g. restored from another device's backup): start without keys.
    useApiKeys.setState({ loaded: true });
  }
}

if (ownKeysSupported) void loadApiKeys();

/** Saves (or, when empty, removes) the user's key for a service. */
export async function saveApiKey(service: KeyService, value: string): Promise<void> {
  const key = value.trim();
  const previous = useApiKeys.getState()[service];
  if (key) await SecureStore.setItemAsync(STORAGE_KEYS[service], key);
  else await SecureStore.deleteItemAsync(STORAGE_KEYS[service]);
  useApiKeys.setState({ [service]: key });
  if (service === 'elevenlabs' && key !== previous) {
    // Voices belong to an ElevenLabs account: pick new ones from the new account.
    useSettings.getState().update({ voices: { me: null, them: null }, voicesAutoAssigned: false });
  }
}

/** The user's key for a service, or null to use the server. */
export function ownKey(service: KeyService): string | null {
  return useApiKeys.getState()[service] || null;
}
