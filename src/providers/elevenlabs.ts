/**
 * ElevenLabs speech APIs — https://elevenlabs.io/docs/api-reference
 * - Scribe v2 batch speech-to-text (fallback when live streaming is unavailable)
 * - Single-use tokens so the phone can open the Scribe v2 Realtime WebSocket directly
 * - Text-to-speech (Flash v2.5, or v3 for languages Flash does not speak)
 *
 * Called by the API routes with the server's key, and by the app with the user's own key.
 */

import type { SttTokenResponse, TranscribeResponse, Voice } from '@/lib/api-types';
import { findLanguage, getLanguage, type LanguageId } from '@/lib/languages';

import { ApiError, describeFailure, readFailure, timeoutSignal, type UpstreamFailure } from './http';

const BASE_URL = 'https://api.elevenlabs.io';
const STT_MODEL = 'scribe_v2';
const TTS_OUTPUT_FORMAT = 'mp3_44100_64';

async function call(
  key: string,
  path: string,
  init: RequestInit = {},
  timeoutMs = 30_000
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('xi-api-key', key);
  try {
    return await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers,
      signal: timeoutSignal(timeoutMs, init.signal ?? undefined),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    throw new ApiError(
      504,
      'upstream_timeout',
      timedOut ? 'ElevenLabs did not answer in time.' : 'Could not reach ElevenLabs.'
    );
  }
}

/** Permissions an ElevenLabs key can lack; only these names are repeated to the user. */
const KNOWN_PERMISSIONS = new Set(['text_to_speech', 'speech_to_text', 'voices_read', 'models_read', 'user_read']);

/** Maps a failure to a fixed message; the provider's own text only goes into `detail`. */
function toApiError(service: string, failure: UpstreamFailure): ApiError {
  const code = `${failure.code ?? ''} ${failure.raw}`.toLowerCase();
  const detail = describeFailure(failure);
  // Checked before 401: ElevenLabs reports an exhausted quota as HTTP 401 too.
  if (code.includes('quota_exceeded') || failure.status === 402) {
    return new ApiError(402, 'quota_exceeded', 'Your ElevenLabs quota is used up.', detail);
  }
  // Also HTTP 401, e.g. "…missing the permission voices_read to execute this operation."
  if (code.includes('missing_permissions') || failure.status === 403) {
    const permission = /permission (\w+)/i.exec(failure.message)?.[1]?.toLowerCase();
    return new ApiError(
      502,
      'upstream_permissions',
      permission && KNOWN_PERMISSIONS.has(permission)
        ? `The ElevenLabs API key needs the "${permission}" permission (edit the key under API keys at elevenlabs.io).`
        : `The ElevenLabs API key is not allowed to use ${service.toLowerCase()}.`,
      detail
    );
  }
  if (failure.status === 401 || code.includes('invalid_api_key')) {
    return new ApiError(502, 'upstream_auth', 'ElevenLabs rejected the API key.', detail);
  }
  if (failure.status === 429) {
    return new ApiError(429, 'rate_limited', 'ElevenLabs is busy right now. Please try again.', detail);
  }
  return new ApiError(502, 'upstream_error', `${service} failed. Please try again.`, detail);
}

const isClientError = (f: UpstreamFailure) => f.status === 400 || f.status === 422;
const mentionsLanguage = (f: UpstreamFailure) => /language/i.test(f.raw);
const isVoiceMissing = (f: UpstreamFailure) =>
  /voice_not_found|voice.*(not found|does not exist)/i.test(f.raw);

/**
 * Builds a multipart/form-data body by hand: React Native's Blob cannot wrap raw bytes, so
 * FormData is not an option on the phone.
 */
function multipartBody(
  fields: [name: string, value: string][],
  file: { field: string; filename: string; type: string; bytes: Uint8Array }
): { body: Uint8Array<ArrayBuffer>; contentType: string } {
  const boundary = `LiveTranslate${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  const encoder = new TextEncoder();
  const head =
    fields
      .map(([name, value]) => `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`)
      .join('') +
    `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\n` +
    `Content-Type: ${file.type}\r\n\r\n`;
  const parts = [encoder.encode(head), file.bytes, encoder.encode(`\r\n--${boundary}--\r\n`)];
  const body = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.length;
  }
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

export async function transcribe(
  key: string,
  audio: Uint8Array,
  type: string,
  languageId: LanguageId | undefined,
  signal?: AbortSignal
): Promise<TranscribeResponse> {
  const language = findLanguage(languageId);
  const extension = type.includes('webm')
    ? 'webm'
    : type.includes('wav')
      ? 'wav'
      : type.includes('mpeg')
        ? 'mp3'
        : 'm4a';

  const send = (withLanguage: boolean) => {
    const fields: [string, string][] = [
      ['model_id', STT_MODEL],
      ['tag_audio_events', 'false'],
    ];
    if (withLanguage && language) fields.push(['language_code', language.stt]);
    const { body, contentType } = multipartBody(fields, {
      field: 'file',
      filename: `speech.${extension}`,
      type: type || 'application/octet-stream',
      bytes: audio,
    });
    return call(
      key,
      '/v1/speech-to-text',
      { method: 'POST', headers: { 'Content-Type': contentType }, body, signal },
      60_000
    );
  };

  let response = await send(true);
  if (!response.ok) {
    const failure = await readFailure(response);
    // An unsupported language hint should not block transcription — auto-detect instead.
    if (!(language && isClientError(failure) && mentionsLanguage(failure))) {
      throw toApiError('Speech recognition', failure);
    }
    response = await send(false);
    if (!response.ok) throw toApiError('Speech recognition', await readFailure(response));
  }
  const data = (await response.json()) as { text?: unknown; language_code?: unknown };
  return {
    text: typeof data.text === 'string' ? data.text.trim() : '',
    languageCode: typeof data.language_code === 'string' ? data.language_code : null,
  };
}

export async function createRealtimeSttToken(key: string): Promise<SttTokenResponse> {
  const response = await call(key, '/v1/single-use-token/realtime_scribe', { method: 'POST' }, 10_000);
  if (!response.ok) throw toApiError('Starting live speech recognition', await readFailure(response));
  const data = (await response.json()) as { token?: unknown };
  if (typeof data.token !== 'string') {
    throw new ApiError(502, 'bad_upstream_response', 'ElevenLabs returned no token.');
  }
  // Tokens are valid for 15 minutes; keep a safety margin.
  return { token: data.token, expiresAt: Date.now() + 14 * 60_000 };
}

interface RawVoice {
  voice_id?: unknown;
  name?: unknown;
  category?: unknown;
  description?: unknown;
  preview_url?: unknown;
  labels?: Record<string, unknown> | null;
}

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

export async function listVoices(key: string): Promise<Voice[]> {
  const response = await call(key, '/v2/voices?page_size=100', {}, 15_000);
  if (!response.ok) throw toApiError('Loading voices', await readFailure(response));
  const data = (await response.json()) as { voices?: RawVoice[] };
  return (data.voices ?? []).flatMap((voice): Voice[] => {
    const id = str(voice.voice_id);
    if (!id) return [];
    const labels = voice.labels ?? {};
    return [
      {
        id,
        name: str(voice.name) ?? 'Unnamed voice',
        gender: str(labels.gender),
        accent: str(labels.accent),
        description: str(labels.descriptive) ?? str(labels.description) ?? str(voice.description),
        category: str(voice.category),
        previewUrl: str(voice.preview_url),
      },
    ];
  });
}

let cachedDefaultVoice: { key: string; id: string; at: number } | null = null;

/** The account's first premade voice, else its first voice. */
export function pickDefaultVoice(voices: Voice[]): Voice | undefined {
  return voices.find((v) => v.category === 'premade') ?? voices[0];
}

/** The configured voice (ELEVENLABS_VOICE_ID on the server), else the account's first premade one. */
export async function getDefaultVoiceId(key: string, configured?: string | null): Promise<string> {
  if (configured) return configured;
  if (
    cachedDefaultVoice?.key === key &&
    Date.now() - cachedDefaultVoice.at < 30 * 60_000
  ) {
    return cachedDefaultVoice.id;
  }
  const voice = pickDefaultVoice(await listVoices(key));
  if (!voice) {
    throw new ApiError(
      503,
      'no_voices',
      'Your ElevenLabs account has no voices. Add one under "My Voices" at elevenlabs.io.'
    );
  }
  cachedDefaultVoice = { key, id: voice.id, at: Date.now() };
  return voice.id;
}

/** Returns ElevenLabs' (successful) audio/mpeg response for the given text. */
export async function synthesize(
  key: string,
  input: {
    text: string;
    languageId: LanguageId;
    voiceId?: string;
    speed?: number;
    /** Used when no voice is given or the given one is gone (ELEVENLABS_VOICE_ID). */
    defaultVoiceId?: string | null;
  },
  /** Stops the upstream call when the caller gives up (the app's request on the server). */
  signal?: AbortSignal
): Promise<Response> {
  const language = getLanguage(input.languageId);
  const body: Record<string, unknown> = { text: input.text, model_id: language.tts.model };
  if (language.tts.languageCode) body.language_code = language.tts.languageCode;
  if (
    language.tts.model === 'eleven_flash_v2_5' &&
    input.speed !== undefined &&
    Math.abs(input.speed - 1) > 0.01
  ) {
    body.voice_settings = { speed: Math.min(1.2, Math.max(0.7, input.speed)) };
  }

  const requestedVoice = input.voiceId?.trim() || null;
  let voiceId = requestedVoice ?? (await getDefaultVoiceId(key, input.defaultVoiceId));
  let usingDefaultVoice = !requestedVoice;

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await call(
      key,
      `/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${TTS_OUTPUT_FORMAT}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify(body),
        signal,
      }
    );
    if (response.ok) return response;
    const failure = await readFailure(response);
    if (body.language_code && isClientError(failure) && mentionsLanguage(failure)) {
      // The model does not accept this language code — let it infer the language.
      delete body.language_code;
      continue;
    }
    if (!usingDefaultVoice && isVoiceMissing(failure)) {
      // The saved voice was removed from the account — use the default one.
      voiceId = await getDefaultVoiceId(key, input.defaultVoiceId);
      usingDefaultVoice = true;
      continue;
    }
    throw toApiError('Speech synthesis', failure);
  }
  throw new ApiError(502, 'upstream_error', 'Speech synthesis failed.');
}
