/**
 * Talks to the app's own API routes (src/app/api), which hold the Supertext and
 * ElevenLabs keys. The phone never sees those keys.
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

export function getServerUrl(): string {
  const custom = useSettings.getState().serverUrl;
  const url = custom.trim() ? trimSlash(custom) : defaultServerUrl();
  if (!url) {
    throw new ApiClientError('No server configured. Add the server URL in Settings.', 'no_server');
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

export const api = {
  health: () => requestJson<HealthResponse>('/api/health', { timeoutMs: 8_000 }),

  translate: (input: TranslateRequest) =>
    requestJson<TranslateResponse>('/api/translate', { method: 'POST', json: input }),

  transcribe: (audio: Uint8Array<ArrayBuffer>, contentType: string, language: LanguageId) =>
    requestJson<TranscribeResponse>(`/api/transcribe?language=${encodeURIComponent(language)}`, {
      method: 'POST',
      body: audio,
      contentType,
      timeoutMs: 45_000,
    }),

  speak: async (input: SpeakRequest): Promise<Uint8Array<ArrayBuffer>> => {
    const response = await request('/api/speak', { method: 'POST', json: input, timeoutMs: 30_000 });
    return new Uint8Array(await response.arrayBuffer());
  },

  voices: () => requestJson<VoicesResponse>('/api/voices', { timeoutMs: 15_000 }),

  sttToken: () =>
    requestJson<SttTokenResponse>('/api/stt-token', { method: 'POST', timeoutMs: 10_000 }),
};

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong.';
}
