import type { VoicesResponse } from '@/lib/api-types';
import { getDefaultVoiceId, listVoices } from '@/server/elevenlabs';
import { route } from '@/server/http';

/** Voices available to the ElevenLabs account behind the server. */
export const GET = route(async () => {
  const voices = await listVoices();
  const defaultVoiceId = voices.length > 0 ? await getDefaultVoiceId().catch(() => null) : null;
  const body: VoicesResponse = { voices, defaultVoiceId };
  return Response.json(body);
});
