// Issue 72: Navigation and page titles
import { expect, test, type Page } from '@playwright/test';
import { api, seedChannel } from './helpers';

const PAGES = [
  { link: 'Dashboard', path: '/', title: 'Dashboard', heading: 'Turn competitor videos' },
  { link: 'Competitors', path: '/competitors', title: 'Competitors', heading: 'Track your competitors' },
  { link: 'Videos', path: '/videos', title: 'Videos', heading: 'Browse videos' },
  { link: 'Remixes', path: '/remixes', title: 'Remixes', heading: 'Your remixes' },
  { link: 'Content Plan', path: '/content-plan', title: 'Content plan', heading: 'Your content plan' },
  { link: 'Go to videos', path: '/go-to-videos', title: 'Go to videos', heading: 'Go to videos' },
];

const urlFor = (path: string) => new RegExp(`^[^?#]*?//[^/]+${path === '/' ? '/' : path}$`);
const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });

async function expectOnlyCurrent(page: Page, current: string | null) {
  for (const p of PAGES) {
    const link = nav(page).getByRole('link', { name: p.link, exact: true });
    if (p.link === current) await expect(link, p.link).toHaveAttribute('aria-current', 'page');
    else await expect(link, p.link).not.toHaveAttribute('aria-current', 'page');
  }
}

test('the Main navigation has the six links in order', async ({ page }) => {
  await page.goto('/');
  await expect(nav(page).getByRole('link')).toHaveText(PAGES.map((p) => p.link));
});

test('each navigation link opens its page, with heading, tab title and current marker', async ({ page }) => {
  await page.goto('/go-to-videos');
  for (const p of PAGES) {
    await nav(page).getByRole('link', { name: p.link, exact: true }).click();
    await expect(page).toHaveURL(urlFor(p.path));
    await expect(page.getByRole('heading', { level: 1 })).toContainText(p.heading);
    await expect(page).toHaveTitle(`${p.title} · ClipRemix`);
    await expectOnlyCurrent(page, p.link);
  }
});

test('the remix editor has its own title and no current link', async ({ page, request }) => {
  const { videos } = await seedChannel(request, 'nav');
  const remix = await api.remix(request, videos[0].id);
  await page.goto(`/remix/${remix.id}`);
  await expect(page.getByLabel('Title', { exact: true })).toBeVisible();
  await expect(page).toHaveTitle('Edit remix · ClipRemix');
  await expectOnlyCurrent(page, null);
});

test('every path loads directly and on reload, served by the app', async ({ page, request }) => {
  const { videos } = await seedChannel(request, 'nav-deep');
  const remix = await api.remix(request, videos[0].id);

  for (const p of PAGES) {
    const res = await page.goto(p.path);
    expect(res?.status(), p.path).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(p.heading);
    const again = await page.reload();
    expect(again?.status(), `${p.path} reload`).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(p.heading);
    await expect(page).toHaveTitle(`${p.title} · ClipRemix`);
  }

  const res = await page.goto(`/remix/${remix.id}`);
  expect(res?.status()).toBe(200);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(remix.title);
  expect((await page.reload())?.status()).toBe(200);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(remix.title);
  await expect(page).toHaveTitle('Edit remix · ClipRemix');
});

test('an unknown path ends on the Dashboard', async ({ page }) => {
  await page.goto('/no-such-page');
  await expect(page).toHaveURL(urlFor('/'));
  await expect(page).toHaveTitle('Dashboard · ClipRemix');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Turn competitor videos');
});

test('the wordmark, the header button and the Back button navigate', async ({ page }) => {
  await page.goto('/videos');
  await page.getByRole('banner').getByRole('link', { name: 'ClipRemix' }).click();
  await expect(page).toHaveURL(urlFor('/'));
  await expect(page).toHaveTitle('Dashboard · ClipRemix');

  await page.getByRole('banner').getByRole('link', { name: 'Add competitor' }).click();
  await expect(page).toHaveURL(urlFor('/competitors'));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Track your competitors');

  await nav(page).getByRole('link', { name: 'Remixes', exact: true }).click();
  await expect(page).toHaveURL(urlFor('/remixes'));
  await page.goBack();
  await expect(page).toHaveURL(urlFor('/competitors'));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Track your competitors');
  await expect(page).toHaveTitle('Competitors · ClipRemix');
  await page.goBack();
  await expect(page).toHaveURL(urlFor('/'));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Turn competitor videos');
  await expect(page).toHaveTitle('Dashboard · ClipRemix');
});
