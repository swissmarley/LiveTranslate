import type { SpeakRequest } from '@/lib/api-types';
import { findLanguage } from '@/lib/languages';
import { synthesize } from '@/providers/elevenlabs';
import { ApiError, env, readJson, route } from '@/server/http';

const MAX_CHARS = 2_500;

/** Returns audio/mpeg for the given text, spoken in the given language. */
export const POST = route(async (request) => {
  const body = await readJson<SpeakRequest>(request);
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) throw new ApiError(400, 'invalid_request', '"text" is required.');
  if (text.length > MAX_CHARS) {
    throw new ApiError(413, 'text_too_long', 'That is too much text to read aloud at once.');
  }
  if (!findLanguage(body.language)) {
    throw new ApiError(400, 'unsupported_language', 'Unknown language.');
  }
  const audio = await synthesize(env.elevenLabsKey(), {
    text,
    languageId: body.language!,
    voiceId: typeof body.voiceId === 'string' ? body.voiceId : undefined,
    speed: typeof body.speed === 'number' ? body.speed : undefined,
    defaultVoiceId: env.defaultVoiceId(),
  });
  return new Response(audio.body, {
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
  });
});
