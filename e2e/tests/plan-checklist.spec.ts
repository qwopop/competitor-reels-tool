// Issue 68: Production checklist.
import { expect, test } from '@playwright/test';
import { api, planCard, seedChannel } from './helpers';

test('tick the production checklist; progress is shown and saved, and the status is unchanged', async ({ page, request }) => {
  const { handle, videos } = await seedChannel(request, 'pcheck');
  await api.addToPlan(request, videos[0].id);
  await page.goto('/content-plan');
  const card = planCard(page, handle);
  const checklist = card.getByRole('group', { name: /Production checklist/ });
  await expect(checklist).toContainText('0/4');

  await checklist.getByRole('checkbox', { name: 'Script completed' }).check();
  await checklist.getByRole('checkbox', { name: 'Caption prepared' }).check();
  await expect(checklist).toContainText('2/4');

  await page.reload();
  await expect(checklist.getByRole('checkbox', { name: 'Script completed' })).toBeChecked();
  await expect(checklist.getByRole('checkbox', { name: 'Caption prepared' })).toBeChecked();
  await expect(checklist.getByRole('checkbox', { name: 'Recording completed' })).not.toBeChecked();

  await page.getByRole('group', { name: 'Plan layout' }).getByRole('button', { name: 'Table' }).click();
  await expect(page.locator('tr').filter({ hasText: `@${handle}` })).toContainText('2/4 done');
  await page.getByRole('group', { name: 'Plan layout' }).getByRole('button', { name: 'Board' }).click();

  await checklist.getByRole('checkbox', { name: 'Caption prepared' }).uncheck();
  await expect(checklist).toContainText('1/4');
  await checklist.getByRole('checkbox', { name: 'Published' }).check();
  await expect(card.getByRole('button', { name: 'Not started' })).toHaveAttribute('aria-pressed', 'true');
});
