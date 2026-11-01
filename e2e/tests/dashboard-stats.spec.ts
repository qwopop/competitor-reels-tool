// Issue 57: Dashboard statistics and overview.
import { expect, test } from '@playwright/test';
import { api, compact, seedChannel, type PlanItem, type Video } from './helpers';

test('the dashboard totals, top video, plan progress and recent videos match the data', async ({ page, request }) => {
  const { videos } = await seedChannel(request, 'stats');
  await api.remix(request, videos[0].id);
  await api.addToPlan(request, videos[1].id);

  const [competitors, allVideos, remixes, plan] = await Promise.all([
    api.list<unknown[]>(request, '/competitors'),
    api.list<Video[]>(request, '/videos'),
    api.list<unknown[]>(request, '/remixes'),
    api.list<PlanItem[]>(request, '/content-plan'),
  ]);

  await page.goto('/');
  const totals = page.getByRole('region', { name: 'Totals' });
  for (const [label, value] of [
    ['Competitors', competitors.length],
    ['Videos', allVideos.length],
    ['Remixes', remixes.length],
    ['Planned videos', plan.length],
  ] as const) {
    await expect(totals.getByText(label, { exact: true }).locator('xpath=preceding-sibling::p')).toHaveText(compact(value));
  }

  // The top video is the one with the most views (the first one, on a tie).
  const top = allVideos.reduce((best, v) => (v.viewCount > best.viewCount ? v : best));
  const topSection = page.locator('section[aria-labelledby="top-video"]');
  await expect(topSection).toContainText(top.caption);

  const progress = page.locator('section[aria-labelledby="content-progress"]');
  for (const [label, status] of [['Not started', 'not_started'], ['Ready to film', 'ready'], ['Filmed', 'filmed']]) {
    const count = plan.filter((p) => p.status === status).length;
    await expect(progress.locator('li').filter({ hasText: label })).toContainText(String(count));
  }

  const recent = page.locator('section[aria-labelledby="recent"] li');
  await expect(recent).toHaveCount(Math.min(5, allVideos.length));
});
