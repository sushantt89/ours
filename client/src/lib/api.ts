import type { Session } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
  /** True when the request never reached the server. */
  get offline() {
    return this.status === 0;
  }
}

let accessToken: string | null = null;
let onSession: ((session: (Session & { accessToken: string }) | null) => void) | null = null;

export const getAccessToken = () => accessToken;
export const setAccessToken = (token: string | null) => (accessToken = token);
/** Lets the auth store hear about refreshed or expired sessions without a circular import. */
export const onSessionChange = (handler: typeof onSession) => (onSession = handler);

async function parse(res: Response) {
  if (res.status === 204) return undefined;
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(err?.message ?? 'Something went wrong. Please try again.', res.status, err?.code, err?.fields);
  }
  return data;
}

async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`/api${path}`, { credentials: 'include', ...init });
  } catch {
    throw new ApiError("You're offline. We'll be here when you're back.", 0, 'offline');
  }
}

let refreshing: Promise<boolean> | null = null;

/** Swaps the httpOnly refresh cookie for a new access token. Shared by concurrent callers. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await send('/auth/refresh', { method: 'POST', headers: { 'X-Requested-With': 'ours' } });
      const data = await parse(res);
      accessToken = data.accessToken;
      onSession?.(data);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.offline) throw err;
      accessToken = null;
      onSession?.(null);
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

interface Options {
  method?: string;
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
}

export async function api<T = any>(path: string, opts: Options = {}): Promise<T> {
  const build = (): RequestInit => {
    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    let body: BodyInit | undefined;
    if (opts.form) body = opts.form;
    else if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    return { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body, signal: opts.signal };
  };

  let res = await send(path, build());
  // An expired access token is renewed once, transparently, and the request retried.
  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (await refreshSession()) res = await send(path, build());
  }
  return parse(res);
}

export const get = <T = any>(path: string, signal?: AbortSignal) => api<T>(path, { signal });
export const post = <T = any>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body ?? {} });
export const patch = <T = any>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body });
export const put = <T = any>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body });
export const del = <T = any>(path: string, body?: unknown) => api<T>(path, { method: 'DELETE', body });
export const upload = <T = any>(path: string, form: FormData) => api<T>(path, { method: 'POST', form });

export const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Something went wrong. Please try again.';
