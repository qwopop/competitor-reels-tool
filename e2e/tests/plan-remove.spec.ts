// Issue 70: Remove a video from the Content Plan.
import { expect, test } from '@playwright/test';
import { api, openVideosOf, planCard, seedChannel } from './helpers';

test('remove a video from the plan after confirming; the video and remix stay', async ({ page, request }) => {
  const { handle, videos } = await seedChannel(request, 'prem');
  await api.remix(request, videos[0].id);
  await api.addToPlan(request, videos[0].id);
  await page.goto('/content-plan');
  const card = planCard(page, handle);

  await card.getByRole('button', { name: 'Remove from plan' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(card).toHaveCount(1);

  await card.getByRole('button', { name: 'Remove from plan' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove from plan' }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(planCard(page, handle)).toHaveCount(0);

  expect((await request.get(`/api/videos/${videos[0].id}`)).status()).toBe(200);
  expect((await request.get(`/api/videos/${videos[0].id}/remix/current`)).status()).toBe(200);
  await openVideosOf(page, handle);
  await expect(page.locator('article').first().getByRole('button', { name: 'Add to plan' })).toBeVisible();
});
