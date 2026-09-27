import { createRealtimeSttToken } from '@/providers/elevenlabs';
import { env, route } from '@/server/http';

/**
 * Mints a single-use token so the phone can stream microphone audio straight to the
 * ElevenLabs Scribe v2 Realtime WebSocket without ever seeing the API key.
 */
export const POST = route(async () => {
  const token = await createRealtimeSttToken(env.elevenLabsKey());
  return Response.json(token, { headers: { 'Cache-Control': 'no-store' } });
});
