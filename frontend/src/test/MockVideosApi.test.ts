import { describe, it, expect, beforeEach } from 'vitest';
import { MockVideosApi } from '@/services/MockVideosApi';
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

describe('MockVideosApi.addCompetitor', () => {
  it('stores a competitor from a YouTube channel link', async () => {
    const api = freshApi();
    const res = await api.addCompetitor('https://www.youtube.com/@vibecoder');
    expect(res.error).toBeNull();
    expect(res.data?.username).toBe('vibecoder');
    expect(res.data?.channelUrl).toBe('https://www.youtube.com/@vibecoder');
    expect(res.data?.channelId).toBe('sample-vibecoder');
  });

  it('returns an error for an invalid URL', async () => {
    const api = freshApi();
    const res = await api.addCompetitor('https://twitter.com/foo');
    expect(res.data).toBeNull();
    expect(res.error).toMatch(/YouTube channel link/);
  });

  it('does not duplicate an existing competitor', async () => {
    const api = freshApi();
    await api.addCompetitor('https://www.youtube.com/@vibecoder');
    const second = await api.addCompetitor('@vibecoder');
    const list = await api.listCompetitors();
    expect(list.data).toHaveLength(1);
    expect(second.data?.id).toBe(list.data![0].id);
  });
});

describe('MockVideosApi.fetchVideosForCompetitor', () => {
  it('fetches the latest 15 videos and stores them', async () => {
    const api = freshApi();
    const comp = await api.addCompetitor('https://www.youtube.com/@creator');
    const videos = await api.fetchVideosForCompetitor(comp.data!.id);
    expect(videos.data).toHaveLength(15);
    expect(videos.data?.[0].competitorUsername).toBe('creator');
    expect(videos.data?.[0].permalink).toBe(comp.data!.channelUrl);

    const stored = await api.listVideos();
    expect(stored.data).toHaveLength(15);
  });

  it('replaces videos on refetch instead of duplicating', async () => {
    const api = freshApi();
    const comp = await api.addCompetitor('https://www.youtube.com/@creator');
    await api.fetchVideosForCompetitor(comp.data!.id);
    await api.fetchVideosForCompetitor(comp.data!.id);
    const stored = await api.listVideos();
    expect(stored.data).toHaveLength(15);
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
    const comp = await api.addCompetitor('https://www.youtube.com/@creator');
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
    const comp = await api.addCompetitor('https://www.youtube.com/@creator');
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
    const comp = await api.addCompetitor('https://www.youtube.com/@creator');
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
    const comp = await api.addCompetitor('https://www.youtube.com/@creator');
    await api.fetchVideosForCompetitor(comp.data!.id);
    expect((await api.listVideos()).data).toHaveLength(15);

    await api.removeCompetitor(comp.data!.id);
    expect((await api.listCompetitors()).data).toHaveLength(0);
    expect((await api.listVideos()).data).toHaveLength(0);
  });
});

describe('MockVideosApi persistence', () => {
  it('survives a new instance pointing at the same storage', async () => {
    const apiA = freshApi();
    await apiA.addCompetitor('https://www.youtube.com/@creator');

    const apiB = freshApi();
    const list = await apiB.listCompetitors();
    expect(list.data).toHaveLength(1);
    expect(list.data?.[0].username).toBe('creator');
  });
});

describe('MockVideosApi content plan', () => {
  async function seededVideo() {
    const api = freshApi();
    const comp = await api.addCompetitor('https://www.youtube.com/@creator');
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



describe('MockVideosApi re-fetch keeps the user work', () => {
  it('keeps a remixed Video and its remix, and does not duplicate it', async () => {
    const api = freshApi();
    const comp = await api.addCompetitor('https://www.youtube.com/@creator');
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
    expect(videos).toHaveLength(16);
  });

  it('keeps a Video that is in the content plan so it can still be remixed', async () => {
    const api = freshApi();
    const comp = await api.addCompetitor('https://www.youtube.com/@creator');
    const first = await api.fetchVideosForCompetitor(comp.data!.id);
    const item = await api.addToContentPlan(first.data![0].id);

    await api.fetchVideosForCompetitor(comp.data!.id);

    const remix = await api.remixVideo(item.data!.videoId);
    expect(remix.error).toBeNull();
  });
});
