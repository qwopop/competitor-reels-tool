// Issue 70: Remove a video from the Content Plan
import { expect, test, type Page } from '@playwright/test';
import { api, isoDay, openVideosOf, planCard, seedChannel } from './helpers';

const cardOf = (page: Page, handle: string, caption: string) => planCard(page, handle).filter({ hasText: caption });
const notStartedHeader = (page: Page) => page.getByRole('region', { name: /Not started/ }).getByRole('heading', { level: 2 });
const notStartedSummary = (page: Page) => page.locator('li').filter({ hasText: /^\s*❌ Not started \d+\s*$/ });
const lastNumber = async (text: Promise<string>) => Number((await text).match(/(\d+)\s*$/)![1]);

test('Remove from plan asks first, removes only the plan item, and the video can be planned again', async ({ page, request }) => {
  const { handle, videos } = await seedChannel(request, 'prem');
  const [target, other] = videos;
  await api.remix(request, target.id);
  const item = await api.addToPlan(request, target.id);
  await api.updatePlan(request, item.id, { filmDate: isoDay(new Date()), scriptDone: true });
  await api.addToPlan(request, other.id);

  await page.goto('/content-plan');
  const card = cardOf(page, handle, target.caption);
  await expect(card).toHaveCount(1);
  const dialog = page.getByRole('dialog', { name: `Remove “${target.caption}”?` });

  await card.getByRole('button', { name: 'Remove from plan' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Its breakdown, if you made one, is kept.');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(card).toHaveCount(1);

  await card.getByRole('button', { name: 'Remove from plan' }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(card).toHaveCount(1);

  const headerBefore = await lastNumber(notStartedHeader(page).innerText());
  const summaryBefore = await lastNumber(notStartedSummary(page).innerText());
  await card.getByRole('button', { name: 'Remove from plan' }).click();
  await dialog.getByRole('button', { name: 'Remove from plan' }).click();
  await expect(card).toHaveCount(0);
  await expect(notStartedHeader(page)).toHaveText(new RegExp(` ${headerBefore - 1}$`));
  await expect(notStartedSummary(page)).toHaveText(new RegExp(` ${summaryBefore - 1}\\s*$`));

  await page.reload();
  await expect(cardOf(page, handle, other.caption)).toHaveCount(1);
  await expect(cardOf(page, handle, target.caption)).toHaveCount(0);

  // The video and its remix are kept.
  await openVideosOf(page, handle);
  const video = page.locator('article').filter({ has: page.getByRole('heading', { name: target.caption, exact: true }) });
  await expect(video).toHaveCount(1);
  await expect(video.getByRole('button', { name: 'Add to plan' })).toBeVisible();
  await expect(video).not.toContainText('In content plan');
  await expect(video.getByRole('button', { name: 'Preview' })).toBeVisible();

  await page.goto('/remixes');
  await expect(page.locator('li').filter({ hasText: `@${handle} · updated` })).toHaveCount(1);

  // Planned again: a fresh item.
  await openVideosOf(page, handle);
  await video.getByRole('button', { name: 'Add to plan' }).click();
  await expect(video).toContainText('In content plan');
  await page.goto('/content-plan');
  const again = page.getByRole('region', { name: /Not started/ }).locator('li').filter({ hasText: `@${handle} · added` }).filter({ hasText: target.caption });
  await expect(again).toHaveCount(1);
  await expect(again.getByLabel(`Film date for ${target.caption}`, { exact: true })).toHaveValue('');
  await expect(again.getByLabel(`Publish date for ${target.caption}`, { exact: true })).toHaveValue('');
  await expect(again.getByRole('group', { name: /Production checklist/ })).toContainText('0/4');
});

test('removing from the Table removes only that row', async ({ page, request }) => {
  const { handle, videos } = await seedChannel(request, 'prem-table');
  const [target, other] = videos;
  await api.addToPlan(request, target.id);
  await api.addToPlan(request, other.id);

  await page.goto('/content-plan');
  await page.getByRole('group', { name: 'Plan layout' }).getByRole('button', { name: 'Table' }).click();
  const rows = page.locator('tbody tr').filter({ has: page.locator('td:nth-child(2)', { hasText: new RegExp(`^@${handle}$`) }) });
  const row = rows.filter({ hasText: target.caption });
  await expect(rows).toHaveCount(2);

  await row.getByRole('button', { name: 'Remove from plan' }).click();
  const dialog = page.getByRole('dialog', { name: `Remove “${target.caption}”?` });
  await dialog.getByRole('button', { name: 'Remove from plan' }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toHaveCount(0);
  await expect(rows.filter({ hasText: other.caption })).toHaveCount(1);

  await page.reload();
  await expect(cardOf(page, handle, target.caption)).toHaveCount(0);
  await expect(cardOf(page, handle, other.caption)).toHaveCount(1);
});
