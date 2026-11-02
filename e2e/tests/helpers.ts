// Shared setup for the end-to-end tests. Setup goes through the API (fast and
// exact); what a test checks goes through the UI, the way a user sees it.
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

export interface Competitor {
  id: string;
  username: string;
  displayName: string;
}
export interface Video {
  id: string;
  caption: string;
  viewCount: number;
  likeCount: number;
  competitorUsername: string;
}
export interface PlanItem {
  id: string;
  videoId: string;
  caption: string;
  status: string;
}

// A handle no other test or earlier run uses (YouTube handles: 3-30 characters).
export function uniqueHandle(prefix: string): string {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return `${prefix}-${stamp}`.toLowerCase().slice(0, 30);
}

async function ok<T>(res: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return res.status() === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  addCompetitor: (r: APIRequestContext, handle: string) =>
    r.post('/api/competitors', { data: { channelUrl: `@${handle}` } }).then((x) => ok<Competitor>(x)),
  fetchVideos: (r: APIRequestContext, competitorId: string) =>
    r.post(`/api/competitors/${competitorId}/videos/fetch`).then((x) => ok<Video[]>(x)),
  remix: (r: APIRequestContext, videoId: string, template = 'default') =>
    r.post(`/api/videos/${videoId}/remix`, { data: { template } }).then((x) => ok<{ id: string; hook: string; title: string }>(x)),
  addToPlan: (r: APIRequestContext, videoId: string) =>
    r.post('/api/content-plan', { data: { videoId } }).then((x) => ok<PlanItem>(x)),
  updatePlan: (r: APIRequestContext, id: string, changes: Record<string, unknown>) =>
    r.patch(`/api/content-plan/${id}`, { data: changes }).then((x) => ok<PlanItem>(x)),
  list: <T>(r: APIRequestContext, path: string) => r.get(`/api${path}`).then((x) => ok<T>(x)),
};

// A new competitor with its 15 sample videos (newest first, as the library shows them).
export async function seedChannel(r: APIRequestContext, prefix: string) {
  const handle = uniqueHandle(prefix);
  const competitor = await api.addCompetitor(r, handle);
  const videos = await api.fetchVideos(r, competitor.id);
  return { handle, competitor, videos };
}

// How long a page that renders the whole shared database may take (the
// library grows with every run, and /videos renders every video).
export const LOAD_TIMEOUT = 30_000;

// The Videos page, filtered to one channel. Waits for the library to load
// and for the filter to show only that channel before returning.
export async function openVideosOf(page: Page, handle: string) {
  await page.goto('/videos');
  await expect(page.getByText('Loading your videos…')).toHaveCount(0, { timeout: LOAD_TIMEOUT });
  await filterVideosTo(page, handle);
}

// Chooses one channel in the Videos page's Competitor filter and waits for the re-render.
export async function filterVideosTo(page: Page, handle: string) {
  const filter = page.getByLabel('Competitor');
  await expect(filter.locator('option', { hasText: `@${handle}` }).first()).toBeAttached({ timeout: LOAD_TIMEOUT });
  await filter.selectOption({ label: `@${handle}` }, { timeout: LOAD_TIMEOUT });
  await expect(page.locator('article, ul > li').filter({ hasNotText: `@${handle} · ` }).filter({ has: page.getByRole('button', { name: 'Remix' }) })).toHaveCount(0, { timeout: LOAD_TIMEOUT });
}

// A competitor card on the Competitors page.
export function competitorCard(page: Page, handle: string): Locator {
  return page.locator('li').filter({ hasText: `@${handle} · added` });
}

// A plan card on the Content Plan board (cards show "@handle · added …").
export function planCard(page: Page, handle: string): Locator {
  return page.locator('li').filter({ hasText: `@${handle} · added` });
}

// Same short number format as the app ("1.2K", "3.4M").
export function compact(n: number): string {
  const trim = (x: number) => x.toFixed(1).replace(/\.0$/, '');
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (n >= 1_000) return `${trim(n / 1_000)}K`;
  return String(n);
}

// YYYY-MM-DD for a local date, as <input type="date"> uses.
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
