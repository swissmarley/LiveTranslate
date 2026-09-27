import { findLanguage } from '@/lib/languages';
import { transcribe } from '@/providers/elevenlabs';
import { ApiError, env, route } from '@/server/http';

const MIN_BYTES = 1_000;
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Body: the raw recording (audio/mp4 from phones, audio/webm from browsers).
 * Query: ?language=<LanguageId> — the language the speaker is expected to use.
 */
export const POST = route(async (request) => {
  const language = new URL(request.url).searchParams.get('language') ?? undefined;
  if (language && !findLanguage(language)) {
    throw new ApiError(400, 'unsupported_language', `Unknown language "${language}".`);
  }
  const audio = await request.arrayBuffer();
  if (audio.byteLength < MIN_BYTES) {
    throw new ApiError(400, 'audio_too_short', 'The recording is too short.');
  }
  if (audio.byteLength > MAX_BYTES) {
    throw new ApiError(413, 'audio_too_long', 'The recording is too long.');
  }
  const type = request.headers.get('content-type') ?? 'audio/mp4';
  const result = await transcribe(env.elevenLabsKey(), new Uint8Array(audio), type, language);
  return Response.json(result);
});
