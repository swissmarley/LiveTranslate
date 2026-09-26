import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import type { HealthResponse } from '@/lib/api-types';
import { api, errorMessage } from '@/services/api-client';
import { useSettings } from '@/store/settings';

export type ServerStatus =
  | { state: 'checking' }
  | { state: 'ok'; health: HealthResponse }
  | { state: 'error'; message: string };

/** Human-readable problem with the server setup, or null when everything is in place. */
export function describeServerProblem(status: ServerStatus): string | null {
  if (status.state === 'error') return status.message;
  if (status.state !== 'ok') return null;
  const { health } = status;
  if (!health.authorized) return 'The server rejected this app (APP_ACCESS_TOKEN mismatch).';
  const missing = [
    !health.supertext && 'SUPERTEXT_API_KEY',
    !health.elevenlabs && 'ELEVENLABS_API_KEY',
  ].filter(Boolean);
  return missing.length ? `The server is missing ${missing.join(' and ')}.` : null;
}

interface CheckResult {
  serverUrl: string;
  attempt: number;
  status: ServerStatus;
}

/** Checks /api/health on mount, when the server URL changes and when the app returns. */
export function useServerStatus() {
  const serverUrl = useSettings((state) => state.serverUrl);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<CheckResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    const done = (status: ServerStatus) => {
      if (!cancelled) setResult({ serverUrl, attempt, status });
    };
    api
      .health()
      .then((health) => done({ state: 'ok', health }))
      .catch((error: unknown) => done({ state: 'error', message: errorMessage(error) }));
    return () => {
      cancelled = true;
    };
  }, [serverUrl, attempt]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setAttempt((n) => n + 1);
    });
    return () => subscription.remove();
  }, []);

  // While re-checking the same server, keep showing the last known result.
  const status: ServerStatus =
    result && result.serverUrl === serverUrl ? result.status : { state: 'checking' };
  const checking = !result || result.serverUrl !== serverUrl || result.attempt !== attempt;

  return { status, checking, recheck: () => setAttempt((n) => n + 1) };
}
