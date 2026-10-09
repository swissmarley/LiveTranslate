/**
 * Supertext AI translation — https://api.supertext.com/v1/docs
 * POST /translate/ai/text  { text: string[], source_lang?, target_lang, politeness? }
 *
 * Called by the API route with the server's key, and by the app with the user's own key.
 */

import type { Politeness, TranslateResponse } from '@/lib/api-types';
import { getLanguage, type Language, type LanguageId } from '@/lib/languages';

import { ApiError, describeFailure, readFailure, timeoutSignal, type UpstreamFailure } from './http';

const BASE_URL = 'https://api.supertext.com/v1';
const TIMEOUT_MS = 15_000;
/**
 * All attempts of one translation (fallbacks included) together, so the server answers before
 * the app gives up after 20 s.
 */
const TOTAL_TIMEOUT_MS = 18_000;

const ERROR_CODES = [
  'API_KEY_MALFORMED',
  'API_KEY_INVALID',
  'FEATURE_ERROR',
  'INVALID_TARGET_LANGUAGE',
  'INVALID_SOURCE_LANGUAGE',
  'INVALID_LANGUAGE_PAIR',
  'REQUEST_LIMIT_EXCEEDED',
  'RATE_LIMIT_EXCEEDED',
  'QUEUE_FULL',
] as const;

interface TranslationBody {
  text: string[];
  source_lang?: string;
  target_lang: string;
  politeness?: Exclude<Politeness, 'default'>;
}

type Attempt =
  | { ok: true; data: { translated_text?: unknown; detected_source_lang?: unknown } }
  | ({ ok: false; errorCode: string | null } & UpstreamFailure);

function authHeaders(key: string): Record<string, string> {
  return { Authorization: `Supertext-Auth-Key ${key}`, Accept: 'application/json' };
}

interface Budget {
  deadline: number;
  signal?: AbortSignal;
}

const remaining = (budget: Budget) => Math.min(TIMEOUT_MS, budget.deadline - Date.now());

const timeoutError = () => new ApiError(504, 'upstream_timeout', 'Supertext did not answer in time.');

async function translateOnce(key: string, body: TranslationBody, budget: Budget): Promise<Attempt> {
  if (remaining(budget) <= 0) throw timeoutError();
  const response = await fetch(`${BASE_URL}/translate/ai/text`, {
    method: 'POST',
    headers: { ...authHeaders(key), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: timeoutSignal(remaining(budget), budget.signal),
  }).catch((error: unknown) => {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    throw timedOut ? timeoutError() : new ApiError(504, 'upstream_timeout', 'Could not reach Supertext.');
  });
  if (response.ok) return { ok: true, data: await response.json() };
  const failure = await readFailure(response);
  const errorCode = ERROR_CODES.find((code) => failure.raw.includes(code)) ?? failure.code;
  return { ok: false, errorCode, ...failure };
}

type Failed = Extract<Attempt, { ok: false }>;

const isPolitenessError = (a: Failed) =>
  a.errorCode === 'FEATURE_ERROR' || /politeness/i.test(a.message);

const isTargetError = (a: Failed) =>
  a.errorCode === 'INVALID_TARGET_LANGUAGE' ||
  (a.status === 404 && /target/i.test(a.message));

const isLanguageError = (a: Failed) =>
  (a.errorCode?.startsWith('INVALID_') ?? false) ||
  ([400, 404, 422].includes(a.status) && /lang/i.test(a.message));

const CACHE_MS = 60 * 60_000;

/** Target codes Supertext offers for a source language, via the free GET /features. */
const featureCache = new Map<string, { at: number; targets: string[] }>();

/**
 * Target codes that had to be resolved via /features, so later translations use the working
 * code right away instead of failing first. Keyed by API key, source code and wanted target.
 */
const resolvedTargets = new Map<string, { at: number; code: string }>();

async function supportedTargets(
  key: string,
  source: string | undefined,
  budget: Budget
): Promise<string[]> {
  const cacheKey = `${key}|${source ?? '*'}`;
  const cached = featureCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.targets;
  const query = source ? `?source_lang=${encodeURIComponent(source)}` : '';
  if (remaining(budget) <= 0) return [];
  try {
    const response = await fetch(`${BASE_URL}/features${query}`, {
      headers: authHeaders(key),
      signal: timeoutSignal(remaining(budget), budget.signal),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { supported_features?: { target_lang?: unknown }[] };
    const targets = [
      ...new Set(
        (data.supported_features ?? [])
          .map((feature) => feature?.target_lang)
          .filter((target): target is string => typeof target === 'string')
      ),
    ];
    featureCache.set(cacheKey, { at: Date.now(), targets });
    return targets;
  } catch {
    return [];
  }
}

/** Finds the code Supertext actually uses for a language variant (e.g. "es" vs "es-ES"). */
async function resolveTargetCode(
  key: string,
  source: string | undefined,
  target: Language,
  budget: Budget
): Promise<string | undefined> {
  const targets = await supportedTargets(key, source, budget);
  const wanted = target.supertext.target.toLowerCase();
  const [base, variant] = wanted.split('-');
  const lower = targets.map((t) => t.toLowerCase());
  const index =
    [
      lower.indexOf(wanted),
      variant ? lower.findIndex((t) => t.split('-')[0] === base && t.includes(variant)) : -1,
      lower.findIndex((t) => t.split('-')[0] === base),
    ].find((i) => i >= 0) ?? -1;
  return index >= 0 ? targets[index] : undefined;
}

/** Maps a failure to a fixed message; Supertext's own text only goes into `detail`. */
function toApiError(failure: Failed): ApiError {
  const detail = describeFailure(failure);
  if (failure.status === 401 || failure.status === 403 || failure.errorCode?.startsWith('API_KEY')) {
    return new ApiError(502, 'upstream_auth', 'Supertext rejected the API key.', detail);
  }
  if (failure.status === 429) {
    return new ApiError(429, 'rate_limited', 'Too many translations at once. Please try again.', detail);
  }
  if (failure.status === 503 || failure.errorCode === 'QUEUE_FULL') {
    return new ApiError(503, 'busy', 'Supertext is busy right now. Please try again.', detail);
  }
  if (failure.status === 413) {
    return new ApiError(413, 'text_too_long', 'That is too much text to translate at once.', detail);
  }
  if (isLanguageError(failure)) {
    return new ApiError(400, 'unsupported_language', 'Supertext cannot translate this language pair.', detail);
  }
  return new ApiError(502, 'translation_failed', 'Translation failed. Please try again.', detail);
}

export async function translateText(
  key: string,
  input: {
    text: string;
    source: LanguageId;
    target: LanguageId;
    politeness?: Politeness;
  },
  /** Stops the upstream calls when the caller gives up (the app's request on the server). */
  signal?: AbortSignal
): Promise<TranslateResponse> {
  const budget: Budget = { deadline: Date.now() + TOTAL_TIMEOUT_MS, signal };
  const source = getLanguage(input.source);
  const target = getLanguage(input.target);
  const resolvedKey = `${key}|${source.supertext.source}|${target.supertext.target}`;
  const known = resolvedTargets.get(resolvedKey);
  const body: TranslationBody = {
    text: [input.text],
    source_lang: source.supertext.source,
    target_lang:
      known && Date.now() - known.at < CACHE_MS ? known.code : target.supertext.target,
  };
  if (input.politeness && input.politeness !== 'default') body.politeness = input.politeness;

  let attempt = await translateOnce(key, body, budget);

  // Formality is only available for some language pairs — fall back to the default.
  if (!attempt.ok && body.politeness && isPolitenessError(attempt)) {
    delete body.politeness;
    attempt = await translateOnce(key, body, budget);
  }
  // Unknown target code: ask Supertext which variant code it expects.
  if (!attempt.ok && isTargetError(attempt)) {
    const resolved = await resolveTargetCode(key, body.source_lang, target, budget);
    if (resolved && resolved !== body.target_lang) {
      body.target_lang = resolved;
      attempt = await translateOnce(key, body, budget);
      if (attempt.ok) resolvedTargets.set(resolvedKey, { at: Date.now(), code: resolved });
    }
  }
  // Source code rejected: let Supertext detect the source language.
  if (!attempt.ok && body.source_lang && isLanguageError(attempt)) {
    delete body.source_lang;
    attempt = await translateOnce(key, body, budget);
  }
  if (!attempt.ok) throw toApiError(attempt);

  const translated = Array.isArray(attempt.data.translated_text)
    ? attempt.data.translated_text[0]
    : undefined;
  if (typeof translated !== 'string') {
    throw new ApiError(502, 'bad_upstream_response', 'Supertext returned an unexpected response.');
  }
  const detected = attempt.data.detected_source_lang;
  return {
    translation: translated.trim(),
    detectedSourceLang: typeof detected === 'string' ? detected : null,
  };
}
