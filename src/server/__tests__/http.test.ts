/**
 * @jest-environment node
 */
import { ApiError, env, errorResponse } from '../http';

afterEach(() => {
  delete process.env.SUPERTEXT_API_KEY;
});

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
