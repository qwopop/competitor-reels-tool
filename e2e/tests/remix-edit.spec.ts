// Issue 62: Edit and save a remix
import { expect, test, type Page } from '@playwright/test';
import { api, seedChannel } from './helpers';

const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });

async function newRemix(request: Parameters<typeof seedChannel>[0], prefix: string) {
  const { handle, videos } = await seedChannel(request, prefix);
  const remix = await api.remix(request, videos[0].id);
  return { handle, remix, tag: handle };
}

test('editing shows unsaved changes, saving persists all four fields everywhere', async ({ page, request }) => {
  const { handle, remix, tag } = await newRemix(request, 'edit');
  await page.goto(`/remix/${remix.id}`);
  const save = page.getByRole('button', { name: 'Save changes' });
  await expect(save).toBeDisabled();
  await expect(page.getByText(/^Created /)).toBeVisible();

  const edits = {
    Title: `Title ${tag}`,
    Hook: `Hook ${tag}`,
    Script: `1. Open ${tag}\n2. Show it\n3. Wrap up`,
    'Call to action': `CTA ${tag}`,
  };

  // Title updates the heading as you type; one edit is enough to mark the page dirty.
  await field(page, 'Title').fill(edits.Title);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(edits.Title);
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await expect(save).toBeEnabled();

  for (const [label, value] of Object.entries(edits)) await field(page, label).fill(value);
  await save.click();
  await expect(page.getByText(/^Saved (today|\d+\w* ago)$/)).toBeVisible();
  await expect(save).toBeDisabled();

  await page.reload();
  for (const [label, value] of Object.entries(edits)) await expect(field(page, label)).toHaveValue(value);

  await page.goto('/remixes');
  const item = page.locator('li').filter({ hasText: `@${handle} · updated` });
  await expect(item).toContainText(edits.Title);
  await expect(item).toContainText(`Hook: ${edits.Hook}`);
});

test('a single field edit enables saving; unsaved edits are dropped on reload', async ({ page, request }) => {
  const { remix, tag } = await newRemix(request, 'edit-drop');
  await page.goto(`/remix/${remix.id}`);
  const save = page.getByRole('button', { name: 'Save changes' });
  const savedCta = await field(page, 'Call to action').inputValue();

  await field(page, 'Call to action').fill(`Unsaved ${tag}`);
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await expect(save).toBeEnabled();

  await page.reload();
  await expect(field(page, 'Call to action')).toHaveValue(savedCta);
  await expect(save).toBeDisabled();
});

test('a cleared title saves as "Untitled remix"', async ({ page, request }) => {
  const { remix } = await newRemix(request, 'edit-empty');
  await page.goto(`/remix/${remix.id}`);
  await field(page, 'Title').fill('');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(/^Saved (today|\d+\w* ago)$/)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled remix');
  await page.reload();
  await expect(field(page, 'Title')).toHaveValue('');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled remix');
});

test('the fields limit their length', async ({ page, request }) => {
  const { remix } = await newRemix(request, 'edit-max');
  await page.goto(`/remix/${remix.id}`);
  for (const [label, max] of [['Title', '500'], ['Hook', '1000'], ['Script', '2000'], ['Call to action', '500']]) {
    await expect(field(page, label), label).toHaveAttribute('maxlength', max);
  }
});
