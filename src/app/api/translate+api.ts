import type { TranslateRequest } from '@/lib/api-types';
import { findLanguage } from '@/lib/languages';
import { ApiError, readJson, route } from '@/server/http';
import { translateText } from '@/server/supertext';

const MAX_CHARS = 5_000;
const POLITENESS = ['default', 'more', 'less'] as const;

export const POST = route(async (request) => {
  const body = await readJson<TranslateRequest>(request);
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) throw new ApiError(400, 'invalid_request', '"text" is required.');
  if (text.length > MAX_CHARS) {
    throw new ApiError(413, 'text_too_long', 'That is too much text to translate at once.');
  }
  if (!findLanguage(body.source) || !findLanguage(body.target)) {
    throw new ApiError(400, 'unsupported_language', 'Unknown source or target language.');
  }
  const politeness = POLITENESS.find((p) => p === body.politeness) ?? 'default';
  const result = await translateText({
    text,
    source: body.source!,
    target: body.target!,
    politeness,
  });
  return Response.json(result);
});
