import { createRealtimeSttToken } from '@/providers/elevenlabs';
import { env, route } from '@/server/http';

/**
 * Mints a single-use token so the phone can stream microphone audio straight to the
 * ElevenLabs Scribe v2 Realtime WebSocket without ever seeing the API key. Each token opens a
 * billed session that bypasses the other routes' limits, so it gets a third of their rate.
 */
export const POST = route(
  async () => {
    const token = await createRealtimeSttToken(env.elevenLabsKey());
    return Response.json(token, { headers: { 'Cache-Control': 'no-store' } });
  },
  { rateShare: 1 / 3 }
);
