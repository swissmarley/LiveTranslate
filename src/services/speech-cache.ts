import { Directory, File, Paths } from 'expo-file-system';

import type { SpeakRequest } from '@/lib/api-types';

import { api } from './api-client';
import { speechCacheKey } from './speech-key';

/** Oldest clips are removed beyond this (about 100 minutes of speech at 64 kbit/s). */
const MAX_CACHE_BYTES = 50 * 1024 * 1024;
/** Checks the cache size after this much new audio, so it overshoots by at most this. */
const PRUNE_EVERY_BYTES = 5 * 1024 * 1024;
let writtenSincePrune = 0;

const speechDirectory = () => new Directory(Paths.cache, 'speech');
const speechFile = (key: string) => new File(speechDirectory(), `${key}.mp3`);

/** Returns a local file URI with the spoken text, synthesizing it on first use. */
export async function getSpeechUri(request: SpeakRequest): Promise<string> {
  const directory = speechDirectory();
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  const file = speechFile(speechCacheKey(request));
  if (file.exists && file.size > 0) return file.uri;
  const audio = await api.speak(request);
  file.create({ overwrite: true });
  file.write(audio);
  writtenSincePrune += audio.byteLength;
  if (writtenSincePrune >= PRUNE_EVERY_BYTES) {
    writtenSincePrune = 0;
    pruneSpeechCache();
  }
  return file.uri;
}

/** Deletes cached clips by their cache keys (e.g. those of a deleted conversation). */
export function forgetSpeech(keys: string[]): void {
  for (const key of keys) {
    try {
      const file = speechFile(key);
      if (file.exists) file.delete();
    } catch {
      // already gone
    }
  }
}

/** Keeps the cache under MAX_CACHE_BYTES by deleting the least recently written clips. */
export function pruneSpeechCache(): void {
  try {
    const directory = speechDirectory();
    if (!directory.exists) return;
    const files = directory
      .list()
      .filter((entry): entry is File => entry instanceof File)
      .map((file) => ({ file, size: file.size, time: file.modificationTime ?? 0 }))
      .sort((a, b) => b.time - a.time);
    let total = 0;
    for (const { file, size } of files) {
      total += size;
      if (total > MAX_CACHE_BYTES) file.delete();
    }
  } catch {
    // The cache is an optimization; never fail because of it.
  }
}

export function clearSpeechCache(): void {
  const directory = speechDirectory();
  if (directory.exists) directory.delete();
}
