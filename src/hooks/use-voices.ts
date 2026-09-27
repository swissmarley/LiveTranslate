import { useEffect, useState } from 'react';

import type { Voice } from '@/lib/api-types';
import { api, errorMessage } from '@/services/api-client';
import { useApiKeys } from '@/store/api-keys';

interface VoicesResult {
  /** The user's ElevenLabs key when loaded ('' = the server's account). */
  key: string;
  attempt: number;
  voices: Voice[];
  defaultVoiceId: string | null;
  error: string | null;
}

/** Voices of the ElevenLabs account in use (the user's own key, else the server's). */
export function useVoices() {
  const elevenLabsKey = useApiKeys((state) => state.elevenlabs);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<VoicesResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .voices()
      .then(({ voices, defaultVoiceId }) => {
        if (!cancelled) setResult({ key: elevenLabsKey, attempt, voices, defaultVoiceId, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setResult((previous) => {
            const same = previous?.key === elevenLabsKey;
            return {
              key: elevenLabsKey,
              attempt,
              voices: same ? previous.voices : [],
              defaultVoiceId: same ? previous.defaultVoiceId : null,
              error: errorMessage(error),
            };
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, elevenLabsKey]);

  const current = result?.key === elevenLabsKey ? result : null;
  const loading = current?.attempt !== attempt;
  return {
    voices: current?.voices ?? [],
    defaultVoiceId: current?.defaultVoiceId ?? null,
    loading,
    error: loading ? null : (current?.error ?? null),
    reload: () => setAttempt((n) => n + 1),
  };
}
