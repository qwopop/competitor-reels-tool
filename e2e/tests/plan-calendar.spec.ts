// Issue 69: Content Plan calendar.
import { expect, test } from '@playwright/test';
import { api, isoDay, seedChannel } from './helpers';

test('film and publish days show on the calendar, with navigation, an editor and the unscheduled list', async ({ page, request }) => {
  const { handle, videos } = await seedChannel(request, 'pcal');
  const scheduled = await api.addToPlan(request, videos[0].id);
  await api.addToPlan(request, videos[1].id);

  // A day in a future month, so entries from other runs don't share it.
  const monthsAhead = 2 + Math.floor(Math.random() * 9);
  const filmDay = 3 + Math.floor(Math.random() * 20);
  const now = new Date();
  const film = new Date(now.getFullYear(), now.getMonth() + monthsAhead, filmDay);
  const publish = new Date(film.getFullYear(), film.getMonth(), filmDay + 2);
  await api.updatePlan(request, scheduled.id, { filmDate: isoDay(film), publishDate: isoDay(publish), scriptDone: true });

  await page.goto('/content-plan');
  await page.getByRole('group', { name: 'Plan layout' }).getByRole('button', { name: 'Calendar' }).click();
  const currentMonth = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  await expect(page.getByRole('heading', { name: currentMonth })).toBeVisible();
  for (let i = 0; i < monthsAhead; i++) await page.getByRole('button', { name: 'Next month' }).click();
  await expect(page.getByRole('heading', { name: film.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) })).toBeVisible();

  const cellFor = (d: Date) => page.getByRole('gridcell').filter({ has: page.locator(`p:text-is("${d.getDate()}")`) });
  const filmEntry = page.getByRole('button', { name: `Film: ${scheduled.caption}. Checklist 1 of 4.` });
  await expect(filmEntry).toBeVisible();
  await expect(cellFor(film).getByRole('button', { name: /^Film:/ }).first()).toBeVisible();
  await expect(cellFor(publish).getByRole('button', { name: new RegExp(`^Publish: ${scheduled.caption.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })).toBeVisible();

  await filmEntry.click();
  const editor = page.getByRole('region', { name: 'Selected video' });
  await expect(editor).toContainText(`@${handle}`);
  await expect(editor.getByLabel(/^Film date for/)).toHaveValue(isoDay(film));
  await expect(editor.getByRole('checkbox', { name: 'Script completed' })).toBeChecked();

  await page.getByRole('button', { name: 'Today' }).click();
  await expect(page.getByRole('heading', { name: currentMonth })).toBeVisible();

  const unscheduled = page.getByRole('region', { name: /Not scheduled yet/ });
  const item = unscheduled.locator('li').filter({ hasText: `@${handle}` });
  await expect(item).toHaveCount(1);
  await item.getByLabel(/^Film date for/).fill(isoDay(publish));
  await expect(unscheduled.locator('li').filter({ hasText: `@${handle}` })).toHaveCount(0);
});
