import { describe, it, expect } from 'vitest';
import { filterReels } from '@/utils/reels';
import { dashboardStats } from '@/utils/stats';
import type { Competitor, ContentPlanItem, Reel, RemixedReel } from '@/types';

function reel(overrides: Partial<Reel>): Reel {
  return {
    id: 'r',
    competitorId: 'c1',
    competitorUsername: 'one',
    shortcode: 'x',
    permalink: '',
    caption: 'caption',
    thumbnailUrl: '',
    viewCount: 0,
    likeCount: 0,
    commentCount: 0,
    postedAt: '2026-01-01T00:00:00.000Z',
    fetchedAt: '',
    ...overrides,
  };
}

const all = { competitorId: '', query: '', sort: 'newest' as const };

describe('filterReels', () => {
  const reels = [
    reel({ id: 'a', caption: 'Prompt tips', postedAt: '2026-01-01T00:00:00.000Z', viewCount: 5, likeCount: 50 }),
    reel({ id: 'b', caption: 'SaaS build', competitorId: 'c2', postedAt: '2026-02-01T00:00:00.000Z', viewCount: 500, likeCount: 1 }),
    reel({ id: 'c', caption: 'Another SaaS', postedAt: '2026-03-01T00:00:00.000Z', viewCount: 50, likeCount: 10 }),
  ];

  it('sorts newest first by default', () => {
    expect(filterReels(reels, all).map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('sorts by views and by likes', () => {
    expect(filterReels(reels, { ...all, sort: 'views' }).map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(filterReels(reels, { ...all, sort: 'likes' }).map((r) => r.id)).toEqual(['a', 'c', 'b']);
  });

  it('searches captions case-insensitively', () => {
    expect(filterReels(reels, { ...all, query: '  saas ' }).map((r) => r.id)).toEqual(['c', 'b']);
  });

  it('filters by competitor', () => {
    expect(filterReels(reels, { ...all, competitorId: 'c2' }).map((r) => r.id)).toEqual(['b']);
  });

  it('does not mutate the input', () => {
    const copy = [...reels];
    filterReels(reels, { ...all, sort: 'views' });
    expect(reels).toEqual(copy);
  });
});

describe('dashboardStats', () => {
  const competitors: Competitor[] = [
    { id: 'c1', username: 'one', instagramUrl: '', displayName: 'One', avatarUrl: '', addedAt: '' },
    { id: 'c2', username: 'two', instagramUrl: '', displayName: 'Two', avatarUrl: '', addedAt: '' },
  ];
  const reels = [
    reel({ id: 'a', competitorId: 'c1', viewCount: 100, likeCount: 10, commentCount: 1, postedAt: '2026-01-01T00:00:00.000Z' }),
    reel({ id: 'b', competitorId: 'c1', viewCount: 300, likeCount: 20, commentCount: 2, postedAt: '2026-02-01T00:00:00.000Z' }),
    reel({ id: 'c', competitorId: 'c2', competitorUsername: 'two', viewCount: 250, likeCount: 30, commentCount: 3, postedAt: '2026-03-01T00:00:00.000Z' }),
  ];
  const remixes: RemixedReel[] = [{ id: 'm', reelId: 'a', title: '', hook: '', script: '', cta: '', createdAt: '', updatedAt: '' }];
  const plan: ContentPlanItem[] = [
    { id: 'p1', reelId: 'a', status: 'filmed', competitorUsername: 'one', caption: '', thumbnailUrl: '', permalink: '', postedAt: '', addedAt: '', updatedAt: '' },
    { id: 'p2', reelId: 'b', status: 'not_started', competitorUsername: 'one', caption: '', thumbnailUrl: '', permalink: '', postedAt: '', addedAt: '', updatedAt: '' },
  ];

  it('totals counts and engagement across stored Reels', () => {
    const s = dashboardStats(competitors, reels, remixes, plan);
    expect(s.totalCompetitors).toBe(2);
    expect(s.totalReels).toBe(3);
    expect(s.totalRemixes).toBe(1);
    expect(s.plannedVideos).toBe(2);
    expect(s.totalViews).toBe(650);
    expect(s.totalLikes).toBe(60);
    expect(s.totalComments).toBe(6);
  });

  it('picks the top Reel by views and the most-viewed competitor by total views', () => {
    const s = dashboardStats(competitors, reels, remixes, plan);
    expect(s.topReel?.id).toBe('b');
    expect(s.mostViewedCompetitor).toEqual({ username: 'one', views: 400 });
  });

  it('counts plan items by status and lists the five newest Reels', () => {
    const s = dashboardStats(competitors, reels, remixes, plan);
    expect(s.planCounts).toEqual({ not_started: 1, ready: 0, filmed: 1 });
    expect(s.recentReels.map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('handles an empty library', () => {
    const s = dashboardStats([], [], [], []);
    expect(s.topReel).toBeNull();
    expect(s.mostViewedCompetitor).toBeNull();
    expect(s.totalViews).toBe(0);
  });
});


import { countLabel, plural, reelStats } from '@/utils/format';

describe('wording helpers', () => {
  it('plural uses the singular only for exactly one', () => {
    expect(plural(0, 'competitor')).toBe('0 competitors');
    expect(plural(1, 'competitor')).toBe('1 competitor');
    expect(plural(2, 'competitor')).toBe('2 competitors');
    expect(plural(2, 'person', 'people')).toBe('2 people');
  });

  it('countLabel compacts large numbers and singularises one', () => {
    expect(countLabel(1, 'view')).toBe('1 view');
    expect(countLabel(0, 'view')).toBe('0 views');
    expect(countLabel(12_300, 'view')).toBe('12.3K views');
  });

  it('reelStats joins views, likes and comments', () => {
    expect(reelStats({ viewCount: 1, likeCount: 2, commentCount: 1 })).toBe('1 view · 2 likes · 1 comment');
  });
});
