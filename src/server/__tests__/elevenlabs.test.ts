/**
 * @jest-environment node
 */
import { bodyOf, json, mockFetch } from '@/test-utils/fetch-mock';

/** Fresh module per test, so in-memory caches start empty. */
const load = async () => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- re-require after resetModules
  return require('../elevenlabs') as typeof import('../elevenlabs');
};

const audio = () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
const VOICES = {
  voices: [
    { voice_id: 'cloned1', name: 'My clone', category: 'cloned', labels: {} },
    { voice_id: 'premade1', name: 'Eldrin', category: 'premade', labels: { gender: 'male', accent: 'british' } },
  ],
};

beforeEach(() => {
  process.env.ELEVENLABS_API_KEY = 'el-key';
  delete process.env.ELEVENLABS_VOICE_ID;
});

afterEach(() => {
  delete process.env.ELEVENLABS_API_KEY;
});

describe('synthesize', () => {
  it('uses Flash v2.5 with language enforcement and speed', async () => {
    const calls = mockFetch(audio);
    const { synthesize } = await load();
    const response = await synthesize({ text: 'Grüezi', languageId: 'de-CH', voiceId: 'voice1', speed: 1.15 });
    expect(response.headers.get('content-type')).toBe('audio/mpeg');
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1, 2, 3]);
    expect(calls[0].url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice1?output_format=mp3_44100_64');
    expect(new Headers(calls[0].init.headers).get('xi-api-key')).toBe('el-key');
    expect(calls[0].body).toEqual({
      text: 'Grüezi',
      model_id: 'eleven_flash_v2_5',
      language_code: 'de',
      voice_settings: { speed: 1.15 },
    });
  });

  it('uses v3 without Flash-only options for languages Flash cannot speak', async () => {
    const calls = mockFetch(audio);
    const { synthesize } = await load();
    await synthesize({ text: 'Zdravo', languageId: 'sr-Latn', voiceId: 'v', speed: 0.85 });
    expect(calls[0].body).toEqual({ text: 'Zdravo', model_id: 'eleven_v3' });
  });

  it('drops a language code the model rejects', async () => {
    const calls = mockFetch((_url, init) =>
      bodyOf(init).language_code
        ? json(400, { detail: { status: 'invalid_language_code', message: 'Unsupported language_code' } })
        : audio()
    );
    const { synthesize } = await load();
    await synthesize({ text: 'Hei', languageId: 'nb', voiceId: 'v' });
    expect(calls).toHaveLength(2);
    expect(calls[1].body).not.toHaveProperty('language_code');
  });

  it('picks a premade voice when none is given', async () => {
    const calls = mockFetch((url) => (url.includes('/v2/voices') ? json(200, VOICES) : audio()));
    const { synthesize } = await load();
    await synthesize({ text: 'Hello', languageId: 'en-US' });
    expect(calls[0].url).toBe('https://api.elevenlabs.io/v2/voices?page_size=100');
    expect(calls[1].url).toContain('/v1/text-to-speech/premade1?');
  });

  it('falls back to the default voice when the chosen one was removed', async () => {
    const calls = mockFetch((url) => {
      if (url.includes('/v2/voices')) return json(200, VOICES);
      if (url.includes('/gone?')) return json(404, { detail: { status: 'voice_not_found', message: 'Voice not found' } });
      return audio();
    });
    const { synthesize } = await load();
    await synthesize({ text: 'Hello', languageId: 'en-US', voiceId: 'gone' });
    expect(calls.map((c) => c.url.split('?')[0])).toEqual([
      'https://api.elevenlabs.io/v1/text-to-speech/gone',
      'https://api.elevenlabs.io/v2/voices',
      'https://api.elevenlabs.io/v1/text-to-speech/premade1',
    ]);
  });

  it('prefers ELEVENLABS_VOICE_ID over looking up voices', async () => {
    process.env.ELEVENLABS_VOICE_ID = 'configured';
    const calls = mockFetch(audio);
    const { synthesize } = await load();
    await synthesize({ text: 'Hello', languageId: 'en-US' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/v1/text-to-speech/configured?');
  });
});

describe('transcribe', () => {
  it('uploads to Scribe v2 with a language hint', async () => {
    const calls = mockFetch(() => json(200, { text: ' Wo ist der Bahnhof? ', language_code: 'deu' }));
    const { transcribe } = await load();
    await expect(transcribe(new Blob([new Uint8Array(2000)], { type: 'audio/mp4' }), 'de-AT')).resolves.toEqual({
      text: 'Wo ist der Bahnhof?',
      languageCode: 'deu',
    });
    expect(calls[0].url).toBe('https://api.elevenlabs.io/v1/speech-to-text');
    const form = calls[0].body as FormData;
    expect(form.get('model_id')).toBe('scribe_v2');
    expect(form.get('language_code')).toBe('de');
    expect(form.get('tag_audio_events')).toBe('false');
    expect((form.get('file') as File).name).toBe('speech.m4a');
  });

  it('auto-detects when the language hint is rejected', async () => {
    const calls = mockFetch((_url, init) =>
      (init.body as FormData).get('language_code')
        ? json(400, { detail: { message: 'Invalid language code' } })
        : json(200, { text: 'Hei', language_code: 'nor' })
    );
    const { transcribe } = await load();
    await expect(transcribe(new Blob([new Uint8Array(2000)]), 'nb')).resolves.toMatchObject({ text: 'Hei' });
    expect(calls).toHaveLength(2);
  });

  it('does not retry other failures', async () => {
    // Real response to a bad key (probed 2026-09-26).
    const calls = mockFetch(() =>
      json(401, {
        detail: { type: 'authentication_error', code: 'unauthorized', message: 'Invalid API key', status: 'invalid_api_key' },
      })
    );
    const { transcribe } = await load();
    await expect(transcribe(new Blob([new Uint8Array(2000)]), 'de-DE')).rejects.toMatchObject({ code: 'upstream_auth' });
    expect(calls).toHaveLength(1);
  });
});

describe('error mapping', () => {
  it('reports an exhausted quota as such, not as a bad key', async () => {
    mockFetch(() =>
      json(401, { detail: { status: 'quota_exceeded', message: 'This request exceeds your quota of 10000.' } })
    );
    const { synthesize } = await load();
    await expect(synthesize({ text: 'Hi', languageId: 'en-US', voiceId: 'v' })).rejects.toMatchObject({
      status: 402,
      code: 'quota_exceeded',
    });
  });
});

describe('createRealtimeSttToken', () => {
  it('mints a realtime_scribe single-use token', async () => {
    const calls = mockFetch(() => json(200, { token: 'sutkn_123' }));
    const { createRealtimeSttToken } = await load();
    const result = await createRealtimeSttToken();
    expect(result.token).toBe('sutkn_123');
    expect(result.expiresAt).toBeGreaterThan(Date.now());
    expect(calls[0].url).toBe('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe');
    expect(calls[0].init.method).toBe('POST');
  });
});
