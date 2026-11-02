// Issue 65: Add a video to the Content Plan
import { expect, test, type Page } from '@playwright/test';
import { api, filterVideosTo, LOAD_TIMEOUT, openVideosOf, planCard, seedChannel } from './helpers';

// Opens the Content Plan and waits until the whole (shared, large) plan has loaded.
async function openPlan(page: Page) {
  await page.goto('/content-plan');
  await expect(page.getByText('Loading your plan…')).toHaveCount(0, { timeout: LOAD_TIMEOUT });
}

const cardOf = (page: Page, caption: string) =>
  page.locator('article').filter({ has: page.getByRole('heading', { name: caption, exact: true }) });
const planCardOf = (page: Page, handle: string, caption: string) => planCard(page, handle).filter({ hasText: caption });
const column = (page: Page, label: string) => page.getByRole('region', { name: new RegExp(label) });

test('Add to plan from the library and from the editor, never twice, and kept after a refetch', async ({ page, request }) => {
  // The library is opened four times, and each open renders the whole shared database.
  test.setTimeout(300_000);
  const { handle, competitor, videos } = await seedChannel(request, 'padd');
  const [A, B, C] = videos;

  // A: from the Videos page.
  await openVideosOf(page, handle);
  await cardOf(page, A.caption).getByRole('button', { name: 'Add to plan' }).click();
  await expect(page.getByText('Added to your Content Plan.')).toBeVisible();
  await expect(cardOf(page, A.caption)).toContainText('❌ In content plan');
  await expect(cardOf(page, A.caption).getByRole('button', { name: 'Add to plan' })).toHaveCount(0);

  // C: planned behind the open page's back, then clicked in the page.
  await api.addToPlan(request, C.id);
  await cardOf(page, C.caption).getByRole('button', { name: 'Add to plan' }).click();
  await expect(cardOf(page, C.caption)).toContainText('In content plan');

  // After a reload: A planned, others (except C) still offer Add to plan.
  await page.reload();
  await expect(page.getByText('Loading your videos…')).toHaveCount(0, { timeout: LOAD_TIMEOUT });
  await filterVideosTo(page, handle);
  await expect(cardOf(page, A.caption)).toContainText('In content plan');
  for (const v of videos.filter((x) => x.id !== A.id && x.id !== C.id)) {
    await expect(cardOf(page, v.caption).getByRole('button', { name: 'Add to plan' })).toBeVisible();
  }

  await openPlan(page);
  const cardA = column(page, 'Not started').locator('li').filter({ hasText: `@${handle} · added` }).filter({ hasText: A.caption });
  await expect(cardA).toHaveCount(1);
  await expect(cardA).toContainText('No breakdown yet.');
  await expect(cardA.getByRole('button', { name: 'Create breakdown' })).toBeVisible();
  await expect(planCardOf(page, handle, C.caption)).toHaveCount(1);

  // B: from the remix editor.
  const remixB = await api.remix(request, B.id);
  await page.goto(`/remix/${remixB.id}`);
  await page.getByRole('button', { name: 'Add to plan' }).click();
  await expect(page.getByText('❌ In content plan')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to plan' })).toHaveCount(0);
  await openPlan(page);
  await expect(column(page, 'Not started').locator('li').filter({ hasText: `@${handle} · added` }).filter({ hasText: B.caption })).toHaveCount(1);

  // An editor for an already planned video.
  const remixA = await api.remix(request, A.id);
  await page.goto(`/remix/${remixA.id}`);
  await expect(page.getByText('In content plan')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to plan' })).toHaveCount(0);

  // Status shows in the library.
  const plan = await api.list<{ id: string; videoId: string }[]>(request, '/content-plan');
  const itemA = plan.find((p) => p.videoId === A.id)!;
  await api.updatePlan(request, itemA.id, { status: 'ready' });
  await openVideosOf(page, handle);
  await expect(cardOf(page, A.caption)).toContainText('⏳ In content plan');

  // Refetch keeps the plan.
  await api.fetchVideos(request, competitor.id);
  await openPlan(page);
  for (const v of [A, B, C]) await expect(planCardOf(page, handle, v.caption), v.caption).toHaveCount(1);
  await openVideosOf(page, handle);
  await expect(cardOf(page, A.caption).filter({ hasText: 'In content plan' })).toHaveCount(1);
});
