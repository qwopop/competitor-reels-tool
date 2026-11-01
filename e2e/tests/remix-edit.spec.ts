// Issue 62: Edit and save a remix.
import { expect, test } from '@playwright/test';
import { api, seedChannel } from './helpers';

test('edit all fields, save manually, and the edits persist', async ({ page, request }) => {
  const { videos } = await seedChannel(request, 'edit');
  const remix = await api.remix(request, videos[0].id);
  await page.goto(`/remix/${remix.id}`);

  const save = page.getByRole('button', { name: 'Save changes' });
  await expect(save).toBeDisabled();

  const edits = {
    Title: 'My own title',
    Hook: 'A hook in my own words.',
    Script: '1. Open\n2. Show it\n3. Wrap up',
    'Call to action': 'Follow for part two.',
  };
  for (const [field, value] of Object.entries(edits)) await page.getByLabel(field, { exact: true }).fill(value);
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await expect(save).toBeEnabled();

  await save.click();
  await expect(page.getByText(/^Saved (today|\d+\w* ago)$/)).toBeVisible();
  await expect(save).toBeDisabled();

  await page.reload();
  for (const [field, value] of Object.entries(edits)) await expect(page.getByLabel(field, { exact: true })).toHaveValue(value);
});
