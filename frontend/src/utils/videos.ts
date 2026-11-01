import type { Video } from '@/types';

export type VideoSort = 'newest' | 'views' | 'likes';

export interface VideoFilters {
  competitorId: string; // '' means all competitors
  query: string;
  sort: VideoSort;
}

// Filters and sorts the library. Search matches caption text, ignoring case.
export function filterVideos(videos: Video[], { competitorId, query, sort }: VideoFilters): Video[] {
  const needle = query.trim().toLowerCase();
  const matches = videos.filter(
    (r) =>
      (competitorId === '' || r.competitorId === competitorId) &&
      (needle === '' || r.caption.toLowerCase().includes(needle))
  );
  const byNewest = (a: Video, b: Video) => +new Date(b.postedAt) - +new Date(a.postedAt);
  const compare: Record<VideoSort, (a: Video, b: Video) => number> = {
    newest: byNewest,
    views: (a, b) => b.viewCount - a.viewCount || byNewest(a, b),
    likes: (a, b) => b.likeCount - a.likeCount || byNewest(a, b),
  };
  return [...matches].sort(compare[sort]);
}
