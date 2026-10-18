import type { Competitor, ContentPlanItem, PlanStatus, Reel, RemixedReel } from '@/types';

export interface DashboardStats {
  totalCompetitors: number;
  totalReels: number;
  totalRemixes: number;
  plannedVideos: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  // Defined as the Reel with the most views. Null when there are no Reels.
  topReel: Reel | null;
  // Competitor whose Reels have the most views in total. Null when there are no Reels.
  mostViewedCompetitor: { username: string; views: number } | null;
  recentReels: Reel[];
  planCounts: Record<PlanStatus, number>;
}

export function dashboardStats(
  competitors: Competitor[],
  reels: Reel[],
  remixes: RemixedReel[],
  plan: ContentPlanItem[]
): DashboardStats {
  const viewsByCompetitor = new Map<string, { username: string; views: number }>();
  for (const r of reels) {
    const entry = viewsByCompetitor.get(r.competitorId) ?? { username: r.competitorUsername, views: 0 };
    entry.views += r.viewCount;
    viewsByCompetitor.set(r.competitorId, entry);
  }
  let mostViewed: { username: string; views: number } | null = null;
  for (const entry of viewsByCompetitor.values()) {
    if (!mostViewed || entry.views > mostViewed.views) mostViewed = entry;
  }

  const planCounts: Record<PlanStatus, number> = { not_started: 0, ready: 0, filmed: 0 };
  for (const item of plan) planCounts[item.status] += 1;

  return {
    totalCompetitors: competitors.length,
    totalReels: reels.length,
    totalRemixes: remixes.length,
    plannedVideos: plan.length,
    totalViews: reels.reduce((sum, r) => sum + r.viewCount, 0),
    totalLikes: reels.reduce((sum, r) => sum + r.likeCount, 0),
    totalComments: reels.reduce((sum, r) => sum + r.commentCount, 0),
    topReel: reels.reduce<Reel | null>((best, r) => (!best || r.viewCount > best.viewCount ? r : best), null),
    mostViewedCompetitor: mostViewed,
    recentReels: [...reels]
      .sort((a, b) => +new Date(b.postedAt) - +new Date(a.postedAt))
      .slice(0, 5),
    planCounts,
  };
}
