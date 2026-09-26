/**
 * Scribe Realtime single-use tokens: consumed on use, valid for 15 minutes. Keeping one
 * ready removes a network round trip from the moment someone taps the microphone.
 */

import { api } from './api-client';

const MAX_AGE_MS = 10 * 60_000;

let cached: { token: string; fetchedAt: number } | null = null;
let pending: Promise<void> | null = null;

export function prefetchSttToken(): void {
  if (pending || (cached && Date.now() - cached.fetchedAt < MAX_AGE_MS)) return;
  pending = api
    .sttToken()
    .then((response) => {
      cached = { token: response.token, fetchedAt: Date.now() };
    })
    .catch(() => {
      // Fetched again on demand.
    })
    .finally(() => {
      pending = null;
    });
}

export async function takeSttToken(): Promise<string> {
  if (pending) await pending;
  const hit = cached;
  cached = null;
  const token =
    hit && Date.now() - hit.fetchedAt < MAX_AGE_MS ? hit.token : (await api.sttToken()).token;
  setTimeout(prefetchSttToken, 500);
  return token;
}
