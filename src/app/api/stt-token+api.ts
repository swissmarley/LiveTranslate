import { createRealtimeSttToken } from '@/server/elevenlabs';
import { route } from '@/server/http';

/**
 * Mints a single-use token so the phone can stream microphone audio straight to the
 * ElevenLabs Scribe v2 Realtime WebSocket without ever seeing the API key.
 */
export const POST = route(async () => {
  const token = await createRealtimeSttToken();
  return Response.json(token, { headers: { 'Cache-Control': 'no-store' } });
});
