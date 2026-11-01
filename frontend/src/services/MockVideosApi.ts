import type {
  Competitor,
  ContentPlanItem,
  PlanStatus,
  Video,
  VideosApi,
  RemixedVideo,
  RemixTemplate,
  ServiceResult,
} from '@/types';
import { parseUsername } from '@/utils/instagram';

// ----------------------------------------------------------------------------
// Offline mock of the VideosApi service, persisted to localStorage. It is no
// longer the app default (see ApiContext.tsx); use it in tests or to demo the
// UI without the backend. It mirrors the backend's behavior in backend/app.
// ----------------------------------------------------------------------------

const COMPETITORS_KEY = 'mock.competitors';
const VIDEOS_KEY = 'mock.videos';
const REMIXES_KEY = 'mock.remixes';
const PLAN_KEY = 'mock.plan';
const MAX_VIDEOS = 20;

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

// Kept as a re-export so existing imports keep working.
export { parseUsername };

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

const TEMPLATE_TITLES: Record<RemixTemplate, string> = {
  default: 'Remix',
  educational: 'Lesson',
  storytelling: 'Story',
  promotional: 'Promo',
};

// Mirrors the backend templates in spirit: a title prefix and one line per field.
function templateText(template: RemixTemplate, video: Video, seedIndex: number) {
  const topic = video.caption;
  const hooks: Record<RemixTemplate, string[]> = {
    default: HOOK_BANK,
    educational: [`Most people get ${topic} wrong. Here is the fix.`],
    storytelling: [`Last year I tried ${topic} and it went badly.`],
    promotional: [`Stop struggling with ${topic}. There is an easier way.`],
  };
  return {
    title: `${TEMPLATE_TITLES[template]}: ${topic}`,
    hook: pick(hooks[template], seedIndex),
    script: pick(SCRIPT_BANK, seedIndex),
    cta: pick(CTA_BANK, seedIndex),
  };
}

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

function mockVideosFor(competitor: Competitor): Video[] {
  const now = Date.now();
  const videos: Video[] = [];
  for (let i = 0; i < MAX_VIDEOS; i++) {
    const shortcode = `${competitor.username.slice(0, 3)}${Math.random()
      .toString(36)
      .slice(2, 9)}`;
    const posted = new Date(now - i * 86_400_000 * 2).toISOString();
    videos.push({
      id: uid('video'),
      competitorId: competitor.id,
      competitorUsername: competitor.username,
      shortcode,
      permalink: competitor.instagramUrl,
      caption: pick(VIBECODING_TOPICS, i),
      thumbnailUrl: `https://picsum.photos/seed/${shortcode}/640/800`,
      viewCount: Math.round(50_000 + Math.random() * 900_000),
      likeCount: Math.round(3_000 + Math.random() * 60_000),
      commentCount: Math.round(40 + Math.random() * 1_500),
      postedAt: posted,
      fetchedAt: new Date().toISOString(),
    });
  }
  return videos;
}

// Simulate network / AI latency so the UI reflects real async behavior.
function delay<T>(value: T, ms = 600): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// ----- Service implementation -----------------------------------------------

export class MockVideosApi implements VideosApi {
  async listCompetitors(): Promise<ServiceResult<Competitor[]>> {
    const competitors = read<Competitor[]>(COMPETITORS_KEY, []);
    return delay(ok(competitors), 150);
  }

  async addCompetitor(instagramUrl: string): Promise<ServiceResult<Competitor>> {
    const parsed = parseUsername(instagramUrl);
    const username = parsed ? parsed.toLowerCase() : null;
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
    const videos = read<Video[]>(VIDEOS_KEY, []);
    write(
      VIDEOS_KEY,
      videos.filter((r) => r.competitorId !== id)
    );
    return delay(ok(undefined), 150);
  }

  async fetchVideosForCompetitor(
    competitorId: string
  ): Promise<ServiceResult<Video[]>> {
    const competitors = read<Competitor[]>(COMPETITORS_KEY, []);
    const competitor = competitors.find((c) => c.id === competitorId);
    if (!competitor) {
      return fail<Video[]>('Competitor not found.');
    }
    const newVideos = mockVideosFor(competitor);
    const existing = read<Video[]>(VIDEOS_KEY, []);
    // Replace this competitor's Videos, but keep any that have a remix or a plan item.
    const keep = new Set([
      ...read<RemixedVideo[]>(REMIXES_KEY, []).map((rm) => rm.videoId),
      ...read<ContentPlanItem[]>(PLAN_KEY, []).map((item) => item.videoId),
    ]);
    const merged = [
      ...newVideos,
      ...existing.filter((r) => r.competitorId !== competitorId || keep.has(r.id)),
    ];
    write(VIDEOS_KEY, merged);
    return delay(ok(newVideos));
  }

  async listVideos(): Promise<ServiceResult<Video[]>> {
    const videos = read<Video[]>(VIDEOS_KEY, []);
    videos.sort((a, b) => +new Date(b.postedAt) - +new Date(a.postedAt));
    return delay(ok(videos), 200);
  }

  async getVideo(id: string): Promise<ServiceResult<Video>> {
    const videos = read<Video[]>(VIDEOS_KEY, []);
    const video = videos.find((r) => r.id === id);
    if (!video) return fail<Video>('Video not found.');
    return delay(ok(video), 150);
  }

  async remixVideo(videoId: string, template: RemixTemplate = 'default'): Promise<ServiceResult<RemixedVideo>> {
    const videos = read<Video[]>(VIDEOS_KEY, []);
    const video = videos.find((r) => r.id === videoId);
    if (!video) return fail<RemixedVideo>('Video not found.');

    const remixes = read<RemixedVideo[]>(REMIXES_KEY, []);
    const existing = remixes.find((rm) => rm.videoId === videoId);
    if (existing) {
      return delay(ok(existing));
    }

    const seedIndex = Math.abs(
      Array.from(video.shortcode).reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
    );
    const now = new Date().toISOString();
    const remix: RemixedVideo = {
      id: uid('remix'),
      videoId,
      ...templateText(template, video, seedIndex),
      createdAt: now,
      updatedAt: now,
    };
    remixes.unshift(remix);
    write(REMIXES_KEY, remixes);
    // AI step is a little slower than a plain read.
    return delay(ok(remix), 1100);
  }

  async getRemix(id: string): Promise<ServiceResult<RemixedVideo>> {
    const remixes = read<RemixedVideo[]>(REMIXES_KEY, []);
    const remix = remixes.find((rm) => rm.id === id);
    if (!remix) return fail<RemixedVideo>('Remix not found.');
    return delay(ok(remix), 150);
  }

  async listRemixes(): Promise<ServiceResult<RemixedVideo[]>> {
    const remixes = read<RemixedVideo[]>(REMIXES_KEY, []);
    return delay(ok(remixes), 150);
  }

  async getRemixForVideo(videoId: string): Promise<ServiceResult<RemixedVideo>> {
    const remixes = read<RemixedVideo[]>(REMIXES_KEY, []);
    const remix = remixes.find((rm) => rm.videoId === videoId);
    if (!remix) return fail<RemixedVideo>('No remix for this Video yet.');
    return delay(ok(remix), 100);
  }

  async applyRemixTemplate(id: string, template: RemixTemplate): Promise<ServiceResult<RemixedVideo>> {
    const remixes = read<RemixedVideo[]>(REMIXES_KEY, []);
    const idx = remixes.findIndex((rm) => rm.id === id);
    if (idx === -1) return fail<RemixedVideo>('Remix not found.');
    const videos = read<Video[]>(VIDEOS_KEY, []);
    const video = videos.find((r) => r.id === remixes[idx].videoId);
    if (!video) return fail<RemixedVideo>('Video not found.');
    const seedIndex = Math.abs(Array.from(video.shortcode).reduce((acc, ch) => acc + ch.charCodeAt(0), 0));
    const updated: RemixedVideo = {
      ...remixes[idx],
      ...templateText(template, video, seedIndex),
      updatedAt: new Date().toISOString(),
    };
    remixes[idx] = updated;
    write(REMIXES_KEY, remixes);
    return delay(ok(updated), 200);
  }

  async updateRemix(
    id: string,
    patch: Partial<Pick<RemixedVideo, 'title' | 'hook' | 'script' | 'cta'>>
  ): Promise<ServiceResult<RemixedVideo>> {
    const remixes = read<RemixedVideo[]>(REMIXES_KEY, []);
    const idx = remixes.findIndex((rm) => rm.id === id);
    if (idx === -1) return fail<RemixedVideo>('Remix not found.');
    const updated: RemixedVideo = {
      ...remixes[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    remixes[idx] = updated;
    write(REMIXES_KEY, remixes);
    return delay(ok(updated), 200);
  }

  async listContentPlan(): Promise<ServiceResult<ContentPlanItem[]>> {
    const items = read<ContentPlanItem[]>(PLAN_KEY, []);
    return delay(ok(items), 150);
  }

  async addToContentPlan(videoId: string): Promise<ServiceResult<ContentPlanItem>> {
    const videos = read<Video[]>(VIDEOS_KEY, []);
    const video = videos.find((r) => r.id === videoId);
    if (!video) return fail<ContentPlanItem>('Video not found.');

    const items = read<ContentPlanItem[]>(PLAN_KEY, []);
    const existing = items.find((item) => item.videoId === videoId);
    if (existing) return delay(ok(existing), 150);

    const now = new Date().toISOString();
    const item: ContentPlanItem = {
      id: uid('plan'),
      videoId,
      status: 'not_started',
      competitorUsername: video.competitorUsername,
      caption: video.caption,
      thumbnailUrl: video.thumbnailUrl,
      permalink: video.permalink,
      postedAt: video.postedAt,
      addedAt: now,
      updatedAt: now,
    };
    items.unshift(item);
    write(PLAN_KEY, items);
    return delay(ok(item), 200);
  }

  async updateContentPlanStatus(
    id: string,
    status: PlanStatus
  ): Promise<ServiceResult<ContentPlanItem>> {
    const items = read<ContentPlanItem[]>(PLAN_KEY, []);
    const idx = items.findIndex((item) => item.id === id);
    if (idx === -1) return fail<ContentPlanItem>('Plan item not found.');
    const updated: ContentPlanItem = {
      ...items[idx],
      status,
      updatedAt: new Date().toISOString(),
    };
    items[idx] = updated;
    write(PLAN_KEY, items);
    return delay(ok(updated), 150);
  }

  async removeFromContentPlan(id: string): Promise<ServiceResult<void>> {
    const items = read<ContentPlanItem[]>(PLAN_KEY, []);
    if (!items.some((item) => item.id === id)) {
      return fail<void>('Plan item not found.');
    }
    write(
      PLAN_KEY,
      items.filter((item) => item.id !== id)
    );
    return delay(ok(undefined), 150);
  }
}
