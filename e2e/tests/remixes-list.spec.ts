// Issue 64: Remixes page and quick preview
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { api, openVideosOf, seedChannel } from './helpers';

interface FullRemix {
  id: string;
  videoId: string;
  title: string;
  hook: string;
  script: string;
  cta: string;
}

async function twoRemixes(request: APIRequestContext, prefix: string) {
  const seeded = await seedChannel(request, prefix);
  const a = await api.remix(request, seeded.videos[0].id);
  const b = await api.remix(request, seeded.videos[1].id);
  const first = await api.list<FullRemix>(request, `/remixes/${a.id}`);
  const second = await api.list<FullRemix>(request, `/remixes/${b.id}`);
  return { ...seeded, first, second };
}

const entries = (page: Page, handle: string) => page.locator('li').filter({ hasText: `@${handle} · updated` });

test('the Remixes page lists remixes newest-updated first and opens the editor', async ({ page, request }) => {
  const { handle, first, second } = await twoRemixes(request, 'rmx');
  expect(first.hook === second.hook && first.title === second.title).toBe(false);

  await page.goto('/remixes');
  const items = entries(page, handle);
  await expect(items).toHaveCount(2);
  // The second remix was created last, so it comes first.
  await expect(items.nth(0).getByRole('heading')).toHaveText(second.title);
  await expect(items.nth(0)).toContainText(`Hook: ${second.hook}`);
  await expect(items.nth(1).getByRole('heading')).toHaveText(first.title);
  await expect(items.nth(1)).toContainText(`Hook: ${first.hook}`);

  // Editing the first remix moves it to the top.
  const newHook = `Edited hook ${handle}`;
  const res = await request.patch(`/api/remixes/${first.id}`, { data: { hook: newHook } });
  expect(res.ok()).toBeTruthy();
  await page.reload();
  await expect(items.nth(0)).toContainText(`Hook: ${newHook}`);
  await expect(items.nth(0).getByRole('heading')).toHaveText(first.title);
  await expect(items.nth(1).getByRole('heading')).toHaveText(second.title);

  const shownTitle = await items.nth(1).getByRole('heading').innerText();
  await items.nth(1).getByRole('link', { name: 'Open editor' }).click();
  await expect(page).toHaveURL(new RegExp(`/remix/${second.id}$`));
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(shownTitle);
});

test('Preview shows a remix from the library, and closes with Escape or Close', async ({ page, request }) => {
  const { handle, videos, first, second } = await twoRemixes(request, 'rmx-prev');
  await openVideosOf(page, handle);
  const cards = page.locator('article');
  await expect(cards).toHaveCount(15);
  await expect(cards.getByRole('button', { name: 'Preview' })).toHaveCount(2);
  const cardOf = (caption: string) => cards.filter({ has: page.getByRole('heading', { name: caption, exact: true }) });
  await expect(cardOf(videos[0].caption).getByRole('button', { name: 'Preview' })).toBeVisible();
  await expect(cardOf(videos[1].caption).getByRole('button', { name: 'Preview' })).toBeVisible();

  const previewButton = cardOf(videos[0].caption).getByRole('button', { name: 'Preview' });
  const panel = page.getByRole('complementary', { name: 'Remix preview' });

  await previewButton.click();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading')).toHaveText(first.title);
  for (const text of [first.hook, first.script, first.cta]) {
    await expect(panel).toContainText(text.replace(/\s+/g, ' ').trim());
  }
  await expect(panel).toContainText('Hook');
  await expect(panel).toContainText('Script');
  await expect(panel).toContainText('Call to action');

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(previewButton).toBeFocused();

  await previewButton.click();
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toBeHidden();

  await cardOf(videos[1].caption).getByRole('button', { name: 'Preview' }).click();
  await expect(panel.getByRole('heading')).toHaveText(second.title);
  await panel.getByRole('link', { name: 'Open editor' }).click();
  await expect(page).toHaveURL(new RegExp(`/remix/${second.id}$`));
});
