// Issue 53: Add a competitor
import { expect, test, type Page } from '@playwright/test';
import { competitorCard, uniqueHandle } from './helpers';

async function openAddDialog(page: Page) {
  await page.getByRole('button', { name: 'Add competitor' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add a competitor' });
  await expect(dialog).toBeVisible();
  return {
    dialog,
    input: dialog.getByLabel('YouTube channel link or @handle'),
    submit: dialog.getByRole('button', { name: 'Add competitor' }),
  };
}

test('the dialog opens with its field, and the button is disabled while the field is blank', async ({ page }) => {
  await page.goto('/competitors');
  const { dialog, input, submit } = await openAddDialog(page);
  await expect(dialog.getByRole('heading', { name: 'Add a competitor' })).toBeVisible();
  await expect(input).toBeVisible();
  await expect(input).toHaveValue('');
  await expect(submit).toBeDisabled();
  await input.fill('   ');
  await expect(submit).toBeDisabled();
});

test('a non-YouTube link shows an error, keeps the dialog open and adds nothing', async ({ page }) => {
  await page.goto('/competitors');
  await expect(page.getByText('Loading competitors…')).toHaveCount(0);
  const cardsBefore = await page.locator('li').filter({ hasText: '· added' }).count();
  const { dialog, input, submit } = await openAddDialog(page);

  await input.fill('https://twitter.com/someone');
  // Not a channel reference: no preview link.
  await expect(dialog.getByRole('link', { name: /^Open .* on YouTube$/ })).toHaveCount(0);
  await submit.click();
  await expect(dialog.getByRole('alert')).toContainText('YouTube channel link');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: /^Open .* on YouTube$/ })).toHaveCount(0);
  await expect(page.locator('li').filter({ hasText: '· added' })).toHaveCount(cardsBefore);
});

test('a typed @handle shows a preview link to the channel on YouTube', async ({ page }) => {
  const handle = uniqueHandle('add-prev');
  await page.goto('/competitors');
  const { dialog, input } = await openAddDialog(page);

  await input.fill('not a channel');
  await expect(dialog.getByRole('link', { name: /^Open .* on YouTube$/ })).toHaveCount(0);

  await input.fill(`@${handle}`);
  const preview = dialog.getByRole('link', { name: `Open @${handle} on YouTube` });
  await expect(preview).toHaveAttribute('href', `https://www.youtube.com/@${handle}/videos`);
  await expect(preview).toHaveAttribute('target', '_blank');
});

test('adding @handle creates one card; the same channel as a link or in other case adds no duplicate', async ({ page }) => {
  const handle = uniqueHandle('add');
  await page.goto('/competitors');

  let d = await openAddDialog(page);
  await d.input.fill(`@${handle}`);
  await d.submit.click();
  await expect(d.dialog).toBeHidden();
  const card = competitorCard(page, handle);
  await expect(card).toHaveCount(1);
  await expect(card).toContainText(`@${handle} · added`);
  await expect(card).toContainText('0 videos');

  // The same channel again, as a full link.
  d = await openAddDialog(page);
  await d.input.fill(`https://www.youtube.com/@${handle}`);
  await d.submit.click();
  await expect(d.dialog).toBeHidden();
  await expect(competitorCard(page, handle)).toHaveCount(1);

  // The same channel again, in upper case.
  d = await openAddDialog(page);
  await d.input.fill(`@${handle.toUpperCase()}`);
  await d.submit.click();
  await expect(d.dialog).toBeHidden();
  await expect(competitorCard(page, handle)).toHaveCount(1);

  // Still one card after a reload.
  await page.reload();
  await expect(competitorCard(page, handle)).toHaveCount(1);
});

test('Cancel and Escape close the dialog without adding a card', async ({ page }) => {
  const handle = uniqueHandle('add-cancel');
  await page.goto('/competitors');

  let d = await openAddDialog(page);
  await d.input.fill(`@${handle}`);
  await d.dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(d.dialog).toBeHidden();
  await expect(competitorCard(page, handle)).toHaveCount(0);

  d = await openAddDialog(page);
  await d.input.fill(`@${handle}`);
  await page.keyboard.press('Escape');
  await expect(d.dialog).toBeHidden();
  await expect(competitorCard(page, handle)).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(competitorCard(page, handle)).toHaveCount(0);
});
