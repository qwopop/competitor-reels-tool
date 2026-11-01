// Issue 63: Apply a remix template.
import { expect, test } from '@playwright/test';
import { api, seedChannel } from './helpers';

test('applying a template rewrites the draft, and asks first when there are unsaved edits', async ({ page, request }) => {
  const { videos } = await seedChannel(request, 'tpl');
  const remix = await api.remix(request, videos[0].id);
  await page.goto(`/remix/${remix.id}`);
  const hook = page.getByLabel('Hook', { exact: true });
  const original = await hook.inputValue();

  await page.getByLabel('Remix template').selectOption('educational');
  await page.getByRole('button', { name: 'Apply template' }).click();
  await expect(hook).not.toHaveValue(original);
  const educational = await hook.inputValue();

  // Unsaved edits: confirm first; Cancel keeps them.
  await hook.fill('My unsaved hook');
  await page.getByLabel('Remix template').selectOption('promotional');
  await page.getByRole('button', { name: 'Apply template' }).click();
  const dialog = page.getByRole('dialog', { name: 'Replace your edits?' });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(hook).toHaveValue('My unsaved hook');

  await page.getByRole('button', { name: 'Apply template' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apply template' }).click();
  await expect(hook).not.toHaveValue('My unsaved hook');
  await expect(hook).not.toHaveValue(educational);
});
