// Issue 72: Navigation and page titles.
import { expect, test } from '@playwright/test';

const PAGES = [
  { link: 'Competitors', path: '/competitors', title: 'Competitors', heading: /Track your/ },
  { link: 'Videos', path: '/videos', title: 'Videos', heading: /Browse/ },
  { link: 'Remixes', path: '/remixes', title: 'Remixes', heading: /Your/ },
  { link: 'Content Plan', path: '/content-plan', title: 'Content plan', heading: /content plan/ },
  { link: 'Go to videos', path: '/go-to-videos', title: 'Go to videos', heading: /Go to/ },
  { link: 'Dashboard', path: '/', title: 'Dashboard', heading: /Turn competitor videos/ },
];

test('every page is reachable from the navigation, marked and titled', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const p of PAGES) {
    await nav.getByRole('link', { name: p.link, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${p.path === '/' ? '/$' : p.path + '$'}`));
    await expect(page.getByRole('heading', { level: 1 })).toContainText(p.heading);
    await expect(page).toHaveTitle(`${p.title} · ClipRemix`);
    await expect(nav.getByRole('link', { name: p.link, exact: true })).toHaveAttribute('aria-current', 'page');
  }
});

test('deep links load on reload, and the header button opens Competitors', async ({ page }) => {
  await page.goto('/content-plan');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('content plan');

  await page.getByRole('banner').getByRole('link', { name: 'Add competitor' }).click();
  await expect(page).toHaveURL(/\/competitors$/);
});
