import type { Competitor, ContentPlanItem, PlanStatus, Video, RemixedVideo } from '@/types';

export interface DashboardStats {
  totalCompetitors: number;
  totalVideos: number;
  totalRemixes: number;
  plannedVideos: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  // Defined as the Video with the most views. Null when there are no Videos.
  topVideo: Video | null;
  // Competitor whose Videos have the most views in total. Null when there are no Videos.
  mostViewedCompetitor: { username: string; views: number } | null;
  recentVideos: Video[];
  planCounts: Record<PlanStatus, number>;
}

export function dashboardStats(
  competitors: Competitor[],
  videos: Video[],
  remixes: RemixedVideo[],
  plan: ContentPlanItem[]
): DashboardStats {
  const viewsByCompetitor = new Map<string, { username: string; views: number }>();
  for (const r of videos) {
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
    totalVideos: videos.length,
    totalRemixes: remixes.length,
    plannedVideos: plan.length,
    totalViews: videos.reduce((sum, r) => sum + r.viewCount, 0),
    totalLikes: videos.reduce((sum, r) => sum + r.likeCount, 0),
    totalComments: videos.reduce((sum, r) => sum + r.commentCount, 0),
    topVideo: videos.reduce<Video | null>((best, r) => (!best || r.viewCount > best.viewCount ? r : best), null),
    mostViewedCompetitor: mostViewed,
    recentVideos: [...videos]
      .sort((a, b) => +new Date(b.postedAt) - +new Date(a.postedAt))
      .slice(0, 5),
    planCounts,
  };
}
