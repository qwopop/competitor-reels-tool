// Issue 58: Videos library grid and list views
import { expect, test, type Page } from '@playwright/test';
import { api, compact, filterVideosTo, LOAD_TIMEOUT, openVideosOf, seedChannel, type Video } from './helpers';

type FullVideo = Video & { commentCount: number; competitorId: string; thumbnailUrl: string };

function countLabel(n: number, word: string) {
  return `${compact(n)} ${n === 1 ? word : `${word}s`}`;
}

// The channel's videos in the API's (newest-first) order.
async function videosOf(request: Parameters<typeof api.list>[0], competitorId: string) {
  const all = await api.list<FullVideo[]>(request, '/videos');
  return all.filter((v) => v.competitorId === competitorId);
}

function layoutButtons(page: Page) {
  const group = page.getByRole('group', { name: 'Library layout' });
  return { grid: group.getByRole('button', { name: 'Grid' }), list: group.getByRole('button', { name: 'List' }) };
}

function listRows(page: Page) {
  return page.locator('ul > li').filter({ has: page.getByRole('button', { name: 'Remix' }) });
}

const META = (handle: string) => new RegExp(`^@${handle} · (today|\\d+d ago|\\d+w ago|\\d+mo ago|\\d+y ago)$`);

test('the library shows the channel in a grid by default, newest first, with details and actions', async ({ page, request }) => {
  test.slow(); // /videos first renders the whole shared library
  const { handle, competitor } = await seedChannel(request, 'browse');
  const videos = await videosOf(request, competitor.id);
  expect(videos).toHaveLength(15);
  await openVideosOf(page, handle);

  const { grid, list } = layoutButtons(page);
  await expect(grid).toHaveAttribute('aria-pressed', 'true');
  await expect(list).toHaveAttribute('aria-pressed', 'false');

  const cards = page.locator('article');
  await expect(cards).toHaveCount(15);
  await expect(cards.locator('h3')).toHaveText(videos.map((v) => v.caption));
  await expect(cards.first().locator('h3')).toHaveText(videos[0].caption);
  await expect(cards.last().locator('h3')).toHaveText(videos[14].caption);

  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    const card = cards.nth(i);
    await expect(card.locator('img')).toHaveAttribute('alt', v.caption);
    await expect(card.locator('p').first()).toHaveText(META(handle));
    await expect(card.locator('p.stat')).toHaveText(
      `${countLabel(v.viewCount, 'view')} · ${countLabel(v.likeCount, 'like')} · ${countLabel(v.commentCount, 'comment')}`
    );
    await expect(card.getByRole('button', { name: 'Add to plan' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Remix' })).toBeVisible();
    await expect(card.getByRole('link', { name: `Open @${handle} on YouTube` })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Preview' })).toHaveCount(0);
  }
});

test('List shows the same videos as rows, survives a filter change, and Grid or a reload bring the grid back', async ({ page, request }) => {
  // Switching to "All competitors" renders the whole shared library, more than once.
  test.setTimeout(180_000);
  const { handle, competitor } = await seedChannel(request, 'browse-list');
  const videos = await videosOf(request, competitor.id);
  const captions = videos.map((v) => v.caption);
  await openVideosOf(page, handle);
  const { grid, list } = layoutButtons(page);

  await list.click();
  await expect(list).toHaveAttribute('aria-pressed', 'true');
  await expect(grid).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('article')).toHaveCount(0);
  const rows = listRows(page);
  await expect(rows).toHaveCount(15);
  await expect(rows.locator('h3')).toHaveText(captions);
  for (let i = 0; i < 15; i++) {
    await expect(rows.nth(i).getByRole('button', { name: 'Add to plan' })).toBeVisible();
    await expect(rows.nth(i).getByRole('button', { name: 'Remix' })).toBeVisible();
  }

  // Changing the filter keeps the list layout.
  const filter = page.getByLabel('Competitor');
  await filter.selectOption({ label: 'All competitors' }, { timeout: LOAD_TIMEOUT });
  await expect(filter.locator('option:checked')).toHaveText('All competitors', { timeout: LOAD_TIMEOUT });
  await expect(list).toHaveAttribute('aria-pressed', 'true', { timeout: LOAD_TIMEOUT });
  await expect(page.locator('article')).toHaveCount(0);
  await filterVideosTo(page, handle);
  await expect(list).toHaveAttribute('aria-pressed', 'true');
  await expect(rows.locator('h3')).toHaveText(captions);

  await grid.click();
  await expect(grid).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('article')).toHaveCount(15);

  // The layout isn't remembered across a reload.
  await list.click();
  await expect(list).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByText('Loading your videos…')).toHaveCount(0, { timeout: LOAD_TIMEOUT });
  await expect(layoutButtons(page).grid).toHaveAttribute('aria-pressed', 'true');
  await expect(layoutButtons(page).list).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('article').first()).toBeVisible();
});
