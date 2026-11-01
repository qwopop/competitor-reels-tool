// Issue 54: Fetch a competitor's videos.
import { expect, test } from '@playwright/test';
import { api, competitorCard, uniqueHandle } from './helpers';

test("fetch a competitor's videos, and refetch replaces them", async ({ page, request }) => {
  const handle = uniqueHandle('fetch');
  await api.addCompetitor(request, handle);
  await page.goto('/competitors');
  const card = competitorCard(page, handle);
  await expect(card).toContainText('0 videos');

  await card.getByRole('button', { name: 'Fetch videos' }).click();
  await expect(card.getByRole('button', { name: 'Fetched' })).toBeVisible();
  await expect(card).toContainText('15 videos');
  await expect(card).toContainText('Pulled 15 videos into your library.');

  // Again: replaced, not appended.
  await card.getByRole('button', { name: 'Fetched' }).click();
  await expect(card.getByRole('button', { name: 'Fetched' })).toBeVisible();
  await expect(card).toContainText('15 videos');

  await card.getByRole('link', { name: 'View videos' }).click();
  await expect(page).toHaveURL(/\/videos$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Browse');
});
