// Issue 56: Dashboard one-step Track & fetch.
import { expect, test } from '@playwright/test';
import { competitorCard, uniqueHandle } from './helpers';

test('track and fetch a channel in one step from the dashboard', async ({ page }) => {
  const handle = uniqueHandle('dash');
  await page.goto('/');
  const input = page.getByLabel('YouTube channel link or @handle');
  const button = page.getByRole('button', { name: 'Track & fetch' });
  await expect(button).toBeDisabled();

  await input.fill(`@${handle}`);
  await expect(page.getByRole('link', { name: `Open @${handle} on YouTube` })).toBeVisible();
  await button.click();
  const name = handle.charAt(0).toUpperCase() + handle.slice(1);
  await expect(page.getByText(`Pulled 15 videos from ${name}.`)).toBeVisible();

  await page.goto('/competitors');
  await expect(competitorCard(page, handle)).toContainText('15 videos');
});
