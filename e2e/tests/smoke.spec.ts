// Smoke subset (#86): runs against the dev site after every deploy, and in CI on the compose stack.
//   cd e2e && BASE_URL=<dev url> EXPECT_VERSION=<tag> EXPECT_ENVIRONMENT=dev npm run smoke
//
// Why these tests: dev has a long-lived database, while the full suite assumes an empty one.
// So the smoke tests never open /videos (it renders every stored video), never count totals,
// and touch data only in the last test, which creates one uniquely named channel and always
// deletes it again (videos and remixes go with it). Sample videos only (VIDEO_SOURCE=sample),
// nothing calls YouTube.
import { expect, test } from '@playwright/test';
import { api, seedChannel } from './helpers';

const SMOKE = { tag: '@smoke' };

test('dev reports the deployed version, its environment and a working database', SMOKE, async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.database).toBe('ok');
  expect(body.version).toBeTruthy();
  // Set by the deploy workflow so the smoke run proves it tested the version being promoted.
  if (process.env.EXPECT_VERSION) expect(body.version).toBe(process.env.EXPECT_VERSION);
  if (process.env.EXPECT_ENVIRONMENT) expect(body.environment).toBe(process.env.EXPECT_ENVIRONMENT);
});

const PAGES = [
  { path: '/', title: 'Dashboard', heading: 'Turn competitor videos' },
  { path: '/competitors', title: 'Competitors', heading: 'Track your competitors' },
  { path: '/remixes', title: 'Remixes', heading: 'Your remixes' },
  { path: '/content-plan', title: 'Content plan', heading: 'Your content plan' },
  { path: '/go-to-videos', title: 'Go to videos', heading: 'Go to videos' },
];

test('the app pages are served and render (read only)', SMOKE, async ({ page }) => {
  for (const p of PAGES) {
    const res = await page.goto(p.path);
    expect(res?.status(), p.path).toBe(200);
    await expect(page.getByRole('heading', { level: 1 }), p.path).toContainText(p.heading);
    await expect(page).toHaveTitle(`${p.title} · ClipRemix`);
  }
});

test('the list endpoints answer (read only)', SMOKE, async ({ request }) => {
  for (const path of ['/competitors', '/remixes', '/content-plan']) {
    expect(Array.isArray(await api.list<unknown[]>(request, path)), path).toBeTruthy();
  }
});

test('write path: add a channel, fetch sample videos, remix one, then clean up', SMOKE, async ({ request }) => {
  const { competitor, videos } = await seedChannel(request, 'smoke');
  try {
    expect(videos).toHaveLength(15);
    const remix = await api.remix(request, videos[0].id);
    expect(remix.hook).toBeTruthy();
  } finally {
    const del = await request.delete(`/api/competitors/${competitor.id}`);
    expect(del.status()).toBe(204);
  }
  const left = await api.list<{ id: string }[]>(request, '/competitors');
  expect(left.some((c) => c.id === competitor.id)).toBeFalsy();
});
