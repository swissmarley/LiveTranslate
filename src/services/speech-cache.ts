import { Directory, File, Paths } from 'expo-file-system';

import type { SpeakRequest } from '@/lib/api-types';

import { api } from './api-client';
import { speechCacheKey } from './speech-key';

const speechDirectory = () => new Directory(Paths.cache, 'speech');

/** Returns a local file URI with the spoken text, synthesizing it on first use. */
export async function getSpeechUri(request: SpeakRequest): Promise<string> {
  const directory = speechDirectory();
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  const file = new File(directory, `${speechCacheKey(request)}.mp3`);
  if (file.exists && file.size > 0) return file.uri;
  const audio = await api.speak(request);
  file.create({ overwrite: true });
  file.write(audio);
  return file.uri;
}

export function clearSpeechCache(): void {
  const directory = speechDirectory();
  if (directory.exists) directory.delete();
}
