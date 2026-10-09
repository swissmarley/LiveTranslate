/** Request/response shapes of the app's own API routes (src/app/api). */

import type { LanguageId } from './languages';

/** Supertext politeness: "more" = formal (Sie/vous/usted), "less" = informal. */
export type Politeness = 'default' | 'more' | 'less';

/** Longest text /api/translate accepts. */
export const MAX_TRANSLATE_CHARS = 5_000;
/** Longest text /api/speak accepts in one request; the app splits longer translations. */
export const MAX_SPEAK_CHARS = 2_500;

export interface TranslateRequest {
  text: string;
  source: LanguageId;
  target: LanguageId;
  politeness?: Politeness;
}

export interface TranslateResponse {
  translation: string;
  detectedSourceLang: string | null;
}

export interface TranscribeResponse {
  text: string;
  languageCode: string | null;
}

export interface SpeakRequest {
  text: string;
  language: LanguageId;
  voiceId?: string;
  /** 0.7 – 1.2, applied by the Flash model only. */
  speed?: number;
}

export interface Voice {
  id: string;
  name: string;
  gender: string | null;
  accent: string | null;
  description: string | null;
  category: string | null;
  previewUrl: string | null;
}

export interface VoicesResponse {
  voices: Voice[];
  defaultVoiceId: string | null;
}

export interface SttTokenResponse {
  token: string;
  /** Epoch ms after which the token must not be used. */
  expiresAt: number;
}

export interface HealthResponse {
  ok: true;
  supertext: boolean;
  elevenlabs: boolean;
  /** Whether the server requires the x-app-token header. */
  accessTokenRequired: boolean;
  /** Whether the request carried a valid token (always true when none is required). */
  authorized: boolean;
  /** A setup problem on the server that stops every request (e.g. a missing APP_ACCESS_TOKEN). */
  problem?: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
