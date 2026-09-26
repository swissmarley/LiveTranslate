import { getLanguage, LANGUAGES, matchLocale } from '../languages';

describe('language table', () => {
  it('has unique ids and complete entries', () => {
    expect(new Set(LANGUAGES.map((l) => l.id)).size).toBe(LANGUAGES.length);
    for (const language of LANGUAGES) {
      expect(language.name && language.nativeName && language.flag).toBeTruthy();
      expect(language.ui.tapToSpeak && language.ui.listening && language.ui.translating).toBeTruthy();
      // Supertext rejects regional source codes ("de-CH") — sources must be bare.
      expect(language.supertext.source).toMatch(/^[a-z]{2,3}$/);
      expect(language.stt).toMatch(/^[a-z]{2,3}$/);
      if (language.tts.model === 'eleven_flash_v2_5') expect(language.tts.languageCode).toMatch(/^[a-z]{2}$/);
    }
  });

  it('falls back to English for unknown ids', () => {
    expect(getLanguage('xx').id).toBe('en-US');
    expect(getLanguage(undefined).id).toBe('en-US');
  });
});

describe('matchLocale', () => {
  it.each([
    ['de-CH', 'de-CH'],
    ['de-DE', 'de-DE'],
    ['de', 'de-DE'],
    ['gsw-CH', 'de-CH'],
    ['en-AU', 'en-GB'],
    ['en-CA', 'en-US'],
    ['fr-CA', 'fr-FR'],
    ['it-CH', 'it-CH'],
    ['pt-BR', 'pt-BR'],
    ['pt', 'pt-PT'],
    ['zh-Hant-TW', 'zh-Hant'],
    ['zh-HK', 'zh-Hant'],
    ['zh-CN', 'zh-Hans'],
    ['sr-Latn-RS', 'sr-Latn'],
    ['sr-RS', 'sr-Cyrl'],
    ['nb-NO', 'nb'],
    ['no', 'nb'],
    ['ja-JP', 'ja'],
    ['es-MX', 'es'],
    ['es_419', 'es'],
    ['th-TH', undefined],
    [null, undefined],
  ])('%s → %s', (tag, expected) => {
    expect(matchLocale(tag)).toBe(expected);
  });
});
