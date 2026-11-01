// Issue 57: Dashboard statistics and overview
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { api, compact, seedChannel, type PlanItem, type Video } from './helpers';

// The extra video fields the dashboard uses.
type FullVideo = Video & { commentCount: number; postedAt: string; competitorId: string };

const PLAN_ROWS = [
  ['Not started', 'not_started'],
  ['Ready to film', 'ready'],
  ['Filmed', 'filmed'],
] as const;

// "1 view", "12.3K views", as the app writes a count.
function views(n: number) {
  return `${compact(n)} ${n === 1 ? 'view' : 'views'}`;
}

async function readAll(request: APIRequestContext) {
  const [competitors, videos, remixes, plan] = await Promise.all([
    api.list<unknown[]>(request, '/competitors'),
    api.list<FullVideo[]>(request, '/videos'),
    api.list<unknown[]>(request, '/remixes'),
    api.list<PlanItem[]>(request, '/content-plan'),
  ]);
  return { competitors, videos, remixes, plan };
}

function tile(page: Page, label: string) {
  return page
    .getByRole('region', { name: 'Totals' })
    .getByText(label, { exact: true })
    .locator('xpath=preceding-sibling::p');
}

function planRowCount(page: Page, label: string) {
  return page
    .locator('section[aria-labelledby="content-progress"] li')
    .filter({ hasText: label })
    .locator(':scope > span')
    .last();
}

async function seed(request: APIRequestContext) {
  const { videos } = await seedChannel(request, 'stats');
  await api.remix(request, videos[0].id);
  const item = await api.addToPlan(request, videos[1].id);
  return item;
}

test('the totals tiles match the stored data', async ({ page, request }) => {
  await seed(request);
  const data = await readAll(request);
  await page.goto('/');

  const totals = page.getByRole('region', { name: 'Totals' });
  await expect(totals.locator(':scope > div')).toHaveCount(7);
  const sum = (key: 'viewCount' | 'likeCount' | 'commentCount') => data.videos.reduce((s, v) => s + v[key], 0);
  for (const [label, value] of [
    ['Competitors', data.competitors.length],
    ['Videos', data.videos.length],
    ['Remixes', data.remixes.length],
    ['Planned videos', data.plan.length],
    ['Views', sum('viewCount')],
    ['Likes', sum('likeCount')],
    ['Comments', sum('commentCount')],
  ] as const) {
    await expect(tile(page, label), label).toHaveText(compact(value));
  }
});

test('the top video and the most-viewed competitor match the stored data', async ({ page, request }) => {
  await seed(request);
  const { videos } = await readAll(request);
  await page.goto('/');

  // Most views; on a tie the first one in the API's newest-first order.
  const top = videos.reduce((best, v) => (v.viewCount > best.viewCount ? v : best));
  const topSection = page.locator('section[aria-labelledby="top-video"]');
  await expect(topSection.getByRole('heading', { name: 'Top-performing Video' })).toBeVisible();
  const topBlock = topSection.locator('img').locator('xpath=following-sibling::div');
  await expect(topBlock).toContainText(top.caption);
  await expect(topBlock).toContainText(`@${top.competitorUsername}`);
  await expect(topBlock).toContainText(views(top.viewCount));

  const totalsBy = new Map<string, { username: string; views: number }>();
  for (const v of videos) {
    const e = totalsBy.get(v.competitorId) ?? { username: v.competitorUsername, views: 0 };
    e.views += v.viewCount;
    totalsBy.set(v.competitorId, e);
  }
  const most = [...totalsBy.values()].reduce((best, e) => (e.views > best.views ? e : best));
  const mostLine = topSection.getByRole('heading', { name: 'Most-viewed competitor' }).locator('xpath=following-sibling::p[1]');
  await expect(mostLine).toHaveText(`@${most.username} · ${views(most.views)}`);
});

test('Content plan progress counts each status, and follows a status change', async ({ page, request }) => {
  const item = await seed(request);
  const { plan } = await readAll(request);
  await page.goto('/');

  const before: Record<string, number> = {};
  for (const [label, status] of PLAN_ROWS) {
    before[status] = plan.filter((p) => p.status === status).length;
    await expect(planRowCount(page, label), label).toHaveText(String(before[status]));
  }

  await api.updatePlan(request, item.id, { status: 'ready' });
  await page.reload();
  await expect(planRowCount(page, 'Ready to film')).toHaveText(String(before.ready + 1));
  await expect(planRowCount(page, 'Not started')).toHaveText(String(before.not_started - 1));
  await expect(planRowCount(page, 'Filmed')).toHaveText(String(before.filmed));
});

test('Recent Videos lists the latest posts', async ({ page, request }) => {
  await seed(request);
  const { videos } = await readAll(request);
  await page.goto('/');

  const latest = [...videos].sort((a, b) => +new Date(b.postedAt) - +new Date(a.postedAt))[0];
  const rows = page.locator('section[aria-labelledby="recent"] li');
  await expect(rows).toHaveCount(Math.min(5, videos.length));
  await expect(rows.first()).toContainText(latest.caption);
  await expect(rows.first()).toContainText(`@${latest.competitorUsername}`);
});

test('the overview links open the content plan and the videos library', async ({ page, request }) => {
  await seed(request);
  await page.goto('/');
  await page.getByRole('link', { name: 'Open the content plan' }).click();
  await expect(page).toHaveURL(/\/content-plan$/);

  await page.goto('/');
  await page.getByRole('link', { name: 'Open the videos library' }).click();
  await expect(page).toHaveURL(/\/videos$/);
});
