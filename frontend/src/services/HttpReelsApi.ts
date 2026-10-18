import type {
  Competitor,
  Reel,
  ReelsApi,
  RemixedReel,
  ServiceResult,
} from '@/types';

// Real implementation of ReelsApi that talks to the FastAPI backend in
// ../backend. Paths and payloads follow ../openapi.yaml.
//
// In dev, Vite proxies /api to the backend (see vite.config.ts), so the default
// base path works without CORS. Set VITE_API_BASE_URL to call a deployed backend.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function request<T>(
  method: Method,
  path: string,
  body?: unknown
): Promise<ServiceResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return {
      data: null,
      error: 'Could not reach the server. Is the backend running on port 8091?',
    };
  }

  if (res.status === 204) return { data: null, error: null };

  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    // FastAPI puts the user-facing message in `detail`. Validation errors use an array.
    const detail = (payload as { detail?: unknown } | null)?.detail;
    const message = typeof detail === 'string' ? detail : `Request failed (${res.status}).`;
    return { data: null, error: message };
  }
  return { data: payload as T, error: null };
}

const enc = encodeURIComponent;

export class HttpReelsApi implements ReelsApi {
  listCompetitors() {
    return request<Competitor[]>('GET', '/competitors');
  }

  addCompetitor(instagramUrl: string) {
    return request<Competitor>('POST', '/competitors', { instagramUrl });
  }

  removeCompetitor(id: string) {
    return request<void>('DELETE', `/competitors/${enc(id)}`);
  }

  fetchReelsForCompetitor(competitorId: string) {
    return request<Reel[]>('POST', `/competitors/${enc(competitorId)}/reels/fetch`);
  }

  listReels() {
    return request<Reel[]>('GET', '/reels');
  }

  getReel(id: string) {
    return request<Reel>('GET', `/reels/${enc(id)}`);
  }

  remixReel(reelId: string) {
    return request<RemixedReel>('POST', `/reels/${enc(reelId)}/remix`);
  }

  getRemix(id: string) {
    return request<RemixedReel>('GET', `/remixes/${enc(id)}`);
  }

  updateRemix(
    id: string,
    patch: Partial<Pick<RemixedReel, 'title' | 'hook' | 'script' | 'cta'>>
  ) {
    return request<RemixedReel>('PATCH', `/remixes/${enc(id)}`, patch);
  }
}
