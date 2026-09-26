/**
 * Server-only helpers for the API routes. Uses web-standard Request/Response only, so the
 * routes run both on the Expo dev server (Node) and on EAS Hosting (Cloudflare Workers).
 */

import type { ApiErrorBody } from '@/lib/api-types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new ApiError(
      503,
      'not_configured',
      `${name} is not set on the server. Add it to .env and restart the dev server.`
    );
  }
  return trimmed;
}

export const env = {
  supertextKey: () => required(process.env.SUPERTEXT_API_KEY, 'SUPERTEXT_API_KEY'),
  elevenLabsKey: () => required(process.env.ELEVENLABS_API_KEY, 'ELEVENLABS_API_KEY'),
  defaultVoiceId: () => process.env.ELEVENLABS_VOICE_ID?.trim() || null,
  hasSupertextKey: () => Boolean(process.env.SUPERTEXT_API_KEY?.trim()),
  hasElevenLabsKey: () => Boolean(process.env.ELEVENLABS_API_KEY?.trim()),
  accessToken: () => process.env.APP_ACCESS_TOKEN?.trim() || null,
};

export function hasValidAccessToken(request: Request): boolean {
  const expected = env.accessToken();
  return !expected || request.headers.get('x-app-token') === expected;
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    const body: ApiErrorBody = { error: { code: error.code, message: error.message } };
    return Response.json(body, { status: error.status });
  }
  console.error('[api] unexpected error', error);
  const body: ApiErrorBody = {
    error: { code: 'internal_error', message: 'Unexpected server error.' },
  };
  return Response.json(body, { status: 500 });
}

/** Wraps a route handler with access control and uniform JSON errors. */
export function route(handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    try {
      if (!hasValidAccessToken(request)) {
        throw new ApiError(401, 'unauthorized', 'Missing or invalid app token.');
      }
      return await handler(request);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export async function readJson<T>(request: Request): Promise<Partial<T>> {
  try {
    const body: unknown = await request.json();
    if (body && typeof body === 'object') return body as Partial<T>;
  } catch {
    // fall through
  }
  throw new ApiError(400, 'invalid_json', 'Request body must be a JSON object.');
}

export interface UpstreamFailure {
  status: number;
  /** Raw response body (truncated), for matching error codes. */
  raw: string;
  message: string;
  code: string | null;
}

/**
 * Extracts a readable message from upstream error bodies:
 * ElevenLabs `{ detail: { code, message, status } }`, Supertext `{ error_code, message }`.
 */
export async function readFailure(response: Response): Promise<UpstreamFailure> {
  const raw = (await response.text().catch(() => '')).slice(0, 2000);
  let message = raw.slice(0, 300);
  let code: string | null = null;
  try {
    const body = JSON.parse(raw) as Record<string, unknown>;
    const detail = body.detail ?? body.error ?? body;
    if (typeof detail === 'string') {
      message = detail;
    } else if (Array.isArray(detail)) {
      message = detail
        .map((item) => (item && typeof item === 'object' && 'msg' in item ? String(item.msg) : ''))
        .filter(Boolean)
        .join('; ');
    } else if (detail && typeof detail === 'object') {
      const d = detail as Record<string, unknown>;
      const text = d.message ?? d.msg ?? d.error;
      message = typeof text === 'string' ? text : JSON.stringify(d).slice(0, 300);
      const c = d.error_code ?? d.code ?? d.status ?? d.type;
      code = typeof c === 'string' ? c : null;
    }
  } catch {
    // Not JSON — keep the raw text.
  }
  return { status: response.status, raw, message: message || `HTTP ${response.status}`, code };
}
