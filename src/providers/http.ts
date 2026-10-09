/**
 * Shared by the Supertext and ElevenLabs clients, which run in two places: in the API routes
 * with the server's keys, and in the app with keys the user entered in Settings. Uses
 * web-standard fetch/Response only (Node, Cloudflare Workers and expo/fetch on the phone).
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface UpstreamFailure {
  status: number;
  /** Raw response body (truncated), for matching error codes. */
  raw: string;
  message: string;
  code: string | null;
}

/**
 * Extracts a readable message from upstream error bodies:
 * ElevenLabs `{ detail: { code, message, status } }`, Supertext `{ error_code, message }`.
 */
export async function readFailure(response: Response): Promise<UpstreamFailure> {
  const raw = (await response.text().catch(() => '')).slice(0, 2000);
  let message = raw.slice(0, 300);
  let code: string | null = null;
  try {
    const body = JSON.parse(raw) as Record<string, unknown>;
    const detail = body.detail ?? body.error ?? body;
    if (typeof detail === 'string') {
      message = detail;
    } else if (Array.isArray(detail)) {
      message = detail
        .map((item) => (item && typeof item === 'object' && 'msg' in item ? String(item.msg) : ''))
        .filter(Boolean)
        .join('; ');
    } else if (detail && typeof detail === 'object') {
      const d = detail as Record<string, unknown>;
      const text = d.message ?? d.msg ?? d.error;
      message = typeof text === 'string' ? text : JSON.stringify(d).slice(0, 300);
      const c = d.error_code ?? d.code ?? d.status ?? d.type;
      code = typeof c === 'string' ? c : null;
    }
  } catch {
    // Not JSON — keep the raw text.
  }
  return { status: response.status, raw, message: message || `HTTP ${response.status}`, code };
}

/** Aborts after `ms`, or earlier when `signal` does (e.g. the app gave up on the request). */
export function timeoutSignal(ms: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(Math.max(1, ms));
  if (!signal) return timeout;
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([timeout, signal]) : timeout;
}
