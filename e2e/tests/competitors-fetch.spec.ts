// Issue 54: Fetch a competitor's videos
import { expect, test } from '@playwright/test';
import { api, competitorCard, seedChannel, uniqueHandle } from './helpers';

test('Fetch videos pulls 15 videos; fetching again replaces them; a reload keeps the count', async ({ page, request }) => {
  const handle = uniqueHandle('fetch');
  await api.addCompetitor(request, handle);
  await page.goto('/competitors');
  const card = competitorCard(page, handle);
  await expect(card).toContainText('0 videos');

  await card.getByRole('button', { name: 'Fetch videos' }).click();
  await expect(card.getByRole('button', { name: 'Fetched' })).toBeVisible();
  await expect(card).toContainText('15 videos');
  await expect(card).toContainText('Pulled 15 videos into your library.');
  await expect(card.getByRole('link', { name: 'View videos' })).toBeVisible();

  // Again: replaced, not appended.
  await card.getByRole('button', { name: 'Fetched' }).click();
  await expect(card.getByRole('button', { name: 'Fetched' })).toBeVisible();
  await expect(card).toContainText('15 videos');
  await expect(card).not.toContainText('30 videos');

  await page.reload();
  await expect(card).toContainText('15 videos');
  await expect(card.getByRole('button', { name: 'Fetch videos' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Fetched' })).toHaveCount(0);
});

test("fetching one competitor leaves other competitors' counts alone", async ({ page, request }) => {
  const target = uniqueHandle('fetch-a');
  const empty = uniqueHandle('fetch-b');
  await api.addCompetitor(request, target);
  await api.addCompetitor(request, empty);
  const { handle: full } = await seedChannel(request, 'fetch-c');

  await page.goto('/competitors');
  await expect(competitorCard(page, empty)).toContainText('0 videos');
  await expect(competitorCard(page, full)).toContainText('15 videos');

  const card = competitorCard(page, target);
  await card.getByRole('button', { name: 'Fetch videos' }).click();
  await expect(card).toContainText('15 videos');
  await expect(competitorCard(page, empty)).toContainText('0 videos');
  await expect(competitorCard(page, full)).toContainText('15 videos');
  await expect(competitorCard(page, empty).getByRole('button', { name: 'Fetch videos' })).toBeVisible();
});

test('a remixed video is kept when the videos are fetched again', async ({ page, request }) => {
  const { handle, videos } = await seedChannel(request, 'fetch-rmx');
  const remix = await api.remix(request, videos[0].id);

  await page.goto('/competitors');
  const card = competitorCard(page, handle);
  await expect(card).toContainText('15 videos');
  await card.getByRole('button', { name: 'Fetch videos' }).click();
  await expect(card.getByRole('button', { name: 'Fetched' })).toBeVisible();
  await expect(card).toContainText('16 videos');

  await page.goto('/remixes');
  const item = page.locator('li').filter({ hasText: `@${handle} · updated` });
  await expect(item).toHaveCount(1);
  await expect(item).toContainText(remix.title);
});

test('View videos opens the library', async ({ page, request }) => {
  const handle = uniqueHandle('fetch-view');
  await api.addCompetitor(request, handle);
  await page.goto('/competitors');
  const card = competitorCard(page, handle);
  await card.getByRole('button', { name: 'Fetch videos' }).click();
  await card.getByRole('link', { name: 'View videos' }).click();
  await expect(page).toHaveURL(/\/videos$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Browse');
});
