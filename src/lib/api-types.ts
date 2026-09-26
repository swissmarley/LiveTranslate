/** Request/response shapes of the app's own API routes (src/app/api). */

import type { LanguageId } from './languages';

/** Supertext politeness: "more" = formal (Sie/vous/usted), "less" = informal. */
export type Politeness = 'default' | 'more' | 'less';

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
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
