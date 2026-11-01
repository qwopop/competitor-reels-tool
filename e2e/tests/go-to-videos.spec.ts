// Issue 71: Go to videos page
import { expect, test, type Page } from '@playwright/test';
import { api, competitorCard, uniqueHandle } from './helpers';

function form(page: Page) {
  return {
    input: page.getByLabel('YouTube channel'),
    generate: page.getByRole('button', { name: 'Generate link' }),
    alert: page.getByRole('alert'),
    watch: page.getByRole('link', { name: /^Watch videos / }),
    shorts: page.getByRole('link', { name: /^Shorts/ }),
  };
}

async function generate(page: Page, value: string) {
  const f = form(page);
  await f.input.fill(value);
  await f.generate.click();
}

async function expectHandleLinks(page: Page, handle: string) {
  const f = form(page);
  await expect(f.watch).toHaveAccessibleName(new RegExp(`^Watch videos @${handle}\\b`));
  await expect(f.watch).toHaveAttribute('href', `https://www.youtube.com/@${handle}/videos`);
  await expect(f.shorts).toHaveAttribute('href', `https://www.youtube.com/@${handle}/shorts`);
  await expect(f.alert).toHaveCount(0);
}

test('empty, blank, video and non-YouTube input show errors and no links', async ({ page }) => {
  await page.goto('/go-to-videos');
  const f = form(page);

  await f.generate.click();
  await expect(f.alert).toHaveText('Please enter a channel.');
  await expect(f.input).toHaveAttribute('aria-invalid', 'true');
  await expect(f.watch).toHaveCount(0);
  await expect(f.shorts).toHaveCount(0);

  await generate(page, '   ');
  await expect(f.alert).toHaveText('Please enter a channel.');

  await generate(page, 'https://youtu.be/AAAAAAAAAA1');
  await expect(f.alert).toHaveText('That is a video link. Paste the channel link or @handle instead.');
  await expect(f.watch).toHaveCount(0);

  await generate(page, 'https://twitter.com/someone');
  await expect(f.alert).toHaveText('That is not a YouTube channel. Try @mkbhd or https://www.youtube.com/@mkbhd.');
  await expect(f.watch).toHaveCount(0);
});

test('a handle gives Videos and Shorts links, in every spelling, and nothing is saved', async ({ page, request }) => {
  const handle = uniqueHandle('goto');
  const before = (await api.list<unknown[]>(request, '/competitors')).length;
  await page.goto('/go-to-videos');
  const f = form(page);

  // An error first, so we can see it go away.
  await f.generate.click();
  await expect(f.alert).toBeVisible();

  await generate(page, `@${handle}`);
  await expectHandleLinks(page, handle);
  for (const link of [f.watch, f.shorts]) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
  await expect(page.locator('code')).toHaveText(`https://www.youtube.com/@${handle}/videos`);
  await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible();

  for (const spelling of [handle, `@${handle.toUpperCase()}`, `https://www.youtube.com/@${handle}`]) {
    await generate(page, spelling);
    await expectHandleLinks(page, handle);
  }

  // Invalid input after a result hides the links.
  await generate(page, 'https://twitter.com/someone');
  await expect(f.alert).toBeVisible();
  await expect(f.watch).toHaveCount(0);
  await expect(f.shorts).toHaveCount(0);

  expect((await api.list<unknown[]>(request, '/competitors')).length).toBe(before);
  await page.goto('/competitors');
  await expect(page.getByText('Loading competitors…')).toHaveCount(0);
  await expect(competitorCard(page, handle)).toHaveCount(0);
});

test('a channel ID and a /c/ link give their own Videos links', async ({ page }) => {
  await page.goto('/go-to-videos');
  const f = form(page);
  const id = 'UC' + 'abcdefghijklmnopqrstuv'.slice(0, 22);

  await generate(page, id);
  await expect(f.watch).toHaveAccessibleName(new RegExp(`^Watch videos ${id}\\b`));
  await expect(f.watch).toHaveAttribute('href', `https://www.youtube.com/channel/${id}/videos`);

  const name = uniqueHandle('cname');
  await generate(page, `https://www.youtube.com/c/${name}`);
  await expect(f.watch).toHaveAttribute('href', `https://www.youtube.com/c/${name}/videos`);
});

test('Copy link copies the Videos link', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const handle = uniqueHandle('goto-copy');
  await page.goto('/go-to-videos');
  await generate(page, `@${handle}`);
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`https://www.youtube.com/@${handle}/videos`);
});
