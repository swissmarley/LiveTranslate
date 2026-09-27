import type { VoicesResponse } from '@/lib/api-types';
import { getDefaultVoiceId, listVoices } from '@/providers/elevenlabs';
import { env, route } from '@/server/http';

/** Voices available to the ElevenLabs account behind the server. */
export const GET = route(async () => {
  const key = env.elevenLabsKey();
  const voices = await listVoices(key);
  const defaultVoiceId =
    voices.length > 0 ? await getDefaultVoiceId(key, env.defaultVoiceId()).catch(() => null) : null;
  const body: VoicesResponse = { voices, defaultVoiceId };
  return Response.json(body);
});
