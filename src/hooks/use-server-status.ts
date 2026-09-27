import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import type { HealthResponse } from '@/lib/api-types';
import { api, errorMessage } from '@/services/api-client';
import { useApiKeys } from '@/store/api-keys';
import { useSettings } from '@/store/settings';

export type ServerStatus =
  | { state: 'checking' }
  | { state: 'ok'; health: HealthResponse }
  | { state: 'error'; message: string };

/** Human-readable problem with the setup (keys or server), or null when everything is in place. */
export function describeServerProblem(status: ServerStatus): string | null {
  if (status.state === 'error') return status.message;
  if (status.state !== 'ok') return null;
  const { health } = status;
  if (!health.authorized) return 'The server rejected this app (APP_ACCESS_TOKEN mismatch).';
  const missing = [!health.supertext && 'Supertext', !health.elevenlabs && 'ElevenLabs'].filter(Boolean);
  if (missing.length === 0) return null;
  const keys = missing.length > 1 ? 'keys' : 'key';
  return `Add your ${missing.join(' and ')} API ${keys} in Settings (the server has none).`;
}

interface CheckResult {
  setup: string;
  attempt: number;
  status: ServerStatus;
}

/** Checks the setup on mount, when the server URL or own keys change and when the app returns. */
export function useServerStatus() {
  const serverUrl = useSettings((state) => state.serverUrl);
  const ownKeys = useApiKeys((state) => `${Boolean(state.supertext)},${Boolean(state.elevenlabs)}`);
  const setup = `${serverUrl}|${ownKeys}`;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<CheckResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    const done = (status: ServerStatus) => {
      if (!cancelled) setResult({ setup, attempt, status });
    };
    api
      .health()
      .then((health) => done({ state: 'ok', health }))
      .catch((error: unknown) => done({ state: 'error', message: errorMessage(error) }));
    return () => {
      cancelled = true;
    };
  }, [setup, attempt]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setAttempt((n) => n + 1);
    });
    return () => subscription.remove();
  }, []);

  // While re-checking the same setup, keep showing the last known result.
  const status: ServerStatus = result && result.setup === setup ? result.status : { state: 'checking' };
  const checking = !result || result.setup !== setup || result.attempt !== attempt;

  return { status, checking, recheck: () => setAttempt((n) => n + 1) };
}
