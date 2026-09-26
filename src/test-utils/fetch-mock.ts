export interface RecordedCall {
  url: string;
  init: RequestInit;
  /** Parsed JSON body, or the raw body (e.g. FormData). */
  body: unknown;
}

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

/** Replaces global fetch with a handler and records every call. */
export function mockFetch(handler: Handler): RecordedCall[] {
  const calls: RecordedCall[] = [];
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init, body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body });
    return handler(url, init);
  }) as typeof fetch;
  return calls;
}

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const bodyOf = (init: RequestInit) =>
  (typeof init.body === 'string' ? JSON.parse(init.body) : {}) as Record<string, unknown>;
