// Issue 61: Generate a remix.
import { expect, test } from '@playwright/test';
import { openVideosOf, seedChannel } from './helpers';

test('Remix opens the editor with a full draft, and remixing again reopens it', async ({ page, request }) => {
  const { handle } = await seedChannel(request, 'remix');
  await openVideosOf(page, handle);
  await page.locator('article').first().getByRole('button', { name: 'Remix' }).click();

  await expect(page).toHaveURL(/\/remix\/remix_/);
  const url = page.url();
  for (const field of ['Title', 'Hook', 'Script', 'Call to action']) {
    await expect(page.getByLabel(field, { exact: true })).not.toHaveValue('');
  }

  await openVideosOf(page, handle);
  const first = page.locator('article').first();
  await expect(first.getByRole('button', { name: 'Preview' })).toBeVisible();
  await first.getByRole('button', { name: 'Remix' }).click();
  await expect(page).toHaveURL(url);
});
