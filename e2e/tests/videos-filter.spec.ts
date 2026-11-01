// Issue 59: Videos filter, search and sort.
import { expect, test } from '@playwright/test';
import { openVideosOf, seedChannel } from './helpers';

function parseCount(text: string, word: string): number {
  const m = text.match(new RegExp(`([\\d.]+)([KM]?) ${word}`));
  if (!m) return 0;
  return Number(m[1]) * (m[2] === 'M' ? 1e6 : m[2] === 'K' ? 1e3 : 1);
}

test('filter by competitor, search captions and sort by views or likes', async ({ page, request }) => {
  const one = await seedChannel(request, 'filter-a');
  await seedChannel(request, 'filter-b');

  await openVideosOf(page, one.handle);
  const cards = page.locator('article');
  await expect(cards).toHaveCount(15);
  await expect(cards.filter({ hasNotText: `@${one.handle}` })).toHaveCount(0);

  // Search: one distinctive word from a caption.
  await page.getByLabel('Search captions').fill('schema');
  const matching = one.videos.filter((v) => v.caption.toLowerCase().includes('schema'));
  await expect(cards).toHaveCount(matching.length);
  await page.getByLabel('Search captions').fill('zzz-no-such-caption');
  await expect(page.getByText('No videos match these filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByLabel('Search captions')).toHaveValue('');

  // Sorts (back on this channel only).
  await page.getByLabel('Competitor').selectOption({ label: `@${one.handle}` });
  for (const [option, word] of [['views', 'views'], ['likes', 'likes']] as const) {
    await page.getByLabel('Sort by').selectOption(option);
    await expect(cards).toHaveCount(15);
    const stats = await cards.locator('p.stat').allInnerTexts();
    const values = stats.map((s) => parseCount(s, word));
    expect(values, `sorted by ${option}`).toEqual([...values].sort((a, b) => b - a));
  }
});
