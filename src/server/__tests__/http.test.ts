/**
 * @jest-environment node
 */
import { ApiError, checkRateLimit, clientAddress, env, errorResponse, parseTrustedProxy, route } from '../http';

const ENV_KEYS = [
  'SUPERTEXT_API_KEY',
  'APP_ACCESS_TOKEN',
  'APP_ALLOW_OPEN_ACCESS',
  'APP_ALLOWED_ORIGINS',
  'APP_RATE_LIMIT_PER_MINUTE',
  'APP_TRUSTED_PROXY',
] as const;
const savedNodeEnv = process.env.NODE_ENV;

let warn: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  // Most tests tell clients apart by CF-Connecting-IP.
  process.env.APP_TRUSTED_PROXY = 'cloudflare';
});

afterEach(() => {
  warn.mockRestore();
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

  it("keeps the provider's own text out of the response and in the log", async () => {
    const response = errorResponse(
      new ApiError(502, 'upstream_error', 'Speech recognition failed. Please try again.', 'HTTP 500: /tmp/x1 account 42')
    );
    const text = await response.text();
    expect(text).not.toContain('/tmp/x1');
    expect(JSON.parse(text)).toEqual({
      error: { code: 'upstream_error', message: 'Speech recognition failed. Please try again.' },
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('/tmp/x1'));
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

describe('trusted proxy', () => {
  const headers = (h: Record<string, string>) => new Request('https://lt.example/api/speak', { headers: h });

  it('parses APP_TRUSTED_PROXY', () => {
    expect(parseTrustedProxy('cloudflare')).toEqual({ kind: 'cloudflare' });
    expect(parseTrustedProxy(' NONE ')).toEqual({ kind: 'none' });
    expect(parseTrustedProxy('x-forwarded-for')).toEqual({ kind: 'x-forwarded-for', hops: 1 });
    expect(parseTrustedProxy('x-forwarded-for:2')).toEqual({ kind: 'x-forwarded-for', hops: 2 });
    expect(parseTrustedProxy('x-forwarded-for:0')).toEqual({ kind: 'none' });
    expect(parseTrustedProxy('bogus')).toEqual({ kind: 'none' });
    // Not on Cloudflare Workers (EAS Hosting): trust nobody by default.
    expect(parseTrustedProxy(undefined)).toEqual({ kind: 'none' });
  });

  it('defaults to Cloudflare on Cloudflare Workers', () => {
    const agent = jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Cloudflare-Workers');
    try {
      expect(parseTrustedProxy(undefined)).toEqual({ kind: 'cloudflare' });
    } finally {
      agent.mockRestore();
    }
  });

  it('takes the right-most untrusted X-Forwarded-For entry', () => {
    const request = headers({ 'x-forwarded-for': '6.6.6.6, 1.2.3.4, 10.0.0.1' });
    expect(clientAddress(request, { kind: 'x-forwarded-for', hops: 1 })).toBe('10.0.0.1');
    expect(clientAddress(request, { kind: 'x-forwarded-for', hops: 2 })).toBe('1.2.3.4');
    // Fewer entries than proxies: no address.
    expect(clientAddress(request, { kind: 'x-forwarded-for', hops: 4 })).toBeNull();
  });

  it('believes no header when no proxy is trusted', () => {
    const request = headers({ 'x-forwarded-for': '1.2.3.4', 'cf-connecting-ip': '1.2.3.4', 'x-real-ip': '1.2.3.4' });
    expect(clientAddress(request, { kind: 'none' })).toBeNull();
    expect(clientAddress(request, { kind: 'x-forwarded-for', hops: 1 })).toBe('1.2.3.4');
    expect(clientAddress(headers({ 'x-forwarded-for': '1.2.3.4' }), { kind: 'cloudflare' })).toBeNull();
  });
});

describe('checkRateLimit', () => {
  const from = (headers: Record<string, string>, path: string) =>
    new Request(`https://lt.example${path}`, { headers });

  it('allows `limit` requests per client, route and minute', () => {
    const now = 1_000_000;
    const client = (ip: string, path = '/api/speak') => from({ 'cf-connecting-ip': ip }, path);
    for (let i = 0; i < 3; i++) checkRateLimit(client('1.1.1.1'), 3, now);
    expect(() => checkRateLimit(client('1.1.1.1'), 3, now + 1)).toThrow(
      expect.objectContaining({ status: 429, code: 'rate_limited' })
    );
    // Another client, another route, or the next minute is not affected.
    expect(() => checkRateLimit(client('2.2.2.2'), 3, now + 1)).not.toThrow();
    expect(() => checkRateLimit(client('1.1.1.1', '/api/translate'), 3, now + 1)).not.toThrow();
    expect(() => checkRateLimit(client('1.1.1.1'), 3, now + 60_000)).not.toThrow();
  });

  it('does not reset when an untrusted client rotates X-Forwarded-For', () => {
    process.env.APP_TRUSTED_PROXY = 'none';
    const now = 2_000_000;
    const spoofed = (n: number) => from({ 'x-forwarded-for': `203.0.113.${n}`, 'cf-connecting-ip': `198.51.100.${n}` }, '/api/xff-none');
    for (let i = 0; i < 3; i++) checkRateLimit(spoofed(i), 3, now);
    expect(() => checkRateLimit(spoofed(99), 3, now + 1)).toThrow(expect.objectContaining({ status: 429 }));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('share one rate limit'));
  });

  it('does not reset when a client rotates the entries left of a trusted proxy', () => {
    process.env.APP_TRUSTED_PROXY = 'x-forwarded-for:1';
    const now = 3_000_000;
    // The proxy appends the real address (192.0.2.7); the client controls what comes before it.
    const spoofed = (n: number) => from({ 'x-forwarded-for': `203.0.113.${n}, 192.0.2.7` }, '/api/xff-one');
    for (let i = 0; i < 3; i++) checkRateLimit(spoofed(i), 3, now);
    expect(() => checkRateLimit(spoofed(99), 3, now + 1)).toThrow(expect.objectContaining({ status: 429 }));
    // A different real client behind the same proxy has its own limit.
    expect(() => checkRateLimit(from({ 'x-forwarded-for': '192.0.2.8' }, '/api/xff-one'), 3, now + 1)).not.toThrow();
  });

  it('is off at 0', () => {
    for (let i = 0; i < 100; i++) checkRateLimit(from({ 'cf-connecting-ip': '3.3.3.3' }, '/api/speak'), 0);
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
