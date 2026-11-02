// Issue 55: Remove a competitor
import { expect, test } from '@playwright/test';
import { api, competitorCard, planCard, seedChannel } from './helpers';

// How long a page over the whole shared database may take to load.
const LOAD = 30_000;

test('Cancel and Escape close the remove dialog and keep the competitor', async ({ page, request }) => {
  const { handle } = await seedChannel(request, 'rm-keep');
  await page.goto('/competitors');
  const card = competitorCard(page, handle);
  const dialog = page.getByRole('dialog', { name: `Remove @${handle}?` });

  await card.getByRole('button', { name: `Remove @${handle}` }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Videos already in your Content Plan are kept.');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(card).toHaveCount(1);

  await card.getByRole('button', { name: `Remove @${handle}` }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(card).toHaveCount(1);
});

test('removing a competitor deletes its videos and remixes but keeps its plan items', async ({ page, request }) => {
  // /videos renders the whole shared library, which is slow on a large database.
  test.slow();
  const { handle, videos } = await seedChannel(request, 'rm');
  const { handle: other } = await seedChannel(request, 'rm-other');
  const remix = await api.remix(request, videos[0].id);
  // Plan a video with no remix, so Create breakdown has to make a new one.
  const planned = videos[1];
  await api.addToPlan(request, planned.id);

  await page.goto('/competitors');
  const card = competitorCard(page, handle);
  await expect(competitorCard(page, other)).toContainText('15 videos');
  await card.getByRole('button', { name: `Remove @${handle}` }).click();
  const dialog = page.getByRole('dialog', { name: `Remove @${handle}?` });
  await expect(dialog).toContainText('Videos already in your Content Plan are kept.');
  await dialog.getByRole('button', { name: 'Remove competitor' }).click();
  await expect(dialog).toBeHidden();
  await expect(card).toHaveCount(0);

  await page.reload();
  await expect(competitorCard(page, other)).toContainText('15 videos');
  await expect(card).toHaveCount(0);

  // No longer a library filter option.
  await page.goto('/videos');
  await expect(page.getByText('Loading your videos…')).toHaveCount(0, { timeout: LOAD });
  const filter = page.getByLabel('Competitor');
  await expect(filter.locator('option', { hasText: `@${other}` })).toHaveCount(1, { timeout: LOAD });
  await expect(filter.locator('option', { hasText: `@${handle}` })).toHaveCount(0);

  // Its remix is gone.
  await page.goto(`/remix/${remix.id}`);
  await expect(page.getByText('Remix not found.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);

  // The plan item is kept, but a breakdown can't be made for it any more.
  await page.goto('/content-plan');
  await expect(page.getByText('Loading your plan…')).toHaveCount(0, { timeout: LOAD });
  const item = planCard(page, handle);
  await expect(item).toHaveCount(1, { timeout: LOAD });
  await expect(item).toContainText(planned.caption);
  await item.getByRole('button', { name: 'Create breakdown' }).click();
  await expect(
    page.getByText("This video is no longer in your library, so a breakdown can't be created.")
  ).toBeVisible({ timeout: LOAD });
  await expect(page).toHaveURL(/\/content-plan$/);
});
