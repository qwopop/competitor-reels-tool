// Issue 96: Write the remix (title, hook, script, CTA) with Gemini in a chosen creator voice.
// The compose stack runs without GEMINI_API_KEY, so this checks the "not set up" path end to end.
import { expect, test } from '@playwright/test';
import { api, LOAD_TIMEOUT, openVideosOf, seedChannel } from './helpers';

const NOT_SET_UP = 'AI writing is not set up on this server. Ask the owner to set GEMINI_API_KEY. Templates still work.';
const SAVED = /^Saved (today|\d+\w* ago)$/;

test('without a Gemini key, Write with AI says it is not set up, keeps the text, and templates still work', async ({ page, request }) => {
  const { videos } = await seedChannel(request, 'ai');
  const remix = await api.remix(request, videos[0].id);
  await page.goto(`/remix/${remix.id}`);

  const title = page.getByLabel('Title', { exact: true });
  const hook = page.getByLabel('Hook', { exact: true });
  const script = page.getByLabel('Script', { exact: true });
  const cta = page.getByLabel('Call to action', { exact: true });
  const write = page.getByRole('button', { name: 'Write with AI' });

  await expect(page.getByRole('heading', { name: 'Write with AI' })).toBeVisible();
  await expect(page.getByLabel('Creator voice').locator('option:checked')).toHaveText('Educational blogger');
  await expect(hook).not.toHaveValue('');
  const before = [await title.inputValue(), await hook.inputValue(), await script.inputValue(), await cta.inputValue()];

  await page.getByLabel('Creator voice').selectOption({ label: 'Storyteller' });
  await page.getByLabel('Extra instructions (optional)').fill('Keep it under 45 seconds.');
  await write.click();

  await expect(page.getByText(NOT_SET_UP)).toBeVisible();
  await expect(write).toBeEnabled();
  await expect(write).toBeFocused();
  expect([await title.inputValue(), await hook.inputValue(), await script.inputValue(), await cta.inputValue()]).toEqual(before);
  await expect(page.getByText('Unsaved changes')).toHaveCount(0);

  // The four fields stay editable and savable.
  await hook.fill('My own hook after the AI message');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(SAVED)).toBeVisible();

  // Apply template still works.
  await page.getByLabel('Remix template').selectOption({ label: 'Educational' });
  await page.getByRole('button', { name: 'Apply template' }).click();
  await expect(hook).not.toHaveValue('My own hook after the AI message');
  await expect(hook).not.toHaveValue('');
  await expect(page.getByText(SAVED)).toBeVisible();

  await page.reload();
  await expect(hook).not.toHaveValue('My own hook after the AI message');
  await expect(page.getByText(NOT_SET_UP)).toHaveCount(0);
});

// Issue 99: Write with AI on a video card creates the remix and opens the AI block ready.
test('Write with AI on a video opens its remix with Creator voice focused, without calling Gemini', async ({ page, request }) => {
  test.slow(); // /videos renders the whole shared library
  const { handle, videos } = await seedChannel(request, 'ai-card');
  const video = videos[0];
  await openVideosOf(page, handle);
  await page.getByRole('button', { name: `Write with AI: ${video.caption.slice(0, 80)}`, exact: true }).first().click();

  await expect(page).toHaveURL(/\/remix\/[^/?]+$/, { timeout: LOAD_TIMEOUT });
  await expect(page.getByLabel('Creator voice')).toBeFocused();
  const intro = page.getByText('Pick a voice, then press Write with AI. Nothing changes until you press Save changes.');
  await expect(intro).toBeVisible();
  // No AI write ran: no Gemini message, nothing unsaved.
  await expect(page.getByText(NOT_SET_UP)).toHaveCount(0);
  await expect(page.getByText('Unsaved changes')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();

  // The parameter is gone, so a reload shows the page as usual.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Write with AI' })).toBeVisible();
  await expect(intro).toHaveCount(0);
});
