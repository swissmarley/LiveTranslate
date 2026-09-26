import type { HealthResponse } from '@/lib/api-types';
import { env, hasValidAccessToken } from '@/server/http';

/** Reachability + configuration check. Does not require the app token, but reports it. */
export async function GET(request: Request): Promise<Response> {
  const body: HealthResponse = {
    ok: true,
    supertext: env.hasSupertextKey(),
    elevenlabs: env.hasElevenLabsKey(),
    accessTokenRequired: env.accessToken() !== null,
    authorized: hasValidAccessToken(request),
  };
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
