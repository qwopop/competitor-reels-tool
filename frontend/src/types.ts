// Shared domain types for the whole app.

export interface Competitor {
  id: string;
  username: string;
  instagramUrl: string;
  displayName: string;
  avatarUrl: string;
  addedAt: string;
}

export interface Reel {
  id: string;
  competitorId: string;
  competitorUsername: string;
  // Instagram's short code. Sample Reels have no real post, so `permalink`
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

export interface ReelBreakdown {
  hook: string;
  script: string;
  cta: string;
  // Plain-language notes the AI surfaced about pacing, tone, etc.
  notes: string;
  generatedAt: string;
}

export interface RemixedReel {
  id: string;
  reelId: string;
  title: string;
  hook: string;
  script: string;
  cta: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceResult<T> {
  data: T | null;
  error: string | null;
}

export interface ReelsApi {
  listCompetitors(): Promise<ServiceResult<Competitor[]>>;
  addCompetitor(instagramUrl: string): Promise<ServiceResult<Competitor>>;
  removeCompetitor(id: string): Promise<ServiceResult<void>>;
  // Fetches the 20 most recent Reels for a competitor and stores them.
  fetchReelsForCompetitor(competitorId: string): Promise<ServiceResult<Reel[]>>;
  listReels(): Promise<ServiceResult<Reel[]>>;
  getReel(id: string): Promise<ServiceResult<Reel>>;
  // AI-powered: builds the breakdown (hook / script / cta) for a Reel.
  remixReel(reelId: string): Promise<ServiceResult<RemixedReel>>;
  getRemix(id: string): Promise<ServiceResult<RemixedReel>>;
  updateRemix(
    id: string,
    patch: Partial<Pick<RemixedReel, 'title' | 'hook' | 'script' | 'cta'>>
  ): Promise<ServiceResult<RemixedReel>>;
}
