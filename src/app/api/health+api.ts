import type { HealthResponse } from '@/lib/api-types';
import { accessProblem, env, hasValidAccessToken } from '@/server/http';

/**
 * Reachability + configuration check. Does not require the app token, but reports it; which
 * providers are configured is only revealed to an authorized app.
 */
export async function GET(request: Request): Promise<Response> {
  const authorized = hasValidAccessToken(request);
  const problem = accessProblem();
  const body: HealthResponse = {
    ok: true,
    supertext: authorized && env.hasSupertextKey(),
    elevenlabs: authorized && env.hasElevenLabsKey(),
    accessTokenRequired: env.accessToken() !== null,
    authorized,
    ...(problem ? { problem } : {}),
  };
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
