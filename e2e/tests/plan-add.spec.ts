// Issue 65: Add a video to the Content Plan.
import { expect, test } from '@playwright/test';
import { api, openVideosOf, planCard, seedChannel, type PlanItem } from './helpers';

test('Add to plan adds a video once, at Not started, with a message', async ({ page, request }) => {
  const { handle, videos } = await seedChannel(request, 'padd');
  await openVideosOf(page, handle);
  const first = page.locator('article').first();
  await first.getByRole('button', { name: 'Add to plan' }).click();
  await expect(page.getByText('Added to your Content Plan.')).toBeVisible();
  await expect(first).toContainText('In content plan');

  await page.goto('/content-plan');
  const notStarted = page.getByRole('region', { name: /Not started/ });
  await expect(notStarted.locator('li').filter({ hasText: `@${handle} · added` })).toHaveCount(1);

  // From the remix editor the video already shows as planned; the API won't plan it twice.
  const remix = await api.remix(request, videos[0].id);
  await page.goto(`/remix/${remix.id}`);
  await expect(page.getByText('In content plan')).toBeVisible();
  const again = await request.post('/api/content-plan', { data: { videoId: videos[0].id } });
  expect(again.status()).toBe(200);
  const plan = await api.list<PlanItem[]>(request, '/content-plan');
  expect(plan.filter((p) => p.videoId === videos[0].id)).toHaveLength(1);

  await page.goto('/content-plan');
  await expect(planCard(page, handle)).toHaveCount(1);
});
