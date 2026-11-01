// Issue 68: Production checklist
import { expect, test, type Locator, type Page } from '@playwright/test';
import { api, planCard, seedChannel } from './helpers';

const STEPS = ['Script completed', 'Recording completed', 'Caption prepared', 'Published'] as const;

// Ticks or unticks one step and waits until it is saved.
async function tick(page: Page, checklist: Locator, step: (typeof STEPS)[number], on: boolean) {
  const saved = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/api/content-plan/') && r.ok());
  await checklist.getByRole('checkbox', { name: step }).setChecked(on);
  await saved;
}

async function expectTicks(checklist: Locator, ticked: readonly string[]) {
  for (const step of STEPS) {
    const box = checklist.getByRole('checkbox', { name: step });
    if (ticked.includes(step)) await expect(box, step).toBeChecked();
    else await expect(box, step).not.toBeChecked();
  }
}

test('checklist ticks save at once, show progress, and are independent of status and other cards', async ({ page, request }) => {
  const { handle, videos } = await seedChannel(request, 'pcheck');
  const [one, two] = videos;
  await api.addToPlan(request, one.id);
  await api.addToPlan(request, two.id);
  await page.goto('/content-plan');

  const card = planCard(page, handle).filter({ hasText: one.caption });
  const other = planCard(page, handle).filter({ hasText: two.caption });
  const checklist = card.getByRole('group', { name: /Production checklist/ });
  const otherChecklist = other.getByRole('group', { name: /Production checklist/ });
  const views = page.getByRole('group', { name: 'Plan layout' });
  const row = page.locator('tbody tr').filter({ has: page.locator('td:nth-child(2)', { hasText: new RegExp(`^@${handle}$`) }) }).filter({ hasText: one.caption });

  await expect(card).toHaveCount(1);
  await expect(checklist).toContainText('Production checklist');
  await expect(checklist).toContainText('0/4');
  await expect(checklist.getByRole('checkbox')).toHaveCount(4);
  await expectTicks(checklist, []);

  await tick(page, checklist, 'Script completed', true);
  await tick(page, checklist, 'Caption prepared', true);
  await expect(checklist).toContainText('2/4');

  await page.reload();
  await expectTicks(checklist, ['Script completed', 'Caption prepared']);
  await expect(checklist).toContainText('2/4');
  // The other card is untouched.
  await expect(otherChecklist).toContainText('0/4');
  await expectTicks(otherChecklist, []);

  await views.getByRole('button', { name: 'Table' }).click();
  await expect(row.locator('td:nth-child(5)')).toContainText('2/4 done');
  await views.getByRole('button', { name: 'Board' }).click();

  await tick(page, checklist, 'Caption prepared', false);
  await expect(checklist).toContainText('1/4');
  await page.reload();
  await expectTicks(checklist, ['Script completed']);
  await expect(checklist).toContainText('1/4');

  // All four; Published does not change the status.
  for (const step of STEPS) if (step !== 'Script completed') await tick(page, checklist, step, true);
  await expect(checklist).toContainText('4/4');
  const notStarted = page.getByRole('region', { name: /Not started/ }).locator('li').filter({ hasText: `@${handle} · added` }).filter({ hasText: one.caption });
  await expect(notStarted).toHaveCount(1);
  await expect(card.getByRole('button', { name: 'Not started' })).toHaveAttribute('aria-pressed', 'true');
  await views.getByRole('button', { name: 'Table' }).click();
  await expect(row.locator('td:nth-child(5)')).toContainText('4/4 done');
  await views.getByRole('button', { name: 'Board' }).click();

  // Filmed does not change the checklist.
  await card.getByRole('button', { name: 'Filmed' }).click();
  await expect(page.getByRole('region', { name: /Filmed/ }).locator('li').filter({ hasText: `@${handle} · added` }).filter({ hasText: one.caption })).toHaveCount(1);
  await page.reload();
  await expectTicks(checklist, STEPS);
  await expect(checklist).toContainText('4/4');
  await expect(otherChecklist).toContainText('0/4');
});
