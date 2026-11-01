// Issue 69: Content Plan calendar
import { expect, test, type Page } from '@playwright/test';
import { api, isoDay, seedChannel } from './helpers';

const monthName = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
// The day cell's accessible name, as the app writes it ("Wed, Mar 10" in en-US).
const cellName = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const cell = (page: Page, d: Date) => page.getByRole('gridcell', { name: cellName(d), exact: true });
const entry = (page: Page, d: Date, kind: 'Film' | 'Publish', caption: string) =>
  cell(page, d).getByRole('button', { name: new RegExp(`^${kind}: ${escape(caption)}\\. Checklist \\d of 4\\.$`) });
const heading = (page: Page) => page.getByRole('heading', { level: 2 }).first();

async function openCalendarAt(page: Page, monthsAhead: number) {
  await page.getByRole('group', { name: 'Plan layout' }).getByRole('button', { name: 'Calendar' }).click();
  for (let i = 0; i < monthsAhead; i++) await page.getByRole('button', { name: 'Next month' }).click();
}

// Waits for the next plan item save.
const saved = (page: Page) =>
  page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/api/content-plan/') && r.ok());

test('the calendar shows film and publish days, with navigation, an editor and the unscheduled list', async ({ page, request }) => {
  const { handle, videos } = await seedChannel(request, 'pcal');
  const [A, B, C, D] = videos;
  const itemA = await api.addToPlan(request, A.id);
  await api.addToPlan(request, B.id); // no dates
  const itemC = await api.addToPlan(request, C.id);
  const itemD = await api.addToPlan(request, D.id);

  // A random day a few months ahead, so other runs' entries rarely share it.
  const now = new Date();
  const monthsAhead = 2 + Math.floor(Math.random() * 60);
  const base = 1 + Math.floor(Math.random() * 18);
  const on = (offset: number) => new Date(now.getFullYear(), now.getMonth() + monthsAhead, base + offset);
  const filmA = on(0);
  const publishA = on(3);
  const sameDayD = on(5);
  const publishOnlyC = on(7);
  const filmB = on(9);
  const movedFilmA = on(1);
  await api.updatePlan(request, itemA.id, { filmDate: isoDay(filmA), publishDate: isoDay(publishA) });
  await api.updatePlan(request, itemD.id, { filmDate: isoDay(sameDayD), publishDate: isoDay(sameDayD) });
  await api.updatePlan(request, itemC.id, { publishDate: isoDay(publishOnlyC) });

  await page.goto('/content-plan');
  const views = page.getByRole('group', { name: 'Plan layout' });
  await views.getByRole('button', { name: 'Calendar' }).click();
  await expect(views.getByRole('button', { name: 'Calendar' })).toHaveAttribute('aria-pressed', 'true');
  await expect(heading(page)).toHaveText(monthName(now));
  await expect(page.getByRole('columnheader')).toHaveText(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

  // Navigate to the month with A's dates.
  for (let i = 0; i < monthsAhead; i++) await page.getByRole('button', { name: 'Next month' }).click();
  await expect(heading(page)).toHaveText(monthName(filmA));
  await expect(entry(page, filmA, 'Film', A.caption)).toHaveCount(1);
  await expect(entry(page, filmA, 'Film', A.caption)).toContainText('0/4');
  await expect(entry(page, publishA, 'Publish', A.caption)).toHaveCount(1);
  await expect(entry(page, publishA, 'Publish', A.caption)).toContainText('0/4');

  // Same day: both entries in one cell.
  await expect(entry(page, sameDayD, 'Film', D.caption)).toHaveCount(1);
  await expect(entry(page, sameDayD, 'Publish', D.caption)).toHaveCount(1);

  // Publish date only: on the calendar, not under Not scheduled yet.
  await expect(entry(page, publishOnlyC, 'Publish', C.caption)).toHaveCount(1);
  const unscheduled = page.getByRole('region', { name: /Not scheduled yet/ });
  const mine = (caption: string) => unscheduled.locator('li').filter({ hasText: `@${handle}` }).filter({ hasText: caption });
  await expect(mine(C.caption)).toHaveCount(0);
  await expect(mine(A.caption)).toHaveCount(0);

  // Previous month and Today.
  await page.getByRole('button', { name: 'Previous month' }).click();
  await expect(heading(page)).toHaveText(monthName(new Date(now.getFullYear(), now.getMonth() + monthsAhead - 1, 1)));
  await page.getByRole('button', { name: 'Today' }).click();
  await expect(heading(page)).toHaveText(monthName(now));
  for (let i = 0; i < monthsAhead; i++) await page.getByRole('button', { name: 'Next month' }).click();
  await expect(heading(page)).toHaveText(monthName(filmA));

  // The Selected video panel.
  await entry(page, filmA, 'Film', A.caption).click();
  const panel = page.getByRole('region', { name: 'Selected video' });
  await expect(panel).toContainText(`@${handle} · `);
  await expect(panel).toContainText('Not started');
  await expect(panel.getByRole('heading')).toHaveText(A.caption);
  await expect(panel.getByLabel(`Film date for ${A.caption}`, { exact: true })).toHaveValue(isoDay(filmA));
  await expect(panel.getByLabel(`Publish date for ${A.caption}`, { exact: true })).toHaveValue(isoDay(publishA));
  await expect(panel.getByRole('group', { name: /Production checklist/ })).toBeVisible();

  // A tick updates the entries at once.
  const tick = saved(page);
  await panel.getByRole('checkbox', { name: 'Recording completed' }).check();
  await tick;
  await expect(entry(page, filmA, 'Film', A.caption)).toContainText('1/4');
  await expect(entry(page, publishA, 'Publish', A.caption)).toContainText('1/4');

  // A new film date moves the entry.
  const move = saved(page);
  await panel.getByLabel(`Film date for ${A.caption}`, { exact: true }).fill(isoDay(movedFilmA));
  await move;
  await expect(entry(page, movedFilmA, 'Film', A.caption)).toHaveCount(1);
  await expect(entry(page, filmA, 'Film', A.caption)).toHaveCount(0);

  // Clicking the selected entry again, or Close, hides the panel.
  await entry(page, movedFilmA, 'Film', A.caption).click();
  await expect(panel).toBeHidden();
  await entry(page, movedFilmA, 'Film', A.caption).click();
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toBeHidden();

  // B is unscheduled; giving it a film date moves it onto the calendar.
  const countHeading = page.getByRole('heading', { name: /^Not scheduled yet \d+$/ });
  await expect(mine(B.caption)).toHaveCount(1);
  const before = Number((await countHeading.innerText()).match(/(\d+)$/)![1]);
  expect(before).toBeGreaterThanOrEqual(1);
  const schedule = saved(page);
  await mine(B.caption).getByLabel(`Film date for ${B.caption}`, { exact: true }).fill(isoDay(filmB));
  await schedule;
  await expect(mine(B.caption)).toHaveCount(0);
  await expect(countHeading).toHaveText(`Not scheduled yet ${before - 1}`);
  await expect(entry(page, filmB, 'Film', B.caption)).toHaveCount(1);

  // After a reload: Board again; the calendar still has the saved entries.
  await page.reload();
  await expect(views.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true');
  await openCalendarAt(page, monthsAhead);
  await expect(heading(page)).toHaveText(monthName(filmA));
  await expect(entry(page, movedFilmA, 'Film', A.caption)).toContainText('1/4');
  await expect(entry(page, publishA, 'Publish', A.caption)).toHaveCount(1);
  await expect(entry(page, filmB, 'Film', B.caption)).toHaveCount(1);
  await expect(entry(page, publishOnlyC, 'Publish', C.caption)).toHaveCount(1);

  // Confirm the B entry is ours.
  await entry(page, filmB, 'Film', B.caption).click();
  await expect(panel).toContainText(`@${handle} · `);
});
