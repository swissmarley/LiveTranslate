/**
 * Server-only helpers for the API routes. Uses web-standard Request/Response only, so the
 * routes run both on the Expo dev server (Node) and on EAS Hosting (Cloudflare Workers).
 */

import type { ApiErrorBody } from '@/lib/api-types';
import { ApiError } from '@/providers/http';

export { ApiError };

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

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value?.trim() ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const env = {
  supertextKey: () => required(process.env.SUPERTEXT_API_KEY, 'SUPERTEXT_API_KEY'),
  elevenLabsKey: () => required(process.env.ELEVENLABS_API_KEY, 'ELEVENLABS_API_KEY'),
  defaultVoiceId: () => process.env.ELEVENLABS_VOICE_ID?.trim() || null,
  hasSupertextKey: () => Boolean(process.env.SUPERTEXT_API_KEY?.trim()),
  hasElevenLabsKey: () => Boolean(process.env.ELEVENLABS_API_KEY?.trim()),
  accessToken: () => process.env.APP_ACCESS_TOKEN?.trim() || null,
  /** Explicit opt-in to run a deployed server without APP_ACCESS_TOKEN. */
  allowOpenAccess: () => process.env.APP_ALLOW_OPEN_ACCESS?.trim().toLowerCase() === 'true',
  /** Extra browser origins allowed to call the API (comma-separated), besides the server's own. */
  allowedOrigins: () =>
    (process.env.APP_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin: string) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  /** Requests per minute per client and route; 0 turns the limit off. */
  rateLimit: () => positiveInt(process.env.APP_RATE_LIMIT_PER_MINUTE, 30),
  trustedProxy: () => parseTrustedProxy(process.env.APP_TRUSTED_PROXY),
  isProduction: () => process.env.NODE_ENV === 'production',
};

/** Compares in time that depends only on the expected token's length. */
function safeEqual(actual: string, expected: string): boolean {
  let diff = actual.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) {
    diff |= (actual.charCodeAt(i) | 0) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * A deployed server without APP_ACCESS_TOKEN would let anyone who finds its URL spend the
 * provider credit, so it refuses to serve unless APP_ALLOW_OPEN_ACCESS=true says that is wanted.
 */
export function accessProblem(): string | null {
  if (env.accessToken() || !env.isProduction() || env.allowOpenAccess()) return null;
  return 'APP_ACCESS_TOKEN is not set on the server. Set it (and EXPO_PUBLIC_APP_TOKEN in the app), or set APP_ALLOW_OPEN_ACCESS=true to run an open server.';
}

export function hasValidAccessToken(request: Request): boolean {
  const expected = env.accessToken();
  if (!expected) return accessProblem() === null;
  return safeEqual(request.headers.get('x-app-token') ?? '', expected);
}

function checkAccess(request: Request): void {
  const problem = accessProblem();
  if (problem) throw new ApiError(503, 'not_configured', problem);
  if (!hasValidAccessToken(request)) {
    throw new ApiError(401, 'unauthorized', 'Missing or invalid app token.');
  }
}

/**
 * Browsers send Origin; the app's native fetch does not. A deployed server only answers its own
 * web app (and APP_ALLOWED_ORIGINS), so other websites can't spend its credit from their
 * visitors' browsers. The dev server already rejects foreign origins itself.
 */
function checkOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (!origin || !env.isProduction()) return;
  const allowed = new Set([new URL(request.url).origin, ...env.allowedOrigins()]);
  if (allowed.has(origin)) return;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    if (host && new URL(origin).host === host) return;
  } catch {
    // "null" or a malformed origin
  }
  throw new ApiError(403, 'forbidden_origin', 'This server does not accept requests from other websites.');
}

/**
 * Who may tell the server a client's IP address. Clients can send any X-Forwarded-For or
 * CF-Connecting-IP header themselves, so these are only believed when a proxy in front of the
 * server sets them:
 * - "cloudflare": CF-Connecting-IP, which Cloudflare (and so EAS Hosting) always overwrites.
 * - "x-forwarded-for:<hops>": <hops> proxies of yours each append to X-Forwarded-For; the client
 *   is the entry they appended last, counted from the right. Entries further left are unverified.
 * - "none": no header is believed. The routes see a web-standard Request without the socket
 *   address, so all clients then share one rate-limit bucket.
 */
export type TrustedProxy = { kind: 'cloudflare' } | { kind: 'x-forwarded-for'; hops: number } | { kind: 'none' };

/** Cloudflare Workers, which EAS Hosting runs on, identify themselves this way. */
const onCloudflareWorkers = () =>
  typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

const warned = new Set<string>();
function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[api] ${message}`);
}

export function parseTrustedProxy(value: string | undefined): TrustedProxy {
  const setting = value?.trim().toLowerCase() ?? '';
  if (!setting) return onCloudflareWorkers() ? { kind: 'cloudflare' } : { kind: 'none' };
  if (setting === 'cloudflare' || setting === 'none') return { kind: setting };
  const forwarded = /^x-forwarded-for(?::(\d+))?$/.exec(setting);
  const hops = forwarded ? Number(forwarded[1] ?? 1) : 0;
  if (hops >= 1) return { kind: 'x-forwarded-for', hops };
  warnOnce(`invalid:${setting}`, `APP_TRUSTED_PROXY="${value}" is not valid; trusting no proxy.`);
  return { kind: 'none' };
}

/** The client's address as vouched for by a trusted proxy, or null when there is none. */
export function clientAddress(request: Request, trust: TrustedProxy = env.trustedProxy()): string | null {
  if (trust.kind === 'cloudflare') return request.headers.get('cf-connecting-ip')?.trim() || null;
  if (trust.kind === 'x-forwarded-for') {
    const entries = (request.headers.get('x-forwarded-for') ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    // Fewer entries than proxies: the request did not come through all of them.
    return entries.length >= trust.hops ? entries[entries.length - trust.hops] : null;
  }
  return null;
}

const WINDOW_MS = 60_000;
const windows = new Map<string, { start: number; count: number }>();
/** Rate-limit bucket of clients whose address no trusted proxy vouches for. */
const SHARED_BUCKET = '*';

function clientId(request: Request): string {
  const trust = env.trustedProxy();
  const address = clientAddress(request, trust);
  if (address) return address;
  warnOnce(
    `shared:${trust.kind}`,
    trust.kind === 'none'
      ? 'No trusted proxy (APP_TRUSTED_PROXY), so all clients share one rate limit. Set it to "cloudflare" or "x-forwarded-for:<hops>" when the server runs behind one.'
      : `APP_TRUSTED_PROXY is "${trust.kind}" but a request had no client address from it; such requests share one rate limit.`
  );
  return SHARED_BUCKET;
}

/**
 * Fixed-window limit per client and route. Kept in memory, so on serverless hosting it is per
 * instance: it stops a single client from hammering the server, but it is no spend cap. Set a
 * credit quota on the provider keys for that.
 */
export function checkRateLimit(request: Request, limit: number, now = Date.now()): void {
  if (limit <= 0) return;
  const key = `${new URL(request.url).pathname}|${clientId(request)}`;
  let entry = windows.get(key);
  if (!entry || now - entry.start >= WINDOW_MS) {
    if (windows.size >= 10_000) {
      for (const [k, w] of windows) if (now - w.start >= WINDOW_MS) windows.delete(k);
    }
    entry = { start: now, count: 0 };
    windows.set(key, entry);
  }
  entry.count++;
  if (entry.count > limit) {
    throw new ApiError(429, 'rate_limited', 'Too many requests. Please wait a minute and try again.');
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    // The provider's own words stay in the server log; the app gets the fixed message.
    if (error.detail) console.warn(`[api] ${error.code}: ${error.detail}`);
    const message =
      error.code === 'upstream_auth' ? `${error.message} Check the key set on the server.` : error.message;
    const body: ApiErrorBody = { error: { code: error.code, message } };
    return Response.json(body, { status: error.status });
  }
  console.error('[api] unexpected error', error);
  const body: ApiErrorBody = {
    error: { code: 'internal_error', message: 'Unexpected server error.' },
  };
  return Response.json(body, { status: 500 });
}

interface RouteOptions {
  /** Share of the per-minute limit this route allows (e.g. 1/3 for live-recognition tokens). */
  rateShare?: number;
}

/** Wraps a route handler with origin and access checks, a rate limit and uniform JSON errors. */
export function route(handler: (request: Request) => Promise<Response>, options: RouteOptions = {}) {
  return async (request: Request): Promise<Response> => {
    try {
      checkOrigin(request);
      checkAccess(request);
      checkRateLimit(request, Math.ceil(env.rateLimit() * (options.rateShare ?? 1)));
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
