// Issue 60: YouTube links on videos and channels.
import { expect, test } from '@playwright/test';
import { competitorCard, openVideosOf, seedChannel } from './helpers';

test('videos and competitor cards link to YouTube in a new tab', async ({ page, request }) => {
  const { handle } = await seedChannel(request, 'links');
  const channelVideos = `https://www.youtube.com/@${handle}/videos`;

  await openVideosOf(page, handle);
  // Sample videos have no real page, so they open the channel's Videos tab.
  const link = page.locator('article').first().getByRole('link', { name: `Open @${handle} on YouTube` });
  await expect(link).toHaveAttribute('href', channelVideos);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);

  await page.goto('/competitors');
  const channel = competitorCard(page, handle).getByRole('link', { name: 'Channel on YouTube' });
  await expect(channel).toHaveAttribute('href', channelVideos);
  await expect(channel).toHaveAttribute('target', '_blank');
});
