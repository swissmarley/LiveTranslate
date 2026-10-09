import type { SpeakRequest } from '@/lib/api-types';

import { api } from './api-client';
import { speechCacheKey } from './speech-key';

/** Blob URLs kept per page; the oldest are released beyond this (roughly an hour of speech). */
const MAX_CLIPS = 200;

/** In insertion order, so the first entries are the oldest. */
const cache = new Map<string, string>();

/** Web: keeps synthesized audio as blob URLs for the lifetime of the page. */
export async function getSpeechUri(request: SpeakRequest): Promise<string> {
  const key = speechCacheKey(request);
  const hit = cache.get(key);
  if (hit) return hit;
  const audio = await api.speak(request);
  const url = URL.createObjectURL(new Blob([audio], { type: 'audio/mpeg' }));
  cache.set(key, url);
  pruneSpeechCache();
  return url;
}

/** Releases cached clips by their cache keys (e.g. those of a deleted conversation). */
export function forgetSpeech(keys: string[]): void {
  for (const key of keys) {
    const url = cache.get(key);
    if (url) URL.revokeObjectURL(url);
    cache.delete(key);
  }
}

export function pruneSpeechCache(): void {
  for (const [key, url] of cache) {
    if (cache.size <= MAX_CLIPS) break;
    URL.revokeObjectURL(url);
    cache.delete(key);
  }
}

export function clearSpeechCache(): void {
  for (const url of cache.values()) URL.revokeObjectURL(url);
  cache.clear();
}
