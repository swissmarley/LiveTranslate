import type { SpeakRequest } from '@/lib/api-types';

import { api } from './api-client';
import { speechCacheKey } from './speech-key';

const cache = new Map<string, string>();

/** Web: keeps synthesized audio as blob URLs for the lifetime of the page. */
export async function getSpeechUri(request: SpeakRequest): Promise<string> {
  const key = speechCacheKey(request);
  const hit = cache.get(key);
  if (hit) return hit;
  const audio = await api.speak(request);
  const url = URL.createObjectURL(new Blob([audio], { type: 'audio/mpeg' }));
  cache.set(key, url);
  return url;
}

export function clearSpeechCache(): void {
  for (const url of cache.values()) URL.revokeObjectURL(url);
  cache.clear();
}
