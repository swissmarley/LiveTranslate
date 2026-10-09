import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Politeness } from '@/lib/api-types';
import type { Speaker } from '@/lib/conversation';
import { FALLBACK_LANGUAGE_ID, findLanguage, matchLocale, type LanguageId } from '@/lib/languages';

/** "live" streams to Scribe Realtime; "standard" records, then transcribes the file. */
export type InputMode = 'live' | 'standard';
export type PauseLength = 'short' | 'normal' | 'long';
export type LanguageSlot = 'mine' | 'theirs' | 'listenSource' | 'listenTarget';
/** How long conversations stay in History; "off" keeps only the current ones, in memory. */
export type HistoryRetention = 'forever' | '30d' | '7d' | '1d' | 'off';

export const HISTORY_RETENTION_MS: Record<HistoryRetention, number | null> = {
  forever: null,
  '30d': 30 * 86_400_000,
  '7d': 7 * 86_400_000,
  '1d': 86_400_000,
  off: 0,
};

export const HISTORY_RETENTION_DETAIL: Record<HistoryRetention, string> = {
  forever: 'Conversations are kept on this device until you delete them.',
  '30d': 'Conversations are deleted from this device 30 days after their last message.',
  '7d': 'Conversations are deleted from this device 7 days after their last message.',
  '1d': 'Conversations are deleted from this device a day after their last message.',
  off: 'Nothing is saved: the current conversation is gone when you close the app.',
};

/** Silence that marks the end of what someone said. */
export const PAUSE_SECONDS: Record<PauseLength, number> = { short: 0.8, normal: 1.2, long: 2 };

export const SPEEDS = [
  { value: 0.85, label: 'Slower' },
  { value: 1, label: 'Normal' },
  { value: 1.15, label: 'Faster' },
] as const;

interface SettingsData {
  myLanguage: LanguageId;
  theirLanguage: LanguageId;
  listenSource: LanguageId;
  listenTarget: LanguageId;
  recentLanguages: LanguageId[];
  /** Voice that reads each speaker's translated words (null = server default). */
  voices: Record<Speaker, string | null>;
  voicesAutoAssigned: boolean;
  speed: number;
  autoSpeak: boolean;
  politeness: Politeness;
  inputMode: InputMode;
  pause: PauseLength;
  /** Rotate the partner's half of the screen so it faces them across a table. */
  faceToFace: boolean;
  /** Overrides the API server URL ('' = automatic). */
  serverUrl: string;
  keepHistory: HistoryRetention;
  /** The one-time notice about what is sent where and what is kept has been dismissed. */
  privacyNoticeSeen: boolean;
}

interface SettingsActions {
  setLanguage: (slot: LanguageSlot, id: LanguageId) => void;
  swapLanguages: () => void;
  swapListenLanguages: () => void;
  setVoice: (speaker: Speaker, voiceId: string | null) => void;
  update: (patch: Partial<SettingsData>) => void;
}

export type SettingsState = SettingsData & SettingsActions;

export const SLOT_KEYS: Record<
  LanguageSlot,
  'myLanguage' | 'theirLanguage' | 'listenSource' | 'listenTarget'
> = {
  mine: 'myLanguage',
  theirs: 'theirLanguage',
  listenSource: 'listenSource',
  listenTarget: 'listenTarget',
};

function deviceLanguage(): LanguageId {
  try {
    for (const locale of getLocales()) {
      const match = matchLocale(locale.languageTag);
      if (match) return match;
    }
  } catch {
    // Localization unavailable (tests) — use the fallback.
  }
  return FALLBACK_LANGUAGE_ID;
}

function initialData(): SettingsData {
  const mine = deviceLanguage();
  const theirs = mine.startsWith('en') ? 'es' : 'en-US';
  return {
    myLanguage: mine,
    theirLanguage: theirs,
    listenSource: theirs,
    listenTarget: mine,
    recentLanguages: [mine, theirs],
    voices: { me: null, them: null },
    voicesAutoAssigned: false,
    speed: 1,
    autoSpeak: true,
    politeness: 'default',
    inputMode: 'live',
    pause: 'normal',
    faceToFace: true,
    serverUrl: '',
    keepHistory: '30d',
    privacyNoticeSeen: false,
  };
}

const withRecent = (recent: LanguageId[], id: LanguageId) =>
  [id, ...recent.filter((r) => r !== id)].slice(0, 6);

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...initialData(),
      setLanguage: (slot, id) =>
        set((state) => ({
          [SLOT_KEYS[slot]]: id,
          recentLanguages: withRecent(state.recentLanguages, id),
        })),
      swapLanguages: () =>
        set((state) => ({ myLanguage: state.theirLanguage, theirLanguage: state.myLanguage })),
      swapListenLanguages: () =>
        set((state) => ({ listenSource: state.listenTarget, listenTarget: state.listenSource })),
      setVoice: (speaker, voiceId) =>
        set((state) => ({ voices: { ...state.voices, [speaker]: voiceId } })),
      update: (patch) => set(patch),
    }),
    {
      name: 'live-translate/settings',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      // Drop languages that no longer exist (e.g. after the language table changes).
      merge: (persisted, current) => {
        const saved = persisted as Partial<SettingsData> | undefined;
        const merged = { ...current, ...saved };
        // Installs from before history retention existed kept everything; don't start deleting
        // their conversations on update. New installs keep 30 days.
        if (saved && saved.keepHistory === undefined) merged.keepHistory = 'forever';
        for (const key of Object.values(SLOT_KEYS)) {
          if (!findLanguage(merged[key])) merged[key] = current[key];
        }
        merged.recentLanguages = (merged.recentLanguages ?? []).filter((id) => findLanguage(id));
        return merged;
      },
    }
  )
);
