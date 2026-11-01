// Issue 55: Remove a competitor.
import { expect, test } from '@playwright/test';
import { api, competitorCard, planCard, seedChannel } from './helpers';

test('remove a competitor after confirming; its plan items are kept', async ({ page, request }) => {
  const { handle, videos } = await seedChannel(request, 'remove');
  await api.addToPlan(request, videos[0].id);

  await page.goto('/competitors');
  const card = competitorCard(page, handle);
  await card.getByRole('button', { name: `Remove @${handle}` }).click();
  const dialog = page.getByRole('dialog', { name: `Remove @${handle}?` });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(card).toHaveCount(1);

  await card.getByRole('button', { name: `Remove @${handle}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove competitor' }).click();
  await expect(card).toHaveCount(0);

  await page.goto('/videos');
  await expect(page.getByLabel('Competitor').locator('option', { hasText: `@${handle}` })).toHaveCount(0);

  await page.goto('/content-plan');
  await expect(planCard(page, handle)).toHaveCount(1);
});
