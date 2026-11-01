import { describe, it, expect, beforeEach } from 'vitest';
import { MockVideosApi, parseUsername } from '@/services/MockVideosApi';
import type { VideosApi } from '@/types';

// The whole app depends only on the VideosApi interface. These tests exercise
// the mock implementation that ships with the app so swapping backends later
// keeps the same contract.

function freshApi(): VideosApi {
  return new MockVideosApi();
}

beforeEach(() => {
  localStorage.clear();
});

describe('parseUsername', () => {
  it('parses a full Instagram URL', () => {
    expect(parseUsername('https://instagram.com/vibecoder')).toBe('vibecoder');
  });

  it('parses a URL with a trailing slash', () => {
    expect(parseUsername('https://www.instagram.com/vibecoder/')).toBe(
      'vibecoder'
    );
  });

  it('accepts a bare @username', () => {
    expect(parseUsername('@vibecoder')).toBe('vibecoder');
  });

  it('accepts a bare username', () => {
    expect(parseUsername('vibecoder')).toBe('vibecoder');
  });

  it('rejects non-instagram URLs', () => {
    expect(parseUsername('https://twitter.com/vibecoder')).toBeNull();
  });

  it('rejects empty input', () => {
    expect(parseUsername('   ')).toBeNull();
  });
});

describe('MockVideosApi.addCompetitor', () => {
  it('stores a competitor from an Instagram URL', async () => {
    const api = freshApi();
    const res = await api.addCompetitor('https://instagram.com/vibecoder');
    expect(res.error).toBeNull();
    expect(res.data?.username).toBe('vibecoder');
    expect(res.data?.instagramUrl).toContain('vibecoder');
  });

  it('returns an error for an invalid URL', async () => {
    const api = freshApi();
    const res = await api.addCompetitor('https://twitter.com/foo');
    expect(res.data).toBeNull();
    expect(res.error).toMatch(/valid Instagram/);
  });

  it('does not duplicate an existing competitor', async () => {
    const api = freshApi();
    await api.addCompetitor('https://instagram.com/vibecoder');
    const second = await api.addCompetitor('@vibecoder');
    const list = await api.listCompetitors();
    expect(list.data).toHaveLength(1);
    expect(second.data?.id).toBe(list.data![0].id);
  });
});

describe('MockVideosApi.fetchVideosForCompetitor', () => {
  it('fetches exactly 20 videos and stores them', async () => {
    const api = freshApi();
    const comp = await api.addCompetitor('https://instagram.com/creator');
    const videos = await api.fetchVideosForCompetitor(comp.data!.id);
    expect(videos.data).toHaveLength(20);
    expect(videos.data?.[0].competitorUsername).toBe('creator');
    expect(videos.data?.[0].permalink).toBe(comp.data!.instagramUrl);

    const stored = await api.listVideos();
    expect(stored.data).toHaveLength(20);
  });

  it('replaces videos on refetch instead of duplicating', async () => {
    const api = freshApi();
    const comp = await api.addCompetitor('https://instagram.com/creator');
    await api.fetchVideosForCompetitor(comp.data!.id);
    await api.fetchVideosForCompetitor(comp.data!.id);
    const stored = await api.listVideos();
    expect(stored.data).toHaveLength(20);
  });

  it('errors for an unknown competitor', async () => {
    const api = freshApi();
    const res = await api.fetchVideosForCompetitor('nope');
    expect(res.data).toBeNull();
    expect(res.error).toMatch(/not found/);
  });
});

describe('MockVideosApi.remixVideo', () => {
  it('produces a breakdown with hook, script, and cta', async () => {
    const api = freshApi();
    const comp = await api.addCompetitor('https://instagram.com/creator');
    const videos = await api.fetchVideosForCompetitor(comp.data!.id);
    const videoId = videos.data![0].id;

    const remix = await api.remixVideo(videoId);
    expect(remix.data?.hook).toBeTruthy();
    expect(remix.data?.script).toBeTruthy();
    expect(remix.data?.cta).toBeTruthy();
    expect(remix.data?.videoId).toBe(videoId);

    const fetched = await api.getRemix(remix.data!.id);
    expect(fetched.data?.id).toBe(remix.data!.id);
  });

  it('returns the existing remix instead of regenerating', async () => {
    const api = freshApi();
    const comp = await api.addCompetitor('https://instagram.com/creator');
    const videos = await api.fetchVideosForCompetitor(comp.data!.id);
    const videoId = videos.data![0].id;

    const first = await api.remixVideo(videoId);
    const second = await api.remixVideo(videoId);
    expect(second.data?.id).toBe(first.data?.id);
  });

  it('errors for an unknown video', async () => {
    const api = freshApi();
    const res = await api.remixVideo('nope');
    expect(res.data).toBeNull();
    expect(res.error).toMatch(/not found/);
  });
});

describe('MockVideosApi.updateRemix', () => {
  it('persists edits to the remix', async () => {
    const api = freshApi();
    const comp = await api.addCompetitor('https://instagram.com/creator');
    const videos = await api.fetchVideosForCompetitor(comp.data!.id);
    const remix = await api.remixVideo(videos.data![0].id);

    const updated = await api.updateRemix(remix.data!.id, {
      hook: 'My new hook',
      cta: 'Follow me',
    });
    expect(updated.data?.hook).toBe('My new hook');
    expect(updated.data?.cta).toBe('Follow me');
    // Untouched fields are preserved.
    expect(updated.data?.script).toBe(remix.data!.script);

    const refetched = await api.getRemix(remix.data!.id);
    expect(refetched.data?.hook).toBe('My new hook');
  });

  it('errors for an unknown remix', async () => {
    const api = freshApi();
    const res = await api.updateRemix('nope', { hook: 'x' });
    expect(res.data).toBeNull();
    expect(res.error).toMatch(/not found/);
  });
});

describe('MockVideosApi.removeCompetitor', () => {
  it('removes the competitor and its videos', async () => {
    const api = freshApi();
    const comp = await api.addCompetitor('https://instagram.com/creator');
    await api.fetchVideosForCompetitor(comp.data!.id);
    expect((await api.listVideos()).data).toHaveLength(20);

    await api.removeCompetitor(comp.data!.id);
    expect((await api.listCompetitors()).data).toHaveLength(0);
    expect((await api.listVideos()).data).toHaveLength(0);
  });
});

describe('MockVideosApi persistence', () => {
  it('survives a new instance pointing at the same storage', async () => {
    const apiA = freshApi();
    await apiA.addCompetitor('https://instagram.com/creator');

    const apiB = freshApi();
    const list = await apiB.listCompetitors();
    expect(list.data).toHaveLength(1);
    expect(list.data?.[0].username).toBe('creator');
  });
});

describe('MockVideosApi content plan', () => {
  async function seededVideo() {
    const api = freshApi();
    const comp = await api.addCompetitor('https://instagram.com/creator');
    const videos = await api.fetchVideosForCompetitor(comp.data!.id);
    return { api, video: videos.data![0] };
  }

  it('adds a Video as not_started and returns the existing item on repeat', async () => {
    const { api, video } = await seededVideo();
    const first = await api.addToContentPlan(video.id);
    expect(first.data?.status).toBe('not_started');
    expect(first.data?.videoId).toBe(video.id);

    const second = await api.addToContentPlan(video.id);
    expect(second.data?.id).toBe(first.data?.id);
    expect((await api.listContentPlan()).data).toHaveLength(1);
  });

  it('updates status and removes items', async () => {
    const { api, video } = await seededVideo();
    const item = (await api.addToContentPlan(video.id)).data!;

    const updated = await api.updateContentPlanStatus(item.id, 'filmed');
    expect(updated.data?.status).toBe('filmed');

    await api.removeFromContentPlan(item.id);
    expect((await api.listContentPlan()).data).toEqual([]);
  });

  it('errors for an unknown Video', async () => {
    const res = await freshApi().addToContentPlan('nope');
    expect(res.error).toMatch(/not found/);
  });
});



describe('parseUsername: links people actually paste', () => {
  it.each([
    ['instagram.com/vibecoder', 'vibecoder'],
    ['www.instagram.com/vibecoder', 'vibecoder'],
    ['m.instagram.com/vibecoder/', 'vibecoder'],
    ['http://instagram.com/vibecoder', 'vibecoder'],
    ['https://www.instagram.com/vibecoder/?igsh=abc123', 'vibecoder'],
    ['https://instagram.com/vibecoder/videos/', 'vibecoder'],
    ['@vibe.coder_1', 'vibe.coder_1'],
  ])('accepts %s', (input, expected) => {
    expect(parseUsername(input)).toBe(expected);
  });

  it.each([
    'twitter.com/vibecoder',
    'notinstagram.com/vibecoder',
    'https://evil.com/instagram.com/vibecoder',
    'https://www.instagram.com/p/ABC123/',
    'https://www.instagram.com/video/XYZ789/',
    'https://www.instagram.com/explore/',
    'https://www.instagram.com/accounts/login/',
    'https://instagram.com/vibe coder',
    '@vibe-coder',
    '@',
  ])('rejects %s', (input) => {
    expect(parseUsername(input)).toBeNull();
  });

  it('allows 30 characters and rejects 31', () => {
    expect(parseUsername('@' + 'a'.repeat(30))).toBe('a'.repeat(30));
    expect(parseUsername('@' + 'a'.repeat(31))).toBeNull();
  });
});

describe('MockVideosApi re-fetch keeps the user work', () => {
  it('keeps a remixed Video and its remix, and does not duplicate it', async () => {
    const api = freshApi();
    const comp = await api.addCompetitor('https://instagram.com/creator');
    const first = await api.fetchVideosForCompetitor(comp.data!.id);
    const kept = first.data![0];
    const remix = await api.remixVideo(kept.id);
    await api.updateRemix(remix.data!.id, { hook: 'my hand-edited hook' });

    await api.fetchVideosForCompetitor(comp.data!.id);

    const remixes = await api.listRemixes();
    expect(remixes.data).toHaveLength(1);
    expect(remixes.data![0].hook).toBe('my hand-edited hook');
    const videos = (await api.listVideos()).data!;
    expect(videos.filter((r) => r.id === kept.id)).toHaveLength(1);
    expect(videos).toHaveLength(21);
  });

  it('keeps a Video that is in the content plan so it can still be remixed', async () => {
    const api = freshApi();
    const comp = await api.addCompetitor('https://instagram.com/creator');
    const first = await api.fetchVideosForCompetitor(comp.data!.id);
    const item = await api.addToContentPlan(first.data![0].id);

    await api.fetchVideosForCompetitor(comp.data!.id);

    const remix = await api.remixVideo(item.data!.videoId);
    expect(remix.error).toBeNull();
  });
});
