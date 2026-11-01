import { describe, it, expect } from 'vitest';
import { filterVideos } from '@/utils/videos';
import { dashboardStats } from '@/utils/stats';
import type { Competitor, ContentPlanItem, Video, RemixedVideo } from '@/types';

function video(overrides: Partial<Video>): Video {
  return {
    id: 'r',
    competitorId: 'c1',
    competitorUsername: 'one',
    youtubeId: 'xxxxxxxxxxx',
    permalink: '',
    caption: 'caption',
    description: '',
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

describe('filterVideos', () => {
  const videos = [
    video({ id: 'a', caption: 'Prompt tips', postedAt: '2026-01-01T00:00:00.000Z', viewCount: 5, likeCount: 50 }),
    video({ id: 'b', caption: 'SaaS build', competitorId: 'c2', postedAt: '2026-02-01T00:00:00.000Z', viewCount: 500, likeCount: 1 }),
    video({ id: 'c', caption: 'Another SaaS', postedAt: '2026-03-01T00:00:00.000Z', viewCount: 50, likeCount: 10 }),
  ];

  it('sorts newest first by default', () => {
    expect(filterVideos(videos, all).map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('sorts by views and by likes', () => {
    expect(filterVideos(videos, { ...all, sort: 'views' }).map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(filterVideos(videos, { ...all, sort: 'likes' }).map((r) => r.id)).toEqual(['a', 'c', 'b']);
  });

  it('searches captions case-insensitively', () => {
    expect(filterVideos(videos, { ...all, query: '  saas ' }).map((r) => r.id)).toEqual(['c', 'b']);
  });

  it('filters by competitor', () => {
    expect(filterVideos(videos, { ...all, competitorId: 'c2' }).map((r) => r.id)).toEqual(['b']);
  });

  it('does not mutate the input', () => {
    const copy = [...videos];
    filterVideos(videos, { ...all, sort: 'views' });
    expect(videos).toEqual(copy);
  });
});

describe('dashboardStats', () => {
  const competitors: Competitor[] = [
    { id: 'c1', username: 'one', channelId: 'sample-vibecoder', channelUrl: '', displayName: 'One', avatarUrl: '', addedAt: '' },
    { id: 'c2', username: 'two', channelId: 'sample-vibecoder', channelUrl: '', displayName: 'Two', avatarUrl: '', addedAt: '' },
  ];
  const videos = [
    video({ id: 'a', competitorId: 'c1', viewCount: 100, likeCount: 10, commentCount: 1, postedAt: '2026-01-01T00:00:00.000Z' }),
    video({ id: 'b', competitorId: 'c1', viewCount: 300, likeCount: 20, commentCount: 2, postedAt: '2026-02-01T00:00:00.000Z' }),
    video({ id: 'c', competitorId: 'c2', competitorUsername: 'two', viewCount: 250, likeCount: 30, commentCount: 3, postedAt: '2026-03-01T00:00:00.000Z' }),
  ];
  const remixes: RemixedVideo[] = [{ id: 'm', videoId: 'a', title: '', hook: '', script: '', cta: '', createdAt: '', updatedAt: '' }];
  const plan: ContentPlanItem[] = [
    { id: 'p1', videoId: 'a', status: 'filmed', competitorUsername: 'one', caption: '', thumbnailUrl: '', permalink: '', postedAt: '', addedAt: '', updatedAt: '' },
    { id: 'p2', videoId: 'b', status: 'not_started', competitorUsername: 'one', caption: '', thumbnailUrl: '', permalink: '', postedAt: '', addedAt: '', updatedAt: '' },
  ];

  it('totals counts and engagement across stored Videos', () => {
    const s = dashboardStats(competitors, videos, remixes, plan);
    expect(s.totalCompetitors).toBe(2);
    expect(s.totalVideos).toBe(3);
    expect(s.totalRemixes).toBe(1);
    expect(s.plannedVideos).toBe(2);
    expect(s.totalViews).toBe(650);
    expect(s.totalLikes).toBe(60);
    expect(s.totalComments).toBe(6);
  });

  it('picks the top Video by views and the most-viewed competitor by total views', () => {
    const s = dashboardStats(competitors, videos, remixes, plan);
    expect(s.topVideo?.id).toBe('b');
    expect(s.mostViewedCompetitor).toEqual({ username: 'one', views: 400 });
  });

  it('counts plan items by status and lists the five newest Videos', () => {
    const s = dashboardStats(competitors, videos, remixes, plan);
    expect(s.planCounts).toEqual({ not_started: 1, ready: 0, filmed: 1 });
    expect(s.recentVideos.map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('handles an empty library', () => {
    const s = dashboardStats([], [], [], []);
    expect(s.topVideo).toBeNull();
    expect(s.mostViewedCompetitor).toBeNull();
    expect(s.totalViews).toBe(0);
  });
});


import { countLabel, plural, videoStats } from '@/utils/format';

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

  it('videoStats joins views, likes and comments', () => {
    expect(videoStats({ viewCount: 1, likeCount: 2, commentCount: 1 })).toBe('1 view · 2 likes · 1 comment');
  });
});

describe('videoStats', () => {
  it('leaves out counts YouTube did not report', async () => {
    const { videoStats } = await import('@/utils/format');
    expect(videoStats({ viewCount: 1200, likeCount: 5, commentCount: 0 })).toBe('1.2K views · 5 likes');
    expect(videoStats({ viewCount: 2, likeCount: 1, commentCount: 1 })).toBe('2 views · 1 like · 1 comment');
    expect(videoStats({ viewCount: 0, likeCount: 0, commentCount: 0 })).toBe('');
  });
});
