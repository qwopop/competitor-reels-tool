// Issue 56: Dashboard one-step Track & fetch
import { expect, test, type Page } from '@playwright/test';
import { competitorCard, uniqueHandle } from './helpers';

const anyPreview = /^Open .* on YouTube/;

function hero(page: Page) {
  return {
    input: page.getByLabel('YouTube channel link or @handle'),
    button: page.getByRole('button', { name: 'Track & fetch' }),
  };
}

// The sample source names a channel after its handle, first letter capitalised.
function sampleName(handle: string) {
  return handle.charAt(0).toUpperCase() + handle.slice(1);
}

// "Tracking N competitors · M videos · …", or zeros when the line is not shown (empty database).
async function trackingTotals(page: Page) {
  await expect(page.getByText('Loading your dashboard…')).toHaveCount(0);
  const line = page.getByText(/^Tracking \d+ competitors? · \d+ videos? · /);
  if ((await line.count()) === 0) return { competitors: 0, videos: 0 };
  const m = (await line.innerText()).match(/^Tracking (\d+) competitors? · (\d+) videos?/);
  expect(m, 'tracking line format').not.toBeNull();
  return { competitors: Number(m![1]), videos: Number(m![2]) };
}

test('Track & fetch is disabled while the field is empty or blank', async ({ page }) => {
  await page.goto('/');
  const { input, button } = hero(page);
  await expect(button).toBeDisabled();
  await input.fill('   ');
  await expect(button).toBeDisabled();
});

test('typing a handle shows a preview link; a non-YouTube link shows none and is rejected', async ({ page }) => {
  const handle = uniqueHandle('dash-prev');
  await page.goto('/');
  const { input, button } = hero(page);

  await input.fill(`@${handle}`);
  const preview = page.getByRole('link', { name: `Open @${handle} on YouTube` });
  await expect(preview).toHaveAttribute('href', `https://www.youtube.com/@${handle}/videos`);
  await expect(preview).toHaveAttribute('target', '_blank');

  await input.fill('https://twitter.com/someone');
  await expect(page.getByRole('link', { name: anyPreview })).toHaveCount(0);
  await button.click();
  await expect(page.getByRole('alert')).toContainText('YouTube channel link');

  await page.goto('/competitors');
  await expect(page.getByText('Loading competitors…')).toHaveCount(0);
  await expect(page.locator('li').filter({ hasText: '@someone · added' })).toHaveCount(0);
});

test('a video link previews the video and is rejected in sample mode', async ({ page }) => {
  await page.goto('/');
  const { input, button } = hero(page);
  await input.fill('https://youtu.be/dQw4w9WgXcQ');
  await expect(page.getByRole('link', { name: 'Open this video on YouTube' })).toBeVisible();
  await button.click();
  await expect(page.getByRole('alert')).toContainText(
    'Sample mode cannot look up a channel from a video link. Paste the channel link instead.'
  );
});

test('Track & fetch adds the channel with its videos, updates the totals, and tracking again adds no duplicate', async ({ page }) => {
  const handle = uniqueHandle('dash');
  const name = sampleName(handle);
  await page.goto('/');
  const before = await trackingTotals(page);
  const { input, button } = hero(page);

  await input.fill(`@${handle}`);
  await button.click();
  const notice = page.getByRole('status').filter({ hasText: `Pulled 15 videos from ${name}.` });
  await expect(notice).toBeVisible();
  await expect(input).toHaveValue('');
  // The channel link sits under the message.
  const underNotice = notice.locator('xpath=..').getByRole('link', { name: `Open @${handle} on YouTube` });
  await expect(underNotice).toHaveAttribute('href', `https://www.youtube.com/@${handle}/videos`);

  // Totals update without a reload.
  const expected = before.competitors + 1;
  const expectedVideos = before.videos + 15;
  await expect(page.getByText(/^Tracking \d+ competitors? · /)).toContainText(
    `Tracking ${expected} ${expected === 1 ? 'competitor' : 'competitors'} · ${expectedVideos} videos · `
  );

  await page.goto('/competitors');
  await expect(competitorCard(page, handle)).toHaveCount(1);
  await expect(competitorCard(page, handle)).toContainText('15 videos');

  // The same handle again.
  await page.goto('/');
  await hero(page).input.fill(`@${handle}`);
  await hero(page).button.click();
  await expect(page.getByRole('status').filter({ hasText: `Pulled 15 videos from ${name}.` })).toBeVisible();

  await page.goto('/competitors');
  await expect(competitorCard(page, handle)).toHaveCount(1);
  await expect(competitorCard(page, handle)).toContainText('15 videos');
});
