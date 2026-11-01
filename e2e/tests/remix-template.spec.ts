// Issue 63: Apply a remix template
import { expect, test, type Page } from '@playwright/test';
import { api, seedChannel } from './helpers';

const SAVED = /^Saved (today|\d+\w* ago)$/;

function editor(page: Page) {
  return {
    picker: page.getByLabel('Remix template'),
    apply: page.getByRole('button', { name: 'Apply template' }),
    hook: page.getByLabel('Hook', { exact: true }),
    script: page.getByLabel('Script', { exact: true }),
    save: page.getByRole('button', { name: 'Save changes' }),
  };
}

test('applying a template with no edits rewrites the draft straight away, and Default comes back the same', async ({ page, request }) => {
  const { videos } = await seedChannel(request, 'tpl');
  const remix = await api.remix(request, videos[0].id);
  await page.goto(`/remix/${remix.id}`);
  const e = editor(page);

  await expect(e.picker.locator('option')).toHaveText(['Default', 'Educational', 'Storytelling', 'Promotional']);
  await expect(e.picker.locator('option:checked')).toHaveText('Default');
  await expect(e.hook).not.toHaveValue('');
  const defaultHook = await e.hook.inputValue();
  const defaultScript = await e.script.inputValue();

  await e.picker.selectOption({ label: 'Educational' });
  await e.apply.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(SAVED)).toBeVisible();
  const eduHook = await e.hook.inputValue();
  const eduScript = await e.script.inputValue();
  expect(eduHook !== defaultHook || eduScript !== defaultScript, 'Educational differs from Default').toBe(true);

  await page.reload();
  await expect(e.hook).toHaveValue(eduHook);
  await expect(e.script).toHaveValue(eduScript);

  await e.picker.selectOption({ label: 'Default' });
  await e.apply.click();
  await expect(e.hook).toHaveValue(defaultHook);
});

test('applying over unsaved edits asks first; Cancel and Escape keep the edits, confirming replaces them', async ({ page, request }) => {
  const { handle, videos } = await seedChannel(request, 'tpl-confirm');
  const remix = await api.remix(request, videos[0].id);
  await page.goto(`/remix/${remix.id}`);
  const e = editor(page);
  const typed = `My unsaved hook ${handle}`;
  const dialog = page.getByRole('dialog', { name: 'Replace your edits?' });

  await e.hook.fill(typed);
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await e.picker.selectOption({ label: 'Promotional' });

  await e.apply.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(e.hook).toHaveValue(typed);
  await expect(page.getByText('Unsaved changes')).toBeVisible();

  await e.apply.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(e.hook).toHaveValue(typed);

  await e.apply.click();
  await dialog.getByRole('button', { name: 'Apply template' }).click();
  await expect(dialog).toBeHidden();
  await expect(e.hook).not.toHaveValue(typed);
  await expect(e.hook).not.toHaveValue('');
  await expect(page.getByText(SAVED)).toBeVisible();
  await expect(e.save).toBeDisabled();
});
