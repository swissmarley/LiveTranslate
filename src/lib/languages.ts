/**
 * Languages supported end-to-end: Supertext can translate them and ElevenLabs can both
 * transcribe and speak them. Shared by the app and the API routes, so keep it free of
 * React Native imports.
 */

export type LanguageId = string;

export type TtsModel = 'eleven_flash_v2_5' | 'eleven_v3';

export interface Language {
  /** App-level identifier, also used as the Supertext target where it has a region/script. */
  id: LanguageId;
  /** English name, shown to the phone owner. */
  name: string;
  /** Name in the language itself, shown to the person speaking it. */
  nativeName: string;
  flag: string;
  supertext: {
    /** Supertext source codes are bare ("de", not "de-CH"). */
    source: string;
    /** Supertext target codes carry the variant ("de-CH", "en-US", "zh-Hans"). */
    target: string;
  };
  /** ElevenLabs Scribe language code (ISO 639-1). */
  stt: string;
  tts: {
    /** Flash v2.5 is the fast model; v3 covers the languages Flash does not speak. */
    model: TtsModel;
    /** ISO 639-1 code passed as `language_code` to enforce pronunciation (Flash only). */
    languageCode?: string;
  };
  /** Short prompts shown to the person who speaks this language. */
  ui: {
    tapToSpeak: string;
    listening: string;
    translating: string;
  };
}

const flash = (languageCode: string) => ({ model: 'eleven_flash_v2_5' as const, languageCode });
const v3 = { model: 'eleven_v3' as const };

export const LANGUAGES: readonly Language[] = [
  {
    id: 'en-US',
    name: 'English (US)',
    nativeName: 'English (US)',
    flag: '🇺🇸',
    supertext: { source: 'en', target: 'en-US' },
    stt: 'en',
    tts: flash('en'),
    ui: { tapToSpeak: 'Tap the microphone and speak', listening: 'Listening…', translating: 'Translating…' },
  },
  {
    id: 'en-GB',
    name: 'English (UK)',
    nativeName: 'English (UK)',
    flag: '🇬🇧',
    supertext: { source: 'en', target: 'en-GB' },
    stt: 'en',
    tts: flash('en'),
    ui: { tapToSpeak: 'Tap the microphone and speak', listening: 'Listening…', translating: 'Translating…' },
  },
  {
    id: 'de-DE',
    name: 'German',
    nativeName: 'Deutsch',
    flag: '🇩🇪',
    supertext: { source: 'de', target: 'de-DE' },
    stt: 'de',
    tts: flash('de'),
    ui: { tapToSpeak: 'Tippen Sie auf das Mikrofon und sprechen Sie', listening: 'Hört zu…', translating: 'Wird übersetzt…' },
  },
  {
    id: 'de-CH',
    name: 'German (Switzerland)',
    nativeName: 'Deutsch (Schweiz)',
    flag: '🇨🇭',
    supertext: { source: 'de', target: 'de-CH' },
    stt: 'de',
    tts: flash('de'),
    ui: { tapToSpeak: 'Tippen Sie auf das Mikrofon und sprechen Sie', listening: 'Hört zu…', translating: 'Wird übersetzt…' },
  },
  {
    id: 'de-AT',
    name: 'German (Austria)',
    nativeName: 'Deutsch (Österreich)',
    flag: '🇦🇹',
    supertext: { source: 'de', target: 'de-AT' },
    stt: 'de',
    tts: flash('de'),
    ui: { tapToSpeak: 'Tippen Sie auf das Mikrofon und sprechen Sie', listening: 'Hört zu…', translating: 'Wird übersetzt…' },
  },
  {
    id: 'fr-FR',
    name: 'French',
    nativeName: 'Français',
    flag: '🇫🇷',
    supertext: { source: 'fr', target: 'fr-FR' },
    stt: 'fr',
    tts: flash('fr'),
    ui: { tapToSpeak: 'Touchez le micro et parlez', listening: 'Écoute…', translating: 'Traduction…' },
  },
  {
    id: 'fr-CH',
    name: 'French (Switzerland)',
    nativeName: 'Français (Suisse)',
    flag: '🇨🇭',
    supertext: { source: 'fr', target: 'fr-CH' },
    stt: 'fr',
    tts: flash('fr'),
    ui: { tapToSpeak: 'Touchez le micro et parlez', listening: 'Écoute…', translating: 'Traduction…' },
  },
  {
    id: 'it-IT',
    name: 'Italian',
    nativeName: 'Italiano',
    flag: '🇮🇹',
    supertext: { source: 'it', target: 'it-IT' },
    stt: 'it',
    tts: flash('it'),
    ui: { tapToSpeak: 'Tocca il microfono e parla', listening: 'In ascolto…', translating: 'Traduzione…' },
  },
  {
    id: 'it-CH',
    name: 'Italian (Switzerland)',
    nativeName: 'Italiano (Svizzera)',
    flag: '🇨🇭',
    supertext: { source: 'it', target: 'it-CH' },
    stt: 'it',
    tts: flash('it'),
    ui: { tapToSpeak: 'Tocca il microfono e parla', listening: 'In ascolto…', translating: 'Traduzione…' },
  },
  {
    id: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    flag: '🇪🇸',
    supertext: { source: 'es', target: 'es' },
    stt: 'es',
    tts: flash('es'),
    ui: { tapToSpeak: 'Toca el micrófono y habla', listening: 'Escuchando…', translating: 'Traduciendo…' },
  },
  {
    id: 'pt-PT',
    name: 'Portuguese (Portugal)',
    nativeName: 'Português (Portugal)',
    flag: '🇵🇹',
    supertext: { source: 'pt', target: 'pt-PT' },
    stt: 'pt',
    tts: flash('pt'),
    ui: { tapToSpeak: 'Toque no microfone e fale', listening: 'A ouvir…', translating: 'A traduzir…' },
  },
  {
    id: 'pt-BR',
    name: 'Portuguese (Brazil)',
    nativeName: 'Português (Brasil)',
    flag: '🇧🇷',
    supertext: { source: 'pt', target: 'pt-BR' },
    stt: 'pt',
    tts: flash('pt'),
    ui: { tapToSpeak: 'Toque no microfone e fale', listening: 'Ouvindo…', translating: 'Traduzindo…' },
  },
  {
    id: 'nl',
    name: 'Dutch',
    nativeName: 'Nederlands',
    flag: '🇳🇱',
    supertext: { source: 'nl', target: 'nl' },
    stt: 'nl',
    tts: flash('nl'),
    ui: { tapToSpeak: 'Tik op de microfoon en spreek', listening: 'Luistert…', translating: 'Vertalen…' },
  },
  {
    id: 'da',
    name: 'Danish',
    nativeName: 'Dansk',
    flag: '🇩🇰',
    supertext: { source: 'da', target: 'da' },
    stt: 'da',
    tts: flash('da'),
    ui: { tapToSpeak: 'Tryk på mikrofonen og tal', listening: 'Lytter…', translating: 'Oversætter…' },
  },
  {
    id: 'sv',
    name: 'Swedish',
    nativeName: 'Svenska',
    flag: '🇸🇪',
    supertext: { source: 'sv', target: 'sv' },
    stt: 'sv',
    tts: flash('sv'),
    ui: { tapToSpeak: 'Tryck på mikrofonen och prata', listening: 'Lyssnar…', translating: 'Översätter…' },
  },
  {
    id: 'nb',
    name: 'Norwegian',
    nativeName: 'Norsk',
    flag: '🇳🇴',
    supertext: { source: 'nb', target: 'nb' },
    stt: 'no',
    tts: flash('no'),
    ui: { tapToSpeak: 'Trykk på mikrofonen og snakk', listening: 'Lytter…', translating: 'Oversetter…' },
  },
  {
    id: 'fi',
    name: 'Finnish',
    nativeName: 'Suomi',
    flag: '🇫🇮',
    supertext: { source: 'fi', target: 'fi' },
    stt: 'fi',
    tts: flash('fi'),
    ui: { tapToSpeak: 'Napauta mikrofonia ja puhu', listening: 'Kuunnellaan…', translating: 'Käännetään…' },
  },
  {
    id: 'pl',
    name: 'Polish',
    nativeName: 'Polski',
    flag: '🇵🇱',
    supertext: { source: 'pl', target: 'pl' },
    stt: 'pl',
    tts: flash('pl'),
    ui: { tapToSpeak: 'Dotknij mikrofonu i mów', listening: 'Słucham…', translating: 'Tłumaczę…' },
  },
  {
    id: 'cs',
    name: 'Czech',
    nativeName: 'Čeština',
    flag: '🇨🇿',
    supertext: { source: 'cs', target: 'cs' },
    stt: 'cs',
    tts: flash('cs'),
    ui: { tapToSpeak: 'Klepněte na mikrofon a mluvte', listening: 'Poslouchám…', translating: 'Překládám…' },
  },
  {
    id: 'sk',
    name: 'Slovak',
    nativeName: 'Slovenčina',
    flag: '🇸🇰',
    supertext: { source: 'sk', target: 'sk' },
    stt: 'sk',
    tts: flash('sk'),
    ui: { tapToSpeak: 'Ťuknite na mikrofón a hovorte', listening: 'Počúvam…', translating: 'Prekladám…' },
  },
  {
    id: 'hu',
    name: 'Hungarian',
    nativeName: 'Magyar',
    flag: '🇭🇺',
    supertext: { source: 'hu', target: 'hu' },
    stt: 'hu',
    tts: flash('hu'),
    ui: { tapToSpeak: 'Koppintson a mikrofonra, és beszéljen', listening: 'Figyelek…', translating: 'Fordítás…' },
  },
  {
    id: 'hr',
    name: 'Croatian',
    nativeName: 'Hrvatski',
    flag: '🇭🇷',
    supertext: { source: 'hr', target: 'hr' },
    stt: 'hr',
    tts: flash('hr'),
    ui: { tapToSpeak: 'Dodirnite mikrofon i govorite', listening: 'Slušam…', translating: 'Prevodim…' },
  },
  {
    id: 'sl',
    name: 'Slovenian',
    nativeName: 'Slovenščina',
    flag: '🇸🇮',
    supertext: { source: 'sl', target: 'sl' },
    stt: 'sl',
    tts: v3,
    ui: { tapToSpeak: 'Tapnite mikrofon in govorite', listening: 'Poslušam…', translating: 'Prevajam…' },
  },
  {
    id: 'sr-Latn',
    name: 'Serbian (Latin)',
    nativeName: 'Srpski',
    flag: '🇷🇸',
    supertext: { source: 'sr', target: 'sr-Latn' },
    stt: 'sr',
    tts: v3,
    ui: { tapToSpeak: 'Dodirnite mikrofon i govorite', listening: 'Slušam…', translating: 'Prevodim…' },
  },
  {
    id: 'sr-Cyrl',
    name: 'Serbian (Cyrillic)',
    nativeName: 'Српски',
    flag: '🇷🇸',
    supertext: { source: 'sr', target: 'sr-Cyrl' },
    stt: 'sr',
    tts: v3,
    ui: { tapToSpeak: 'Додирните микрофон и говорите', listening: 'Слушам…', translating: 'Преводим…' },
  },
  {
    id: 'sq',
    name: 'Albanian',
    nativeName: 'Shqip',
    flag: '🇦🇱',
    supertext: { source: 'sq', target: 'sq' },
    stt: 'sq',
    tts: v3,
    ui: { tapToSpeak: 'Prekni mikrofonin dhe flisni', listening: 'Po dëgjoj…', translating: 'Po përkthej…' },
  },
  {
    id: 'bg',
    name: 'Bulgarian',
    nativeName: 'Български',
    flag: '🇧🇬',
    supertext: { source: 'bg', target: 'bg' },
    stt: 'bg',
    tts: flash('bg'),
    ui: { tapToSpeak: 'Докоснете микрофона и говорете', listening: 'Слушам…', translating: 'Превеждам…' },
  },
  {
    id: 'el',
    name: 'Greek',
    nativeName: 'Ελληνικά',
    flag: '🇬🇷',
    supertext: { source: 'el', target: 'el' },
    stt: 'el',
    tts: flash('el'),
    ui: { tapToSpeak: 'Πατήστε το μικρόφωνο και μιλήστε', listening: 'Ακούω…', translating: 'Μετάφραση…' },
  },
  {
    id: 'ru',
    name: 'Russian',
    nativeName: 'Русский',
    flag: '🇷🇺',
    supertext: { source: 'ru', target: 'ru' },
    stt: 'ru',
    tts: flash('ru'),
    ui: { tapToSpeak: 'Нажмите на микрофон и говорите', listening: 'Слушаю…', translating: 'Перевожу…' },
  },
  {
    id: 'tr',
    name: 'Turkish',
    nativeName: 'Türkçe',
    flag: '🇹🇷',
    supertext: { source: 'tr', target: 'tr' },
    stt: 'tr',
    tts: flash('tr'),
    ui: { tapToSpeak: 'Mikrofona dokunun ve konuşun', listening: 'Dinleniyor…', translating: 'Çevriliyor…' },
  },
  {
    id: 'ja',
    name: 'Japanese',
    nativeName: '日本語',
    flag: '🇯🇵',
    supertext: { source: 'ja', target: 'ja' },
    stt: 'ja',
    tts: flash('ja'),
    ui: { tapToSpeak: 'マイクをタップして話してください', listening: '聞き取り中…', translating: '翻訳中…' },
  },
  {
    id: 'ko',
    name: 'Korean',
    nativeName: '한국어',
    flag: '🇰🇷',
    supertext: { source: 'ko', target: 'ko' },
    stt: 'ko',
    tts: flash('ko'),
    ui: { tapToSpeak: '마이크를 누르고 말씀하세요', listening: '듣는 중…', translating: '번역 중…' },
  },
  {
    id: 'zh-Hans',
    name: 'Chinese (Simplified)',
    nativeName: '简体中文',
    flag: '🇨🇳',
    supertext: { source: 'zh', target: 'zh-Hans' },
    stt: 'zh',
    tts: flash('zh'),
    ui: { tapToSpeak: '点击麦克风开始说话', listening: '正在聆听…', translating: '正在翻译…' },
  },
  {
    id: 'zh-Hant',
    name: 'Chinese (Traditional)',
    nativeName: '繁體中文',
    flag: '🇹🇼',
    supertext: { source: 'zh', target: 'zh-Hant' },
    stt: 'zh',
    tts: flash('zh'),
    ui: { tapToSpeak: '點一下麥克風開始說話', listening: '正在聆聽…', translating: '正在翻譯…' },
  },
];

const BY_ID = new Map(LANGUAGES.map((language) => [language.id, language]));

export const FALLBACK_LANGUAGE_ID: LanguageId = 'en-US';

export function findLanguage(id: string | null | undefined): Language | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function getLanguage(id: string | null | undefined): Language {
  return findLanguage(id) ?? BY_ID.get(FALLBACK_LANGUAGE_ID)!;
}

/** Languages sorted for display in pickers. */
export function sortedLanguages(): Language[] {
  return [...LANGUAGES].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Maps a BCP-47 device locale ("de-CH", "zh-Hant-TW", "nb-NO", "en-AU") to the closest
 * supported language, or undefined when the language is not supported.
 */
export function matchLocale(tag: string | null | undefined): LanguageId | undefined {
  if (!tag) return undefined;
  const parts = tag.replace(/_/g, '-').split('-');
  const lang = parts[0]?.toLowerCase();
  const rest = parts.slice(1);
  const script = rest.find((p) => p.length === 4)?.toLowerCase();
  const region = rest.find((p) => p.length === 2 || /^\d{3}$/.test(p))?.toUpperCase();

  switch (lang) {
    case 'en':
      return region && ['GB', 'IE', 'AU', 'NZ', 'ZA', 'IN'].includes(region) ? 'en-GB' : 'en-US';
    case 'de':
      return region === 'CH' ? 'de-CH' : region === 'AT' ? 'de-AT' : 'de-DE';
    case 'gsw':
      return 'de-CH';
    case 'fr':
      return region === 'CH' ? 'fr-CH' : 'fr-FR';
    case 'it':
      return region === 'CH' ? 'it-CH' : 'it-IT';
    case 'pt':
      return region === 'BR' ? 'pt-BR' : 'pt-PT';
    case 'zh':
      if (script === 'hant' || (region && ['TW', 'HK', 'MO'].includes(region))) return 'zh-Hant';
      return 'zh-Hans';
    case 'sr':
      return script === 'latn' ? 'sr-Latn' : 'sr-Cyrl';
    case 'no':
    case 'nn':
    case 'nb':
      return 'nb';
    default:
      return lang ? LANGUAGES.find((l) => l.id === lang)?.id : undefined;
  }
}
