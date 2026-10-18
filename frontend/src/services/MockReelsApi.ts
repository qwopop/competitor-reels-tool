import type {
  Competitor,
  Reel,
  ReelsApi,
  RemixedReel,
  ServiceResult,
} from '@/types';

// ----------------------------------------------------------------------------
// Offline mock of the ReelsApi service, persisted to localStorage. It is no
// longer the app default (see ApiContext.tsx); use it in tests or to demo the
// UI without the backend. It mirrors the backend's behavior in backend/app.
// ----------------------------------------------------------------------------

const COMPETITORS_KEY = 'mock.competitors';
const REELS_KEY = 'mock.reels';
const REMIXES_KEY = 'mock.remixes';
const MAX_REELS = 20;

const ok = <T>(data: T): ServiceResult<T> => ({ data, error: null });
const fail = <T>(error: string): ServiceResult<T> => ({ data: null, error });

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors in mock mode
  }
}

// ----- Instagram URL helpers -------------------------------------------------

const USERNAME_RE = /^@?([A-Za-z0-9._]+)$/;

export function parseUsername(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (!/instagram\.com$/i.test(u.hostname) && !u.hostname.endsWith('instagram.com')) {
      return null;
    }
    // /username/ or /username
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return null;
    return parts[0];
  } catch {
    // Not a URL — accept a bare @username for ergonomics.
    const m = trimmed.match(USERNAME_RE);
    return m ? m[1] : null;
  }
}

// ----- Mock data generation --------------------------------------------------

const VIBECODING_TOPICS = [
  'I let AI build my entire SaaS in 48 hours',
  'Why your prompts are costing you money',
  'The stack I use to ship full-stack apps in an afternoon',
  'Stop hand-coding CRUD — this prompt does it for you',
  'Cursor + Bolt = the fastest way to prototype',
  'I cloned a $50/mo app in one weekend with AI',
  'My prompt library for full-stack vibe coding',
  'How I prototype auth + payments without writing boilerplate',
  'The 3 system prompts every vibe coder needs',
  'From idea to deployed in 4 hours (full breakdown)',
  'AI wrote my database schema in 90 seconds',
  'The workflow: LLM-as-frontend-engineer',
  'I stopped writing CSS. Here is what replaced it',
  'Vibe coding a realtime chat in 20 minutes',
  'My terminal-first AI dev setup',
  'Designing prompts that produce production-ready code',
  'I built a startup landing page with one prompt',
  'RAG, vector stores, and the vibe coder starter kit',
  'Pair programming with an LLM that actually ships',
  'The lazy engineer guide to AI feature flags',
];

const HOOK_BANK = [
  'Stop scrolling — I built this in 2 hours using only AI.',
  'This one prompt replaced my entire frontend team.',
  'I was today years old when I learned AI can ship auth for you.',
  'Nobody tells you this about vibe coding. So I will.',
  'If you write CRUD by hand in 2026, you are losing hours every day.',
];

const SCRIPT_BANK = [
  'Step 1: open your AI IDE. Step 2: describe the app in plain English. Step 3: review the diff, ship, repeat.',
  'Start with the data model, then ask the AI for the routes, then the UI. Never write boilerplate.',
  'I prompt for the feature, the AI drafts the component, I tweak the copy, and I deploy.',
  'The trick is to give the model the schema first. Everything else falls out of that.',
];

const CTA_BANK = [
  'Comment "STACK" and I will DM you my full prompt library.',
  'Follow for daily vibe coding breakdowns.',
  'Save this for your next AI build weekend.',
  'Tag a founder who still hand-codes CRUD.',
];

const NOTES_BANK = [
  'Pacing is fast — jump cuts every 2-3 seconds. Hook lands in the first 1.5s.',
  'Screen-record B-roll over talking head. Subtitles are burned in.',
  'Single strong visual payoff at the end before the CTA card.',
  'Tone is casual but confident, leaning into "you can do this too".',
];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

function mockReelsFor(competitor: Competitor): Reel[] {
  const now = Date.now();
  const reels: Reel[] = [];
  for (let i = 0; i < MAX_REELS; i++) {
    const shortcode = `${competitor.username.slice(0, 3)}${Math.random()
      .toString(36)
      .slice(2, 9)}`;
    const posted = new Date(now - i * 86_400_000 * 2).toISOString();
    reels.push({
      id: uid('reel'),
      competitorId: competitor.id,
      competitorUsername: competitor.username,
      shortcode,
      permalink: `https://www.instagram.com/reel/${shortcode}/`,
      caption: pick(VIBECODING_TOPICS, i),
      thumbnailUrl: `https://picsum.photos/seed/${shortcode}/640/800`,
      viewCount: Math.round(50_000 + Math.random() * 900_000),
      likeCount: Math.round(3_000 + Math.random() * 60_000),
      commentCount: Math.round(40 + Math.random() * 1_500),
      postedAt: posted,
      fetchedAt: new Date().toISOString(),
    });
  }
  return reels;
}

// Simulate network / AI latency so the UI reflects real async behavior.
function delay<T>(value: T, ms = 600): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// ----- Service implementation -----------------------------------------------

export class MockReelsApi implements ReelsApi {
  async listCompetitors(): Promise<ServiceResult<Competitor[]>> {
    const competitors = read<Competitor[]>(COMPETITORS_KEY, []);
    return delay(ok(competitors), 150);
  }

  async addCompetitor(instagramUrl: string): Promise<ServiceResult<Competitor>> {
    const username = parseUsername(instagramUrl);
    if (!username) {
      return fail<Competitor>(
        'Please paste a valid Instagram profile URL like https://instagram.com/username'
      );
    }
    const competitors = read<Competitor[]>(COMPETITORS_KEY, []);
    const existing = competitors.find(
      (c) => c.username.toLowerCase() === username.toLowerCase()
    );
    if (existing) {
      return ok(existing);
    }
    const competitor: Competitor = {
      id: uid('comp'),
      username,
      instagramUrl: `https://www.instagram.com/${username}/`,
      displayName: username.charAt(0).toUpperCase() + username.slice(1),
      avatarUrl: `https://picsum.photos/seed/${username}-avatar/96/96`,
      addedAt: new Date().toISOString(),
    };
    competitors.unshift(competitor);
    write(COMPETITORS_KEY, competitors);
    return delay(ok(competitor));
  }

  async removeCompetitor(id: string): Promise<ServiceResult<void>> {
    const competitors = read<Competitor[]>(COMPETITORS_KEY, []);
    write(
      COMPETITORS_KEY,
      competitors.filter((c) => c.id !== id)
    );
    const reels = read<Reel[]>(REELS_KEY, []);
    write(
      REELS_KEY,
      reels.filter((r) => r.competitorId !== id)
    );
    return delay(ok(undefined), 150);
  }

  async fetchReelsForCompetitor(
    competitorId: string
  ): Promise<ServiceResult<Reel[]>> {
    const competitors = read<Competitor[]>(COMPETITORS_KEY, []);
    const competitor = competitors.find((c) => c.id === competitorId);
    if (!competitor) {
      return fail<Reel[]>('Competitor not found.');
    }
    const newReels = mockReelsFor(competitor);
    const existing = read<Reel[]>(REELS_KEY, []);
    // Replace any reels we already had for this competitor.
    const merged = [
      ...newReels,
      ...existing.filter((r) => r.competitorId !== competitorId),
    ];
    write(REELS_KEY, merged);
    return delay(ok(newReels));
  }

  async listReels(): Promise<ServiceResult<Reel[]>> {
    const reels = read<Reel[]>(REELS_KEY, []);
    reels.sort((a, b) => +new Date(b.postedAt) - +new Date(a.postedAt));
    return delay(ok(reels), 200);
  }

  async getReel(id: string): Promise<ServiceResult<Reel>> {
    const reels = read<Reel[]>(REELS_KEY, []);
    const reel = reels.find((r) => r.id === id);
    if (!reel) return fail<Reel>('Reel not found.');
    return delay(ok(reel), 150);
  }

  async remixReel(reelId: string): Promise<ServiceResult<RemixedReel>> {
    const reels = read<Reel[]>(REELS_KEY, []);
    const reel = reels.find((r) => r.id === reelId);
    if (!reel) return fail<RemixedReel>('Reel not found.');

    const remixes = read<RemixedReel[]>(REMIXES_KEY, []);
    const existing = remixes.find((rm) => rm.reelId === reelId);
    if (existing) {
      return delay(ok(existing));
    }

    const seedIndex = Math.abs(
      Array.from(reel.shortcode).reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
    );
    const now = new Date().toISOString();
    const remix: RemixedReel = {
      id: uid('remix'),
      reelId,
      title: `Remix: ${reel.caption}`,
      hook: pick(HOOK_BANK, seedIndex),
      script: pick(SCRIPT_BANK, seedIndex),
      cta: pick(CTA_BANK, seedIndex),
      createdAt: now,
      updatedAt: now,
    };
    remixes.unshift(remix);
    write(REMIXES_KEY, remixes);
    // AI step is a little slower than a plain read.
    return delay(ok(remix), 1100);
  }

  async getRemix(id: string): Promise<ServiceResult<RemixedReel>> {
    const remixes = read<RemixedReel[]>(REMIXES_KEY, []);
    const remix = remixes.find((rm) => rm.id === id);
    if (!remix) return fail<RemixedReel>('Remix not found.');
    return delay(ok(remix), 150);
  }

  async updateRemix(
    id: string,
    patch: Partial<Pick<RemixedReel, 'title' | 'hook' | 'script' | 'cta'>>
  ): Promise<ServiceResult<RemixedReel>> {
    const remixes = read<RemixedReel[]>(REMIXES_KEY, []);
    const idx = remixes.findIndex((rm) => rm.id === id);
    if (idx === -1) return fail<RemixedReel>('Remix not found.');
    const updated: RemixedReel = {
      ...remixes[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    remixes[idx] = updated;
    write(REMIXES_KEY, remixes);
    return delay(ok(updated), 200);
  }
}
