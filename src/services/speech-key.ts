import type { SpeakRequest } from '@/lib/api-types';

/** Two 32-bit string hashes (djb2 + FNV-1a) — enough to name cache files uniquely. */
function hash(input: string): string {
  let djb = 5381;
  let fnv = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    djb = ((djb << 5) + djb + code) | 0;
    fnv = Math.imul(fnv ^ code, 0x01000193);
  }
  return (djb >>> 0).toString(36) + (fnv >>> 0).toString(36);
}

/** Same text + language + voice + speed → same audio, so it is synthesized only once. */
export function speechCacheKey(request: SpeakRequest): string {
  return hash([request.language, request.voiceId ?? '', request.speed ?? 1, request.text].join('\u0000'));
}
