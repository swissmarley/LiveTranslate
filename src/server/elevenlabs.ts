/**
 * ElevenLabs speech APIs — https://elevenlabs.io/docs/api-reference
 * - Scribe v2 batch speech-to-text (fallback when live streaming is unavailable)
 * - Single-use tokens so the phone can open the Scribe v2 Realtime WebSocket directly
 * - Text-to-speech (Flash v2.5, or v3 for languages Flash does not speak)
 */

import type { SttTokenResponse, TranscribeResponse, Voice } from '@/lib/api-types';
import { findLanguage, getLanguage, type LanguageId } from '@/lib/languages';

import { ApiError, env, readFailure, type UpstreamFailure } from './http';

const BASE_URL = 'https://api.elevenlabs.io';
const STT_MODEL = 'scribe_v2';
const TTS_OUTPUT_FORMAT = 'mp3_44100_64';

async function call(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('xi-api-key', env.elevenLabsKey());
  try {
    return await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
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

function toApiError(service: string, failure: UpstreamFailure): ApiError {
  const code = `${failure.code ?? ''} ${failure.raw}`.toLowerCase();
  // Checked before 401: ElevenLabs reports an exhausted quota as HTTP 401 too.
  if (code.includes('quota_exceeded') || failure.status === 402) {
    return new ApiError(402, 'quota_exceeded', 'Your ElevenLabs quota is used up.');
  }
  // Also HTTP 401, e.g. "…missing the permission voices_read to execute this operation."
  if (code.includes('missing_permissions') || failure.status === 403) {
    const permission = /permission (\w+)/i.exec(failure.message)?.[1];
    return new ApiError(
      502,
      'upstream_permissions',
      permission
        ? `The ElevenLabs API key needs the "${permission}" permission (edit the key under API keys at elevenlabs.io).`
        : `The ElevenLabs API key is not allowed to use ${service.toLowerCase()}.`
    );
  }
  if (failure.status === 401 || code.includes('invalid_api_key')) {
    return new ApiError(
      502,
      'upstream_auth',
      'ElevenLabs rejected the API key. Check ELEVENLABS_API_KEY on the server.'
    );
  }
  if (failure.status === 429) {
    return new ApiError(429, 'rate_limited', 'ElevenLabs is busy right now. Please try again.');
  }
  return new ApiError(502, 'upstream_error', `${service} failed: ${failure.message}`);
}

const isClientError = (f: UpstreamFailure) => f.status === 400 || f.status === 422;
const mentionsLanguage = (f: UpstreamFailure) => /language/i.test(f.raw);
const isVoiceMissing = (f: UpstreamFailure) =>
  /voice_not_found|voice.*(not found|does not exist)/i.test(f.raw);

export async function transcribe(
  audio: Blob,
  languageId: LanguageId | undefined
): Promise<TranscribeResponse> {
  const language = findLanguage(languageId);
  const type = audio.type;
  const extension = type.includes('webm')
    ? 'webm'
    : type.includes('wav')
      ? 'wav'
      : type.includes('mpeg')
        ? 'mp3'
        : 'm4a';

  const send = (withLanguage: boolean) => {
    const form = new FormData();
    form.append('model_id', STT_MODEL);
    form.append('file', audio, `speech.${extension}`);
    form.append('tag_audio_events', 'false');
    if (withLanguage && language) form.append('language_code', language.stt);
    return call('/v1/speech-to-text', { method: 'POST', body: form }, 60_000);
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

export async function createRealtimeSttToken(): Promise<SttTokenResponse> {
  const response = await call('/v1/single-use-token/realtime_scribe', { method: 'POST' }, 10_000);
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

export async function listVoices(): Promise<Voice[]> {
  const response = await call('/v2/voices?page_size=100', {}, 15_000);
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

let cachedDefaultVoice: { id: string; at: number } | null = null;

export async function getDefaultVoiceId(): Promise<string> {
  const configured = env.defaultVoiceId();
  if (configured) return configured;
  if (cachedDefaultVoice && Date.now() - cachedDefaultVoice.at < 30 * 60_000) {
    return cachedDefaultVoice.id;
  }
  const voices = await listVoices();
  const voice = voices.find((v) => v.category === 'premade') ?? voices[0];
  if (!voice) {
    throw new ApiError(
      503,
      'no_voices',
      'Your ElevenLabs account has no voices. Add one under "My Voices" or set ELEVENLABS_VOICE_ID.'
    );
  }
  cachedDefaultVoice = { id: voice.id, at: Date.now() };
  return voice.id;
}

/** Returns a streaming audio/mpeg response for the given text. */
export async function synthesize(input: {
  text: string;
  languageId: LanguageId;
  voiceId?: string;
  speed?: number;
}): Promise<Response> {
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
  let voiceId = requestedVoice ?? (await getDefaultVoiceId());
  let usingDefaultVoice = !requestedVoice;

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await call(
      `/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${TTS_OUTPUT_FORMAT}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify(body),
      }
    );
    if (response.ok) {
      return new Response(response.body, {
        headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
      });
    }
    const failure = await readFailure(response);
    if (body.language_code && isClientError(failure) && mentionsLanguage(failure)) {
      // The model does not accept this language code — let it infer the language.
      delete body.language_code;
      continue;
    }
    if (!usingDefaultVoice && isVoiceMissing(failure)) {
      // The saved voice was removed from the account — use the default one.
      voiceId = await getDefaultVoiceId();
      usingDefaultVoice = true;
      continue;
    }
    throw toApiError('Speech synthesis', failure);
  }
  throw new ApiError(502, 'upstream_error', 'Speech synthesis failed.');
}
