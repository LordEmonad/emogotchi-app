/**
 * The social API (/api/social/*, worker/social/): JSON in and out, the session riding in its HttpOnly cookie (the page
 * never sees or stores it). An error is an ApiError carrying the Worker's own sentence, which the UI shows as is.
 */
export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly extra: Record<string, unknown> = {}) { super(message); this.name = 'ApiError'; }
}

const BASE = '/api/social';

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(BASE + path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Emotown could not be reached. Check your connection.');
  }
  let j: Record<string, unknown> | null = null;
  try { j = await r.json() as Record<string, unknown>; } catch { /* not JSON */ }
  if (!r.ok) {
    const { error, ...extra } = j ?? {};
    throw new ApiError(r.status, typeof error === 'string' ? error : r.status >= 500 ? 'Emotown is having a moment. Try again shortly.' : 'That did not work.', extra);
  }
  return (j ?? {}) as T;
}

export const api = {
  get: <T>(path: string) => call<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => call<T>('POST', path, body),
};

/** The websocket URL for a social socket on this origin (ws:// in local dev, wss:// on the site). */
export const socketUrl = (path: string) => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${BASE}${path}`;
