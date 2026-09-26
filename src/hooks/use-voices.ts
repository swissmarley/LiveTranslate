import { useEffect, useState } from 'react';

import type { Voice } from '@/lib/api-types';
import { api, errorMessage } from '@/services/api-client';

interface VoicesResult {
  attempt: number;
  voices: Voice[];
  defaultVoiceId: string | null;
  error: string | null;
}

/** Voices available on the server's ElevenLabs account. */
export function useVoices() {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<VoicesResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .voices()
      .then(({ voices, defaultVoiceId }) => {
        if (!cancelled) setResult({ attempt, voices, defaultVoiceId, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setResult((previous) => ({
            attempt,
            voices: previous?.voices ?? [],
            defaultVoiceId: previous?.defaultVoiceId ?? null,
            error: errorMessage(error),
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const loading = result?.attempt !== attempt;
  return {
    voices: result?.voices ?? [],
    defaultVoiceId: result?.defaultVoiceId ?? null,
    loading,
    error: loading ? null : (result?.error ?? null),
    reload: () => setAttempt((n) => n + 1),
  };
}
