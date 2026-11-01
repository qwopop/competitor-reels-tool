// Issue 66: Content Plan statuses, board and table
import { expect, test, type Page } from '@playwright/test';
import { api, openVideosOf, seedChannel } from './helpers';

const STATUSES = [
  ['❌', 'Not started'],
  ['⏳', 'Ready to film'],
  ['✅', 'Filmed'],
] as const;
type Label = (typeof STATUSES)[number][1];

const column = (page: Page, label: Label) => page.getByRole('region', { name: new RegExp(label) });
const cardIn = (page: Page, label: Label, handle: string) =>
  column(page, label).locator('li').filter({ hasText: `@${handle} · added` });

async function readCounts(page: Page) {
  const out: Record<string, { header: number; summary: number }> = {};
  for (const [emoji, label] of STATUSES) {
    const header = await column(page, label).getByRole('heading', { level: 2 }).innerText();
    const summary = await page.locator('li').filter({ hasText: new RegExp(`^\\s*${emoji} ${label} \\d+\\s*$`) }).innerText();
    out[label] = { header: Number(header.match(/(\d+)\s*$/)![1]), summary: Number(summary.match(/(\d+)\s*$/)![1]) };
  }
  return out;
}

async function expectCounts(page: Page, label: Label, n: number) {
  const [emoji] = STATUSES.find(([, l]) => l === label)!;
  await expect(column(page, label).getByRole('heading', { level: 2 })).toHaveText(new RegExp(`${label} ${n}$`));
  await expect(page.locator('li').filter({ hasText: new RegExp(`^\\s*${emoji} ${label} ${n}\\s*$`) })).toHaveCount(1);
}

test('statuses move on the board and in the table, counts follow, and the status is saved', async ({ page, request }) => {
  const { handle, videos } = await seedChannel(request, 'pstat');
  await api.addToPlan(request, videos[0].id);
  await page.goto('/content-plan');

  const views = page.getByRole('group', { name: 'Plan layout' });
  await expect(views.getByRole('button')).toHaveText(['Board', 'Table', 'Calendar']);
  await expect(views.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true');

  for (const [emoji, label] of STATUSES) {
    await expect(column(page, label).getByRole('heading', { level: 2 })).toHaveText(new RegExp(`^${emoji} ${label} \\d+$`));
  }
  const card = cardIn(page, 'Not started', handle);
  await expect(card).toHaveCount(1);
  await expect(card.getByRole('button', { name: 'Not started' })).toHaveAttribute('aria-pressed', 'true');

  const before = await readCounts(page);
  await card.getByRole('button', { name: 'Ready to film' }).click();
  const ready = cardIn(page, 'Ready to film', handle);
  await expect(ready).toHaveCount(1);
  await expect(cardIn(page, 'Not started', handle)).toHaveCount(0);
  await expect(ready.getByRole('button', { name: 'Ready to film' })).toHaveAttribute('aria-pressed', 'true');
  await expectCounts(page, 'Not started', before['Not started'].header - 1);
  await expectCounts(page, 'Ready to film', before['Ready to film'].header + 1);
  expect(before['Not started'].summary).toBe(before['Not started'].header);

  // The active status again: nothing changes.
  const afterMove = await readCounts(page);
  await ready.getByRole('button', { name: 'Ready to film' }).click();
  await expect(ready).toHaveCount(1);
  expect(await readCounts(page)).toEqual(afterMove);

  // Table.
  await views.getByRole('button', { name: 'Table' }).click();
  await expect(views.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true');
  const row = page.locator('tbody tr').filter({ has: page.locator('td:nth-child(2)', { hasText: new RegExp(`^@${handle}$`) }) });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(videos[0].caption);
  await expect(row.getByRole('button', { name: 'Ready to film' })).toHaveAttribute('aria-pressed', 'true');
  await row.getByRole('button', { name: 'Filmed' }).click();
  await expect(row.getByRole('button', { name: 'Filmed' })).toHaveAttribute('aria-pressed', 'true');

  // Reload: back on Board, card in Filmed.
  await page.reload();
  await expect(views.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true');
  const filmed = cardIn(page, 'Filmed', handle);
  await expect(filmed).toHaveCount(1);

  // Backwards.
  await filmed.getByRole('button', { name: 'Not started' }).click();
  await expect(cardIn(page, 'Not started', handle)).toHaveCount(1);
  await expect(cardIn(page, 'Filmed', handle)).toHaveCount(0);
  await page.reload();
  await expect(cardIn(page, 'Not started', handle)).toHaveCount(1);
});

test('the library shows the emoji of the current status', async ({ page, request }) => {
  const { handle, videos } = await seedChannel(request, 'pstat-emoji');
  await api.addToPlan(request, videos[0].id);
  const cardOf = () => page.locator('article').filter({ has: page.getByRole('heading', { name: videos[0].caption, exact: true }) });

  await page.goto('/content-plan');
  await cardIn(page, 'Not started', handle).getByRole('button', { name: 'Filmed' }).click();
  await expect(cardIn(page, 'Filmed', handle)).toHaveCount(1);
  await openVideosOf(page, handle);
  await expect(cardOf()).toContainText('✅ In content plan');

  await page.goto('/content-plan');
  await cardIn(page, 'Filmed', handle).getByRole('button', { name: 'Ready to film' }).click();
  await expect(cardIn(page, 'Ready to film', handle)).toHaveCount(1);
  await openVideosOf(page, handle);
  await expect(cardOf()).toContainText('⏳ In content plan');
});
