// Issue 61: Generate a remix
import { expect, test, type Page } from '@playwright/test';
import { filterVideosTo, LOAD_TIMEOUT, openVideosOf, seedChannel } from './helpers';

const FIELDS = ['Title', 'Hook', 'Script', 'Call to action'] as const;
const field = (page: Page, label: (typeof FIELDS)[number]) => page.getByLabel(label, { exact: true });

// The card for one video in the filtered library.
const cardOf = (page: Page, caption: string) => page.locator('article').filter({ has: page.getByRole('heading', { name: caption, exact: true }) });

test('Remix opens the editor with a full draft of that video', async ({ page, request }) => {
  test.slow(); // /videos renders the whole shared library
  const { handle, videos } = await seedChannel(request, 'remix');
  const video = videos[0];
  await openVideosOf(page, handle);
  await cardOf(page, video.caption).getByRole('button', { name: 'Remix' }).click();

  await expect(page).toHaveURL(/\/remix\/[^/]+$/);
  for (const label of FIELDS) await expect(field(page, label), label).not.toHaveValue('');
  const title = await field(page, 'Title').inputValue();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);

  const source = page.locator('section').filter({ has: page.getByRole('img', { name: video.caption }) });
  await expect(source).toContainText(video.caption);
  await expect(source).toContainText(`@${handle} · `);
  await expect(page.getByLabel('Remix template').locator('option:checked')).toHaveText('Default');

  await expect(page.getByText(/^Created /)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();

  await page.getByRole('link', { name: 'Back to videos' }).click();
  await expect(page).toHaveURL(/\/videos$/);
});

test('remixing the same video reopens its remix; another video gets its own', async ({ page, request }) => {
  // The library is loaded three times, and each load renders the whole shared database.
  test.setTimeout(300_000);
  const { handle, videos } = await seedChannel(request, 'remix-again');
  const [one, two] = videos;

  await openVideosOf(page, handle);
  await cardOf(page, one.caption).getByRole('button', { name: 'Remix' }).click();
  await expect(page).toHaveURL(/\/remix\/[^/]+$/);
  const firstUrl = page.url();
  const firstHook = await field(page, 'Hook').inputValue();
  const firstScript = await field(page, 'Script').inputValue();

  await openVideosOf(page, handle);
  await cardOf(page, one.caption).getByRole('button', { name: 'Remix' }).click();
  await expect(page).toHaveURL(firstUrl);

  // Listed once on the Remixes page.
  await page.goto('/remixes');
  await expect(page.locator('li').filter({ hasText: `@${handle} · updated` })).toHaveCount(1);

  // After a reload, only the remixed video has Preview.
  await page.goto('/videos');
  await page.reload();
  await expect(page.getByText('Loading your videos…')).toHaveCount(0, { timeout: LOAD_TIMEOUT });
  await filterVideosTo(page, handle);
  await expect(page.locator('article')).toHaveCount(15);
  await expect(cardOf(page, one.caption).getByRole('button', { name: 'Preview' })).toBeVisible();
  await expect(page.locator('article').getByRole('button', { name: 'Preview' })).toHaveCount(1);

  // A second video: a different remix with a different draft.
  await cardOf(page, two.caption).getByRole('button', { name: 'Remix' }).click();
  await expect(page).toHaveURL(/\/remix\/[^/]+$/);
  expect(page.url()).not.toBe(firstUrl);
  await expect(field(page, 'Hook')).not.toHaveValue('');
  const secondHook = await field(page, 'Hook').inputValue();
  const secondScript = await field(page, 'Script').inputValue();
  expect(secondHook === firstHook && secondScript === firstScript).toBe(false);
});

test('an unknown remix shows an error and no editor', async ({ page }) => {
  await page.goto('/remix/does-not-exist');
  await expect(page.getByText('Remix not found.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to videos' })).toBeVisible();
  for (const label of FIELDS) await expect(field(page, label)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
});
