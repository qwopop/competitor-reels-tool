// Issue 67: Film and publish dates.
import { expect, test } from '@playwright/test';
import { api, planCard, seedChannel } from './helpers';

test('set, warn about and clear the film and publish dates', async ({ page, request }) => {
  const { handle, videos } = await seedChannel(request, 'pdate');
  await api.addToPlan(request, videos[0].id);
  await page.goto('/content-plan');
  const card = planCard(page, handle);
  const film = card.getByLabel(/^Film date for/);
  const publish = card.getByLabel(/^Publish date for/);

  await film.fill('2027-03-10');
  await publish.fill('2027-03-12');
  await expect(card.getByText('Publishing is set before filming.')).toHaveCount(0);
  await page.reload();
  await expect(film).toHaveValue('2027-03-10');
  await expect(publish).toHaveValue('2027-03-12');

  await publish.fill('2027-03-08');
  await expect(card.getByText('Publishing is set before filming.')).toBeVisible();

  await film.fill('');
  await page.reload();
  await expect(film).toHaveValue('');
  await expect(publish).toHaveValue('2027-03-08');
});
