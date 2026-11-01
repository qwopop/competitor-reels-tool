// Shared domain types for the whole app.

export interface Competitor {
  id: string;
  // YouTube's channel ID (UC...). Sample channels use sample-<name>.
  channelId: string;
  // The @handle without the @, lowercase, or the channel ID when there is no handle.
  username: string;
  channelUrl: string;
  displayName: string;
  avatarUrl: string;
  addedAt: string;
}

export interface Video {
  id: string;
  competitorId: string;
  competitorUsername: string;
  // YouTube's 11-character video ID. Sample videos have no real page, so
  // `permalink` points at the channel instead of a watch link.
  youtubeId: string;
  permalink: string;
  caption: string;
  // The video's YouTube description. The backend's remix writer reads it.
  description: string;
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
  // Calendar: the days to film and to publish (YYYY-MM-DD), or null when not scheduled.
  filmDate: string | null;
  publishDate: string | null;
  // Production checklist.
  scriptDone: boolean;
  recordingDone: boolean;
  captionDone: boolean;
  publishedDone: boolean;
}

export type ChecklistKey = 'scriptDone' | 'recordingDone' | 'captionDone' | 'publishedDone';

// Fields of a plan item that can be changed. Only the ones given are sent.
export type PlanItemChanges = Partial<Pick<ContentPlanItem, 'status' | 'filmDate' | 'publishDate' | ChecklistKey>>;

export type RemixTemplate = 'default' | 'educational' | 'storytelling' | 'promotional';

export interface ServiceResult<T> {
  data: T | null;
  error: string | null;
}

export interface VideosApi {
  listCompetitors(): Promise<ServiceResult<Competitor[]>>;
  addCompetitor(channelUrl: string): Promise<ServiceResult<Competitor>>;
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
  updateContentPlanItem(id: string, changes: PlanItemChanges): Promise<ServiceResult<ContentPlanItem>>;
  removeFromContentPlan(id: string): Promise<ServiceResult<void>>;
}
