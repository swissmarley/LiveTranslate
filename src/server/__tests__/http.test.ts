/**
 * @jest-environment node
 */
import { ApiError, checkRateLimit, env, errorResponse, route } from '../http';

const ENV_KEYS = [
  'SUPERTEXT_API_KEY',
  'APP_ACCESS_TOKEN',
  'APP_ALLOW_OPEN_ACCESS',
  'APP_ALLOWED_ORIGINS',
  'APP_RATE_LIMIT_PER_MINUTE',
] as const;
const savedNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  (process.env as Record<string, string | undefined>).NODE_ENV = savedNodeEnv;
});

const setProduction = () => {
  (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
};

let ip = 0;
/** Each request comes from a fresh client, so the rate limit doesn't carry over between tests. */
const request = (headers: Record<string, string> = {}, url = 'https://lt.example/api/translate') =>
  new Request(url, { method: 'POST', headers: { 'cf-connecting-ip': `10.0.0.${++ip}`, ...headers } });

const ok = route(async () => Response.json({ ok: true }));

describe('env', () => {
  it('refuses to run without a key', () => {
    delete process.env.SUPERTEXT_API_KEY;
    expect(() => env.supertextKey()).toThrow(expect.objectContaining({ status: 503, code: 'not_configured' }));
  });

  it('trims the key', () => {
    process.env.SUPERTEXT_API_KEY = '  st-key \n';
    expect(env.supertextKey()).toBe('st-key');
  });
});

describe('errorResponse', () => {
  it('points at the server when a provider rejects its key', async () => {
    const response = errorResponse(new ApiError(502, 'upstream_auth', 'Supertext rejected the API key.'));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'upstream_auth', message: 'Supertext rejected the API key. Check the key set on the server.' },
    });
  });
});

describe('route access', () => {
  it('is open in development without a token', async () => {
    expect((await ok(request())).status).toBe(200);
  });

  it('fails closed in production without a token', async () => {
    setProduction();
    const response = await ok(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'not_configured' } });
  });

  it('can be opened explicitly in production', async () => {
    setProduction();
    process.env.APP_ALLOW_OPEN_ACCESS = 'true';
    expect((await ok(request())).status).toBe(200);
  });

  it('requires the exact token when one is set', async () => {
    process.env.APP_ACCESS_TOKEN = 'secret-token';
    expect((await ok(request())).status).toBe(401);
    expect((await ok(request({ 'x-app-token': 'secret-tokem' }))).status).toBe(401);
    expect((await ok(request({ 'x-app-token': 'secret-token-and-more' }))).status).toBe(401);
    expect((await ok(request({ 'x-app-token': 'secret-token' }))).status).toBe(200);
  });
});

describe('route origin check', () => {
  beforeEach(() => {
    setProduction();
    process.env.APP_ACCESS_TOKEN = 't';
  });

  it('accepts the app (no Origin) and its own web page', async () => {
    expect((await ok(request({ 'x-app-token': 't' }))).status).toBe(200);
    expect((await ok(request({ 'x-app-token': 't', origin: 'https://lt.example' }))).status).toBe(200);
  });

  it('accepts the origin of the Host header (behind a proxy)', async () => {
    const response = await ok(
      request({ 'x-app-token': 't', origin: 'https://public.example', host: 'public.example' }, 'http://10.1.2.3/api/translate')
    );
    expect(response.status).toBe(200);
  });

  it('rejects other websites unless listed', async () => {
    const evil = request({ 'x-app-token': 't', origin: 'https://evil.example' });
    expect((await ok(evil)).status).toBe(403);
    process.env.APP_ALLOWED_ORIGINS = 'https://evil.example/';
    expect((await ok(request({ 'x-app-token': 't', origin: 'https://evil.example' }))).status).toBe(200);
    expect((await ok(request({ 'x-app-token': 't', origin: 'null' }))).status).toBe(403);
  });
});

describe('checkRateLimit', () => {
  const from = (client: string, path = '/api/speak') =>
    new Request(`https://lt.example${path}`, { headers: { 'x-forwarded-for': `${client}, 10.9.9.9` } });

  it('allows `limit` requests per client, route and minute', () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit(from('1.1.1.1'), 3, now);
    expect(() => checkRateLimit(from('1.1.1.1'), 3, now + 1)).toThrow(
      expect.objectContaining({ status: 429, code: 'rate_limited' })
    );
    // Another client, another route, or the next minute is not affected.
    expect(() => checkRateLimit(from('2.2.2.2'), 3, now + 1)).not.toThrow();
    expect(() => checkRateLimit(from('1.1.1.1', '/api/translate'), 3, now + 1)).not.toThrow();
    expect(() => checkRateLimit(from('1.1.1.1'), 3, now + 60_000)).not.toThrow();
  });

  it('is off at 0', () => {
    for (let i = 0; i < 100; i++) checkRateLimit(from('3.3.3.3'), 0);
  });

  it('applies to routes, with a smaller share for live-recognition tokens', async () => {
    process.env.APP_RATE_LIMIT_PER_MINUTE = '3';
    const token = route(async () => Response.json({ ok: true }), { rateShare: 1 / 3 });
    const sameClient = () =>
      new Request('https://lt.example/api/stt-token', { method: 'POST', headers: { 'cf-connecting-ip': '4.4.4.4' } });
    expect((await token(sameClient())).status).toBe(200);
    expect((await token(sameClient())).status).toBe(429);
  });
});
