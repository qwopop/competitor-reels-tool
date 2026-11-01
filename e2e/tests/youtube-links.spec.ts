// Issue 60: YouTube links on videos and channels
import { expect, test, type Locator } from '@playwright/test';
import { api, competitorCard, openVideosOf, planCard, seedChannel, uniqueHandle } from './helpers';

const videosTab = (handle: string) => `https://www.youtube.com/@${handle}/videos`;

// The fallback link a sample video gets: the channel's Videos tab, in a new tab.
async function expectChannelLink(scope: Locator, handle: string) {
  const link = scope.getByRole('link', { name: `Open @${handle} on YouTube` });
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute('href', videosTab(handle));
  await expect(link).toHaveAttribute('target', '_blank');
  return link;
}

test('every library card and list row links to the channel in a new tab, with no Watch link', async ({ page, request }) => {
  const { handle } = await seedChannel(request, 'links');
  await openVideosOf(page, handle);

  const cards = page.locator('article');
  await expect(cards).toHaveCount(15);
  for (let i = 0; i < 15; i++) {
    const link = await expectChannelLink(cards.nth(i), handle);
    await expect(link).toHaveAttribute('rel', /\bnoopener\b/);
    await expect(link).toHaveAttribute('rel', /\bnoreferrer\b/);
    await expect(link).toHaveAccessibleName(/\(opens in a new tab\)/);
    await expect(cards.nth(i).getByRole('link', { name: /Watch on YouTube/ })).toHaveCount(0);
  }

  await page.getByRole('group', { name: 'Library layout' }).getByRole('button', { name: 'List' }).click();
  const rows = page.locator('ul > li').filter({ has: page.getByRole('button', { name: 'Remix' }) });
  await expect(rows).toHaveCount(15);
  for (let i = 0; i < 15; i++) await expectChannelLink(rows.nth(i), handle);
});

test('the remix editor, the plan card and the competitor card link to the channel', async ({ page, request }) => {
  const { handle, videos } = await seedChannel(request, 'links-pages');
  const remix = await api.remix(request, videos[0].id);
  await api.addToPlan(request, videos[1].id);

  // Remix editor: the source-video panel.
  await page.goto(`/remix/${remix.id}`);
  const source = page.locator('section').filter({ has: page.getByRole('img', { name: videos[0].caption }) });
  await expectChannelLink(source, handle);

  // Content plan card.
  await page.goto('/content-plan');
  await expectChannelLink(planCard(page, handle), handle);

  // Competitor card.
  await page.goto('/competitors');
  const channel = competitorCard(page, handle).getByRole('link', { name: 'Channel on YouTube' });
  await expect(channel).toHaveAttribute('href', videosTab(handle));
  await expect(channel).toHaveAttribute('target', '_blank');
  await expect(channel).toHaveAttribute('rel', /\bnoopener\b/);
});

test('a handle added with capitals links to the lowercase channel URL', async ({ page, request }) => {
  const handle = uniqueHandle('caps');
  const typed = handle.charAt(0).toUpperCase() + handle.slice(1, 4).toUpperCase() + handle.slice(4);
  const competitor = await api.addCompetitor(request, typed);
  await api.fetchVideos(request, competitor.id);

  await page.goto('/competitors');
  const channel = competitorCard(page, handle).getByRole('link', { name: 'Channel on YouTube' });
  await expect(channel).toHaveAttribute('href', videosTab(handle));

  await openVideosOf(page, handle);
  await expectChannelLink(page.locator('article').first(), handle);
});
