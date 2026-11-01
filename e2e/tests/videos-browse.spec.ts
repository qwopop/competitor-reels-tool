// Issue 58: Videos library grid and list views.
import { expect, test } from '@playwright/test';
import { openVideosOf, seedChannel } from './helpers';

test('the library shows a grid by default and switches to a list', async ({ page, request }) => {
  const { handle, videos } = await seedChannel(request, 'browse');
  await openVideosOf(page, handle);

  const layout = page.getByRole('group', { name: 'Library layout' });
  await expect(layout.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'true');
  const cards = page.locator('article');
  await expect(cards).toHaveCount(15);
  const first = cards.first();
  await expect(first).toContainText(videos[0].caption);
  await expect(first).toContainText(/views · .*likes/);
  await expect(first.getByRole('button', { name: 'Add to plan' })).toBeVisible();
  await expect(first.getByRole('button', { name: 'Remix' })).toBeVisible();

  await layout.getByRole('button', { name: 'List' }).click();
  await expect(layout.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('article')).toHaveCount(0);
  const rows = page.locator('ul li').filter({ has: page.getByRole('button', { name: 'Remix' }) });
  await expect(rows).toHaveCount(15);
  await expect(rows.first()).toContainText(videos[0].caption);

  await layout.getByRole('button', { name: 'Grid' }).click();
  await expect(page.locator('article')).toHaveCount(15);
});
