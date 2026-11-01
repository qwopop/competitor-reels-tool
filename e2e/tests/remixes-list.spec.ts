// Issue 64: Remixes page and quick preview.
import { expect, test } from '@playwright/test';
import { api, openVideosOf, seedChannel } from './helpers';

test('the Remixes page lists remixes, and Preview shows one from the library', async ({ page, request }) => {
  const { handle, videos } = await seedChannel(request, 'rmx');
  const remix = await api.remix(request, videos[0].id);

  await page.goto('/remixes');
  const item = page.locator('li').filter({ hasText: `@${handle} · updated` });
  await expect(item).toContainText(remix.title);
  await expect(item).toContainText(`Hook: ${remix.hook}`);
  await item.getByRole('link', { name: 'Open editor' }).click();
  await expect(page).toHaveURL(new RegExp(`/remix/${remix.id}$`));

  await openVideosOf(page, handle);
  await page.locator('article').first().getByRole('button', { name: 'Preview' }).click();
  const preview = page.getByRole('dialog', { name: 'Remix preview' }).or(page.getByLabel('Remix preview'));
  await expect(preview).toContainText(remix.hook);
  await page.keyboard.press('Escape');
  await expect(preview).toBeHidden();
});
