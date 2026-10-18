import type { Reel } from '@/types';

export type ReelSort = 'newest' | 'views' | 'likes';

export interface ReelFilters {
  competitorId: string; // '' means all competitors
  query: string;
  sort: ReelSort;
}

// Filters and sorts the library. Search matches caption text, ignoring case.
export function filterReels(reels: Reel[], { competitorId, query, sort }: ReelFilters): Reel[] {
  const needle = query.trim().toLowerCase();
  const matches = reels.filter(
    (r) =>
      (competitorId === '' || r.competitorId === competitorId) &&
      (needle === '' || r.caption.toLowerCase().includes(needle))
  );
  const byNewest = (a: Reel, b: Reel) => +new Date(b.postedAt) - +new Date(a.postedAt);
  const compare: Record<ReelSort, (a: Reel, b: Reel) => number> = {
    newest: byNewest,
    views: (a, b) => b.viewCount - a.viewCount || byNewest(a, b),
    likes: (a, b) => b.likeCount - a.likeCount || byNewest(a, b),
  };
  return [...matches].sort(compare[sort]);
}
