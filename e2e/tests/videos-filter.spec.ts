// Issue 59: Videos filter, search and sort
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { api, openVideosOf, seedChannel, type Video } from './helpers';

type FullVideo = Video & { competitorId: string; postedAt: string };

// A channel's videos in the API's newest-first order.
async function videosOf(request: APIRequestContext, competitorId: string) {
  const all = await api.list<FullVideo[]>(request, '/videos');
  return all.filter((v) => v.competitorId === competitorId);
}

const cardCaptions = (page: Page) => page.locator('article h3');

test('the Competitor filter lists each channel once and shows only its videos', async ({ page, request }) => {
  const a = await seedChannel(request, 'filter-a');
  const b = await seedChannel(request, 'filter-b');
  await page.goto('/videos');
  const filter = page.getByLabel('Competitor');
  await expect(page.locator('article').first()).toBeVisible();

  await expect(filter.locator('option', { hasText: /^All competitors$/ })).toHaveCount(1);
  await expect(filter.locator('option', { hasText: new RegExp(`^@${a.handle}$`) })).toHaveCount(1);
  await expect(filter.locator('option', { hasText: new RegExp(`^@${b.handle}$`) })).toHaveCount(1);

  const cards = page.locator('article');
  for (const handle of [a.handle, b.handle]) {
    await filter.selectOption({ label: `@${handle}` });
    await expect(cards).toHaveCount(15);
    await expect(cards.filter({ hasNotText: `@${handle} · ` })).toHaveCount(0);
  }

  await filter.selectOption({ label: 'All competitors' });
  await expect(cards.filter({ hasText: `@${a.handle} · ` }).first()).toBeVisible();
  await expect(cards.filter({ hasText: `@${b.handle} · ` }).first()).toBeVisible();
});

test('search matches captions, ignoring case and spaces, within the chosen competitor', async ({ page, request }) => {
  const a = await seedChannel(request, 'search-a');
  const b = await seedChannel(request, 'search-b');
  const aVideos = await videosOf(request, a.competitor.id);
  const expected = aVideos.filter((v) => v.caption.toLowerCase().includes('schema')).map((v) => v.caption);
  expect(expected).toContain('AI wrote my database schema in 90 seconds');

  await openVideosOf(page, a.handle);
  const search = page.getByLabel('Search captions');
  const cards = page.locator('article');

  await search.fill('schema');
  await expect(cardCaptions(page)).toHaveText(expected);
  await expect(cards.filter({ hasNotText: `@${a.handle} · ` })).toHaveCount(0);

  await search.fill('  SCHEMA  ');
  await expect(cardCaptions(page)).toHaveText(expected);

  // All competitors: both channels' matching video.
  await search.fill('schema');
  await page.getByLabel('Competitor').selectOption({ label: 'All competitors' });
  await expect(cards.filter({ hasText: `@${a.handle} · ` })).toHaveCount(expected.length);
  await expect(cards.filter({ hasText: `@${b.handle} · ` })).toHaveCount(expected.length);
  await expect(cards.filter({ hasText: `@${b.handle} · ` }).first()).toContainText('AI wrote my database schema in 90 seconds');
});

test('a search with no match shows an empty state, and Clear filters resets everything', async ({ page, request }) => {
  const a = await seedChannel(request, 'clear-a');
  await openVideosOf(page, a.handle);
  await page.getByLabel('Sort by').selectOption({ label: 'Most views' });
  await page.getByLabel('Search captions').fill('zzz-no-such-caption');

  await expect(page.getByText('No videos match these filters.')).toBeVisible();
  await expect(page.locator('article')).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear filters' }).click();

  await expect(page.getByLabel('Search captions')).toHaveValue('');
  await expect(page.getByLabel('Competitor').locator('option:checked')).toHaveText('All competitors');
  await expect(page.getByLabel('Sort by').locator('option:checked')).toHaveText('Newest');
  await expect(page.locator('article').first()).toBeVisible();
  await expect(page.getByText('No videos match these filters.')).toHaveCount(0);
});

test('sorting by most views, most likes and back to newest orders the cards', async ({ page, request }) => {
  const a = await seedChannel(request, 'sort-a');
  const newest = await videosOf(request, a.competitor.id);
  // Stable sorts on the newest-first list, so ties stay newest first as in the app.
  const byViews = [...newest].sort((x, y) => y.viewCount - x.viewCount).map((v) => v.caption);
  const byLikes = [...newest].sort((x, y) => y.likeCount - x.likeCount).map((v) => v.caption);

  await openVideosOf(page, a.handle);
  const sort = page.getByLabel('Sort by');
  await expect(cardCaptions(page)).toHaveText(newest.map((v) => v.caption));

  await sort.selectOption({ label: 'Most views' });
  await expect(cardCaptions(page)).toHaveText(byViews);

  await sort.selectOption({ label: 'Most likes' });
  await expect(cardCaptions(page)).toHaveText(byLikes);

  await sort.selectOption({ label: 'Newest' });
  await expect(cardCaptions(page)).toHaveText(newest.map((v) => v.caption));
});
