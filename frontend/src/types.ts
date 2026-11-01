// Shared domain types for the whole app.

export interface Competitor {
  id: string;
  username: string;
  instagramUrl: string;
  displayName: string;
  avatarUrl: string;
  addedAt: string;
}

export interface Video {
  id: string;
  competitorId: string;
  competitorUsername: string;
  // Instagram's short code. Sample Videos have no real post, so `permalink`
  // points at the competitor's profile instead.
  shortcode: string;
  permalink: string;
  caption: string;
  thumbnailUrl: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  postedAt: string;
  fetchedAt: string;
}

export interface VideoBreakdown {
  hook: string;
  script: string;
  cta: string;
  // Plain-language notes the AI surfaced about pacing, tone, etc.
  notes: string;
  generatedAt: string;
}

export interface RemixedVideo {
  id: string;
  videoId: string;
  title: string;
  hook: string;
  script: string;
  cta: string;
  createdAt: string;
  updatedAt: string;
}

// not_started: nothing ready yet. ready: script done, ready to film. filmed: filmed and posted.
export type PlanStatus = 'not_started' | 'ready' | 'filmed';

export interface ContentPlanItem {
  id: string;
  videoId: string;
  status: PlanStatus;
  competitorUsername: string;
  caption: string;
  thumbnailUrl: string;
  permalink: string;
  postedAt: string;
  addedAt: string;
  updatedAt: string;
}

export type RemixTemplate = 'default' | 'educational' | 'storytelling' | 'promotional';

export interface ServiceResult<T> {
  data: T | null;
  error: string | null;
}

export interface VideosApi {
  listCompetitors(): Promise<ServiceResult<Competitor[]>>;
  addCompetitor(instagramUrl: string): Promise<ServiceResult<Competitor>>;
  removeCompetitor(id: string): Promise<ServiceResult<void>>;
  // Fetches the 20 most recent Videos for a competitor and stores them.
  fetchVideosForCompetitor(competitorId: string): Promise<ServiceResult<Video[]>>;
  listVideos(): Promise<ServiceResult<Video[]>>;
  getVideo(id: string): Promise<ServiceResult<Video>>;
  // AI-powered: builds the breakdown (hook / script / cta) for a Video.
  remixVideo(videoId: string, template?: RemixTemplate): Promise<ServiceResult<RemixedVideo>>;
  listRemixes(): Promise<ServiceResult<RemixedVideo[]>>;
  getRemixForVideo(videoId: string): Promise<ServiceResult<RemixedVideo>>;
  applyRemixTemplate(id: string, template: RemixTemplate): Promise<ServiceResult<RemixedVideo>>;
  getRemix(id: string): Promise<ServiceResult<RemixedVideo>>;
  updateRemix(
    id: string,
    patch: Partial<Pick<RemixedVideo, 'title' | 'hook' | 'script' | 'cta'>>
  ): Promise<ServiceResult<RemixedVideo>>;
  listContentPlan(): Promise<ServiceResult<ContentPlanItem[]>>;
  addToContentPlan(videoId: string): Promise<ServiceResult<ContentPlanItem>>;
  updateContentPlanStatus(
    id: string,
    status: PlanStatus
  ): Promise<ServiceResult<ContentPlanItem>>;
  removeFromContentPlan(id: string): Promise<ServiceResult<void>>;
}
