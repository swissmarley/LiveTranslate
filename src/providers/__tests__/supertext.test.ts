/**
 * @jest-environment node
 */
import { bodyOf, json, mockFetch } from '@/test-utils/fetch-mock';

/** Fresh module per test, so in-memory caches start empty. */
const load = async () => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- re-require after resetModules
  return require('../supertext') as typeof import('../supertext');
};

describe('translateText', () => {
  it('sends a bare source code, a regional target and the auth header', async () => {
    const calls = mockFetch(() =>
      json(200, { request_id: 'r1', detected_source_lang: 'en', translated_text: ['Wo ist der Bahnhof?'] })
    );
    const { translateText } = await load();
    await expect(
      translateText('st-key', { text: 'Where is the station?', source: 'en-US', target: 'de-CH', politeness: 'more' })
    ).resolves.toEqual({ translation: 'Wo ist der Bahnhof?', detectedSourceLang: 'en' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.supertext.com/v1/translate/ai/text');
    expect(calls[0].init.headers).toMatchObject({ Authorization: 'Supertext-Auth-Key st-key' });
    expect(calls[0].body).toEqual({
      text: ['Where is the station?'],
      source_lang: 'en',
      target_lang: 'de-CH',
      politeness: 'more',
    });
  });

  it('retries without politeness when the pair does not support it', async () => {
    const calls = mockFetch((_url, init) =>
      bodyOf(init).politeness
        ? json(400, { error_code: 'FEATURE_ERROR', message: 'Politeness is not supported for this language pair' })
        : json(200, { translated_text: ['Merci'] })
    );
    const { translateText } = await load();
    await expect(
      translateText('st-key', { text: 'Thanks', source: 'en-US', target: 'fr-FR', politeness: 'less' })
    ).resolves.toMatchObject({ translation: 'Merci' });
    expect(calls).toHaveLength(2);
    expect(calls[1].body).not.toHaveProperty('politeness');
  });

  it('looks up the right target code when Supertext rejects ours', async () => {
    const calls = mockFetch((url, init) => {
      if (url.includes('/features')) {
        return json(200, {
          supported_features: [
            { source_lang: 'en', target_lang: 'de-CH', features: [] },
            { source_lang: 'en', target_lang: 'es-ES', features: ['supports_politeness'] },
          ],
        });
      }
      return bodyOf(init).target_lang === 'es'
        ? json(404, { error_code: 'INVALID_TARGET_LANGUAGE', message: 'Invalid target language' })
        : json(200, { translated_text: ['¿Dónde está la estación?'] });
    });
    const { translateText } = await load();
    await expect(
      translateText('st-key', { text: 'Where is the station?', source: 'en-US', target: 'es' })
    ).resolves.toMatchObject({ translation: '¿Dónde está la estación?' });
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.supertext.com/v1/translate/ai/text',
      'https://api.supertext.com/v1/features?source_lang=en',
      'https://api.supertext.com/v1/translate/ai/text',
    ]);
    expect(calls[2].body).toMatchObject({ target_lang: 'es-ES' });
  });

  it('turns an invalid key into a clear error', async () => {
    // Real response to a bad key (probed 2026-09-26).
    mockFetch(() => json(401, { error_code: 'API_KEY_INVALID', message: 'The API key could not be validated' }));
    const { translateText } = await load();
    await expect(translateText('st-key', { text: 'Hi', source: 'en-US', target: 'ja' })).rejects.toMatchObject({
      status: 502,
      code: 'upstream_auth',
    });
  });
});
