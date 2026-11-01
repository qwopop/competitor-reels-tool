// Issue 71: Go to videos page.
import { expect, test } from '@playwright/test';
import { api } from './helpers';

test('Go to videos turns a channel into Videos and Shorts links without saving anything', async ({ page, request }) => {
  const before = (await api.list<unknown[]>(request, '/competitors')).length;
  await page.goto('/go-to-videos');
  const input = page.getByLabel('YouTube channel');
  const generate = page.getByRole('button', { name: 'Generate link' });

  await generate.click();
  await expect(page.getByRole('alert')).toHaveText('Please enter a channel.');
  await input.fill('https://youtu.be/AAAAAAAAAA1');
  await generate.click();
  await expect(page.getByRole('alert')).toContainText('video link');

  await input.fill('@mkbhd');
  await generate.click();
  const videos = page.getByRole('link', { name: /Watch videos @mkbhd/ });
  await expect(videos).toHaveAttribute('href', 'https://www.youtube.com/@mkbhd/videos');
  await expect(videos).toHaveAttribute('target', '_blank');
  await expect(page.getByRole('link', { name: /Shorts/ })).toHaveAttribute('href', 'https://www.youtube.com/@mkbhd/shorts');
  await expect(page.locator('code')).toHaveText('https://www.youtube.com/@mkbhd/videos');
  await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible();

  expect((await api.list<unknown[]>(request, '/competitors')).length).toBe(before);
});
