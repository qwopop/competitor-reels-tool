import type {
  Competitor,
  ContentPlanItem,
  PlanStatus,
  Reel,
  ReelsApi,
  RemixedReel,
  RemixTemplate,
  ServiceResult,
} from '@/types';

// Real implementation of ReelsApi that talks to the FastAPI backend in
// ../backend. Paths and payloads follow ../openapi.yaml.
//
// In dev, Vite proxies /api to the backend (see vite.config.ts), so the default
// base path works without CORS. Set VITE_API_BASE_URL to call a deployed backend.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

const UNREACHABLE = 'Could not reach the server. Check that the backend is running.';

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
      error: UNREACHABLE,
    };
  }

  if (res.status === 204) return { data: null, error: null };

  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    // FastAPI puts the user-facing message in `detail`. Validation errors use an array.
    const detail = (payload as { detail?: unknown } | null)?.detail;
    // A proxy answers 500/502/503/504 with no JSON body when the API is down.
    const serverDown = [500, 502, 503, 504].includes(res.status);
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? validationMessage(detail)
          : serverDown
          ? UNREACHABLE
          : `Request failed (${res.status}).`;
    return { data: null, error: message };
  }
  return { data: payload as T, error: null };
}

// FastAPI sends validation problems as a list. Say which field and what is wrong.
function validationMessage(detail: unknown[]): string {
  const first = detail[0] as
    | { type?: string; loc?: unknown[]; msg?: string; ctx?: { max_length?: number } }
    | undefined;
  if (!first) return 'Some of the information is not valid.';
  const field = String(first.loc?.[first.loc.length - 1] ?? 'value');
  if (first.type === 'string_too_long' && first.ctx?.max_length) {
    return `The ${field} is too long (at most ${first.ctx.max_length} characters).`;
  }
  return first.msg ?? 'Some of the information is not valid.';
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

  remixReel(reelId: string, template?: RemixTemplate) {
    return request<RemixedReel>(
      'POST',
      `/reels/${enc(reelId)}/remix`,
      template ? { template } : undefined
    );
  }

  listRemixes() {
    return request<RemixedReel[]>('GET', '/remixes');
  }

  getRemixForReel(reelId: string) {
    return request<RemixedReel>('GET', `/reels/${enc(reelId)}/remix/current`);
  }

  applyRemixTemplate(id: string, template: RemixTemplate) {
    return request<RemixedReel>('POST', `/remixes/${enc(id)}/apply-template`, { template });
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

  listContentPlan() {
    return request<ContentPlanItem[]>('GET', '/content-plan');
  }

  addToContentPlan(reelId: string) {
    return request<ContentPlanItem>('POST', '/content-plan', { reelId });
  }

  updateContentPlanStatus(id: string, status: PlanStatus) {
    return request<ContentPlanItem>('PATCH', `/content-plan/${enc(id)}`, { status });
  }

  removeFromContentPlan(id: string) {
    return request<void>('DELETE', `/content-plan/${enc(id)}`);
  }
}
