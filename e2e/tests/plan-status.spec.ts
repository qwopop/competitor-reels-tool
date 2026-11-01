// Issue 66: Content Plan statuses, board and table.
import { expect, test } from '@playwright/test';
import { api, planCard, seedChannel } from './helpers';

test('change a status on the board and in the table, and it is saved', async ({ page, request }) => {
  const { handle, videos } = await seedChannel(request, 'pstat');
  await api.addToPlan(request, videos[0].id);
  await page.goto('/content-plan');

  const views = page.getByRole('group', { name: 'Plan layout' });
  await expect(views.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true');
  const card = planCard(page, handle);
  await expect(page.getByRole('region', { name: /Not started/ }).locator('li').filter({ hasText: `@${handle} · added` })).toHaveCount(1);

  await card.getByRole('button', { name: 'Ready to film' }).click();
  await expect(page.getByRole('region', { name: /Ready to film/ }).locator('li').filter({ hasText: `@${handle} · added` })).toHaveCount(1);

  await views.getByRole('button', { name: 'Table' }).click();
  const row = page.locator('tr').filter({ hasText: `@${handle}` });
  await expect(row.getByRole('button', { name: 'Ready to film' })).toHaveAttribute('aria-pressed', 'true');
  await row.getByRole('button', { name: 'Filmed' }).click();
  await expect(row.getByRole('button', { name: 'Filmed' })).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect(page.getByRole('region', { name: /Filmed/ }).locator('li').filter({ hasText: `@${handle} · added` })).toHaveCount(1);
});
