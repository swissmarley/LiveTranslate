/**
 * Reaches Supertext and ElevenLabs. A service with the user's own key (Settings → API keys) is
 * called directly from the phone; any other goes through the app's API routes (src/app/api),
 * which hold the server's keys. The phone never sees the server's keys.
 */

import Constants from 'expo-constants';
import { fetch } from 'expo/fetch';
import { Platform } from 'react-native';

import type {
  ApiErrorBody,
  HealthResponse,
  SpeakRequest,
  SttTokenResponse,
  TranscribeResponse,
  TranslateRequest,
  TranslateResponse,
  VoicesResponse,
} from '@/lib/api-types';
import type { LanguageId } from '@/lib/languages';
import * as elevenlabs from '@/providers/elevenlabs';
import { ApiError } from '@/providers/http';
import * as supertext from '@/providers/supertext';
import { ownKey, SERVICE_NAMES, type KeyService } from '@/store/api-keys';
import { useSettings } from '@/store/settings';

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(message: string, code: string, status: number | null = null) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
  }
}

const trimSlash = (url: string) => url.trim().replace(/\/+$/, '');

/** The server used when Settings has no override. */
export function defaultServerUrl(): string | null {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured?.trim()) return trimSlash(configured);
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  // In development the dev server that serves the JS bundle also serves the API routes.
  const hostUri = Constants.expoConfig?.hostUri;
  if (__DEV__ && hostUri) {
    const host = hostUri.replace(/\/.*$/, '');
    const secure = /\.exp\.direct$|ngrok/i.test(host);
    return `${secure ? 'https' : 'http'}://${host}`;
  }
  return null;
}

function configuredServerUrl(): string | null {
  const custom = useSettings.getState().serverUrl;
  return custom.trim() ? trimSlash(custom) : defaultServerUrl();
}

export function getServerUrl(): string {
  const url = configuredServerUrl();
  if (!url) {
    throw new ApiClientError('Add your API keys (or a server URL) in Settings.', 'no_server');
  }
  return url;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  json?: unknown;
  body?: Uint8Array<ArrayBuffer>;
  contentType?: string;
  timeoutMs?: number;
}

async function request(path: string, options: RequestOptions = {}) {
  const { method = 'GET', json, body, contentType, timeoutMs = 20_000 } = options;
  const url = `${getServerUrl()}${path}`;
  const headers: Record<string, string> = {};
  const appToken = process.env.EXPO_PUBLIC_APP_TOKEN;
  if (appToken) headers['x-app-token'] = appToken;

  let payload: string | Uint8Array<ArrayBuffer> | undefined;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(json);
  } else if (body) {
    headers['Content-Type'] = contentType ?? 'application/octet-stream';
    payload = body;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetch(url, { method, headers, body: payload, signal: controller.signal });
    } catch {
      throw controller.signal.aborted
        ? new ApiClientError('The server took too long to answer.', 'timeout')
        : new ApiClientError(
            `Cannot reach the server (${getServerUrl()}). Check your connection.`,
            'network'
          );
    }
    if (!response.ok) {
      let message = `Server error (${response.status}).`;
      let code = 'http_error';
      try {
        const data = (await response.json()) as Partial<ApiErrorBody>;
        if (data.error?.message) message = data.error.message;
        if (data.error?.code) code = data.error.code;
      } catch {
        // not JSON
      }
      throw new ApiClientError(message, code, response.status);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function requestJson<T>(path: string, options?: RequestOptions): Promise<T> {
  const response = await request(path, options);
  return (await response.json()) as T;
}

/** Calls a provider with the user's own key; errors look like the server's. */
async function direct<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const message =
      error.code === 'upstream_auth' ? `${error.message} Check it in Settings.` : error.message;
    throw new ApiClientError(message, error.code, error.status);
  }
}

async function ownVoices(key: string): Promise<VoicesResponse> {
  const voices = await elevenlabs.listVoices(key);
  const defaultVoiceId =
    voices.length > 0 ? await elevenlabs.getDefaultVoiceId(key).catch(() => null) : null;
  return { voices, defaultVoiceId };
}

export const api = {
  /** Whether each service is covered, by the user's own key or else by the server. */
  health: async (): Promise<HealthResponse> => {
    const missing = (['supertext', 'elevenlabs'] as const).filter((service) => !ownKey(service));
    if (missing.length === 0) {
      return { ok: true, supertext: true, elevenlabs: true, accessTokenRequired: false, authorized: true };
    }
    if (!configuredServerUrl()) {
      const names = missing.map((service) => SERVICE_NAMES[service]).join(' and ');
      const keys = missing.length > 1 ? 'keys' : 'key';
      throw new ApiClientError(`Add your ${names} API ${keys} in Settings.`, 'no_server');
    }
    const server = await requestJson<HealthResponse>('/api/health', { timeoutMs: 8_000 });
    return {
      ...server,
      supertext: server.supertext || !missing.includes('supertext'),
      elevenlabs: server.elevenlabs || !missing.includes('elevenlabs'),
    };
  },

  translate: (input: TranslateRequest) => {
    const key = ownKey('supertext');
    return key
      ? direct(() => supertext.translateText(key, input))
      : requestJson<TranslateResponse>('/api/translate', { method: 'POST', json: input });
  },

  transcribe: (audio: Uint8Array<ArrayBuffer>, contentType: string, language: LanguageId) => {
    const key = ownKey('elevenlabs');
    return key
      ? direct(() => elevenlabs.transcribe(key, audio, contentType, language))
      : requestJson<TranscribeResponse>(`/api/transcribe?language=${encodeURIComponent(language)}`, {
          method: 'POST',
          body: audio,
          contentType,
          timeoutMs: 45_000,
        });
  },

  speak: async (input: SpeakRequest): Promise<Uint8Array<ArrayBuffer>> => {
    const key = ownKey('elevenlabs');
    const response = key
      ? await direct(() =>
          elevenlabs.synthesize(key, {
            text: input.text,
            languageId: input.language,
            voiceId: input.voiceId,
            speed: input.speed,
          })
        )
      : await request('/api/speak', { method: 'POST', json: input, timeoutMs: 30_000 });
    return new Uint8Array(await response.arrayBuffer());
  },

  voices: () => {
    const key = ownKey('elevenlabs');
    return key
      ? direct(() => ownVoices(key))
      : requestJson<VoicesResponse>('/api/voices', { timeoutMs: 15_000 });
  },

  sttToken: () => {
    const key = ownKey('elevenlabs');
    return key
      ? direct(() => elevenlabs.createRealtimeSttToken(key))
      : requestJson<SttTokenResponse>('/api/stt-token', { method: 'POST', timeoutMs: 10_000 });
  },
};

/**
 * Tries a key the user just entered with small real requests, so Settings can say right away
 * whether it works: a one-word translation for Supertext; for ElevenLabs the voice list and a
 * live-recognition token (both free), which need the key's Voices and Speech to Text access.
 */
export async function checkOwnKey(service: KeyService, key: string): Promise<void> {
  if (service === 'supertext') {
    await direct(() => supertext.translateText(key, { text: 'Hello', source: 'en-US', target: 'de-DE' }));
  } else {
    await direct(() => elevenlabs.listVoices(key));
    await direct(() => elevenlabs.createRealtimeSttToken(key));
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong.';
}
