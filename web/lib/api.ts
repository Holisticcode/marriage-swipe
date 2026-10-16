// Tiny API client: same-origin /api, bearer access token, automatic refresh-token rotation.
export type ApiError = { status: number; code: string; message: string; extra?: Record<string, unknown> };

let KEY = 'ms.session';
export function setSessionKey(k: string) { KEY = k; }
type Session = { accessToken: string; refreshToken: string };

export function getSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
export function setSession(s: Session | null) {
  try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch {}
}

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  const s = getSession();
  if (!s) return false;
  refreshing ??= (async () => {
    try {
      const r = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: s.refreshToken }) });
      if (!r.ok) { setSession(null); return false; }
      const d = await r.json();
      setSession({ accessToken: d.accessToken, refreshToken: d.refreshToken });
      return true;
    } catch { return false; } finally { setTimeout(() => (refreshing = null), 0); }
  })();
  return refreshing;
}

export async function api<T = any>(method: string, path: string, body?: unknown, opts: { form?: FormData; auth?: boolean } = {}): Promise<T> {
  const go = async () => {
    const headers: Record<string, string> = {};
    const s = getSession();
    if (s && opts.auth !== false) headers.Authorization = `Bearer ${s.accessToken}`;
    let payload: BodyInit | undefined;
    if (opts.form) payload = opts.form;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    return fetch('/api' + path, { method, headers, body: payload, cache: 'no-store' });
  };
  let res: Response;
  try { res = await go(); } catch { throw { status: 0, code: 'NETWORK', message: 'Could not reach the server. Check your connection.' } as ApiError; }
  if (res.status === 401 && opts.auth !== false && getSession()) {
    if (await refresh()) res = await go();
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    const e = data?.error || {};
    throw { status: res.status, code: e.code || 'ERROR', message: e.message || 'Something went wrong. Please try again.', extra: e } as ApiError;
  }
  return data as T;
}

export const errMsg = (e: unknown) => (e as ApiError)?.message || 'Something went wrong. Please try again.';
export const isApiError = (e: unknown): e is ApiError => !!e && typeof e === 'object' && 'code' in (e as object);

export type Photo = { id: string; kind: 'selfie' | 'extra'; status: string; reason: string | null; url: string };
export type Me = {
  id: string; role: 'user' | 'admin'; email: string | null; phone: string | null; emailVerified: boolean; phoneVerified: boolean;
  requiresEmailVerification: boolean;
  profile: null | { name: string; age: number; gender: string; lookingFor: string; status: string; city: string; bio: string };
  verification: 'none' | 'pending' | 'verified'; photos: Photo[]; limits: { maxExtraPhotos: number };
};
export type Profile = { id: string; name: string; age: number; gender: string; status: string; city: string; bio: string; verified: boolean; sample: boolean; hue: number | null; photos: string[] };
