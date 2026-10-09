import type { VoicesResponse } from '@/lib/api-types';
import { listVoices, pickDefaultVoice } from '@/providers/elevenlabs';
import { env, route } from '@/server/http';

/** Voices available to the ElevenLabs account behind the server. */
export const GET = route(async () => {
  const voices = await listVoices(env.elevenLabsKey());
  // From the list just loaded, so the account's voices are fetched once per request.
  const defaultVoiceId =
    voices.length > 0 ? (env.defaultVoiceId() ?? pickDefaultVoice(voices)?.id ?? null) : null;
  const body: VoicesResponse = { voices, defaultVoiceId };
  return Response.json(body);
});
