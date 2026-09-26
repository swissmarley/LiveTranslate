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
        const merged = { ...current, ...(persisted as Partial<SettingsData>) };
        for (const key of Object.values(SLOT_KEYS)) {
          if (!findLanguage(merged[key])) merged[key] = current[key];
        }
        merged.recentLanguages = (merged.recentLanguages ?? []).filter((id) => findLanguage(id));
        return merged;
      },
    }
  )
);
