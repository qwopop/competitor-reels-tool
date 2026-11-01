// Issue 53: Add a competitor.
import { expect, test } from '@playwright/test';
import { competitorCard, uniqueHandle } from './helpers';

test('add a competitor through the modal, with validation and no duplicates', async ({ page }) => {
  const handle = uniqueHandle('add');
  await page.goto('/competitors');
  await page.getByRole('button', { name: 'Add competitor' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a competitor' });
  const input = dialog.getByLabel('YouTube channel link or @handle');
  const submit = dialog.getByRole('button', { name: 'Add competitor' });

  // Invalid input: an error, and nothing added.
  await expect(submit).toBeDisabled();
  await input.fill('https://twitter.com/someone');
  await submit.click();
  await expect(dialog.getByRole('alert')).toContainText('YouTube channel link');

  // A valid handle: a preview link to the channel while typing.
  await input.fill(`@${handle}`);
  await expect(dialog.getByRole('link', { name: `Open @${handle} on YouTube` })).toHaveAttribute(
    'href',
    `https://www.youtube.com/@${handle}/videos`
  );
  await submit.click();
  await expect(dialog).toBeHidden();
  await expect(competitorCard(page, handle)).toHaveCount(1);

  // The same channel again, as a full link: still one card.
  await page.getByRole('button', { name: 'Add competitor' }).click();
  await page.getByLabel('YouTube channel link or @handle').fill(`https://www.youtube.com/@${handle}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Add competitor' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.reload();
  await expect(competitorCard(page, handle)).toHaveCount(1);
});
