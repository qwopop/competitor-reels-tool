import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ContentPlanItem, Video, RemixedVideo } from '@/types';
import { useApi } from '@/services';
import { relativeTime, videoStats } from '@/utils/format';
import { filterVideos, type VideoSort } from '@/utils/videos';
import { planStatusMeta } from '@/utils/plan';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorBanner, FullPageLoader, Spinner } from '@/components/ui';
import { Notice } from '@/components/Notice';
import { ViewToggle } from '@/components/ViewToggle';
import { useDialogFocus } from '@/components/useDialogFocus';
import { WatchOnYouTubeLink } from '@/components/YouTubeLinks';
import { channelLabel } from '@/utils/youtube';

type LibraryView = 'grid' | 'list';

const SORT_OPTIONS: { value: VideoSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'views', label: 'Most views' },
  { value: 'likes', label: 'Most likes' },
];

export function VideosPage() {
  const api = useApi();
  const navigate = useNavigate();
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [remixByVideo, setRemixByVideo] = useState<Record<string, RemixedVideo>>({});
  const [planByVideo, setPlanByVideo] = useState<Record<string, ContentPlanItem>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<RemixedVideo | null>(null);

  const [view, setView] = useState<LibraryView>('grid');
  const [competitorId, setCompetitorId] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<VideoSort>('newest');

  useEffect(() => {
    let active = true;
    api.listVideos().then((res) => {
      if (!active) return;
      if (res.error) setError(res.error);
      else setVideos(res.data ?? []);
    });
    api.listRemixes().then((res) => {
      if (active && res.data) setRemixByVideo(Object.fromEntries(res.data.map((r) => [r.videoId, r])));
    });
    api.listContentPlan().then((res) => {
      if (active && res.data) setPlanByVideo(Object.fromEntries(res.data.map((i) => [i.videoId, i])));
    });
    return () => {
      active = false;
    };
  }, [api]);

  const competitors = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of videos ?? []) seen.set(r.competitorId, r.competitorUsername);
    return [...seen.entries()];
  }, [videos]);

  const visible = useMemo(
    () => (videos ? filterVideos(videos, { competitorId, query, sort }) : []),
    [videos, competitorId, query, sort]
  );

  async function handleRemix(video: Video) {
    setBusyId(video.id);
    const res = await api.remixVideo(video.id);
    setBusyId(null);
    if (res.error || !res.data) {
      setError(res.error ?? 'Could not create the breakdown.');
      return;
    }
    navigate(`/remix/${res.data.id}`);
  }

  async function handleAddToPlan(video: Video) {
    if (planByVideo[video.id]) {
      setNotice('Already in your Content Plan.');
      return;
    }
    setBusyId(video.id);
    const res = await api.addToContentPlan(video.id);
    setBusyId(null);
    if (res.error || !res.data) {
      setError(res.error ?? 'Could not add to the Content Plan.');
      return;
    }
    const item = res.data;
    setPlanByVideo((prev) => ({ ...prev, [video.id]: item }));
    setNotice('Added to your Content Plan.');
  }

  return (
    <div>
      <PageHeader
        title="Browse"
        accent="videos"
        description="Every video from your tracked competitors. Search, filter and sort them, then remix or queue the ones worth making."
      />

      <div className="mb-8 flex flex-wrap items-end gap-4">
        <div className="min-w-[12rem]">
          <label htmlFor="video-competitor" className="label">Competitor</label>
          <select
            id="video-competitor"
            className="input mt-2"
            value={competitorId}
            onChange={(e) => setCompetitorId(e.target.value)}
          >
            <option value="">All competitors</option>
            {competitors.map(([id, username]) => (
              <option key={id} value={id}>{channelLabel(username)}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="video-search" className="label">Search captions</label>
          <input
            id="video-search"
            type="search"
            className="input mt-2"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try “SaaS” or “prompt”"
          />
        </div>
        <div className="min-w-[10rem]">
          <label htmlFor="video-sort" className="label">Sort by</label>
          <select
            id="video-sort"
            className="input mt-2"
            value={sort}
            onChange={(e) => setSort(e.target.value as VideoSort)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <ViewToggle<LibraryView>
          label="Library layout"
          value={view}
          onChange={setView}
          options={[
            { value: 'grid', label: 'Grid' },
            { value: 'list', label: 'List' },
          ]}
        />
      </div>

      {notice && (
        <div className="mb-8">
          <Notice message={notice} onDismiss={() => setNotice(null)} />
        </div>
      )}
      {error && (
        <div className="mb-8">
          <ErrorBanner message={error} />
        </div>
      )}

      {videos === null && !error ? (
        <FullPageLoader label="Loading your videos…" />
      ) : videos && videos.length === 0 ? (
        <EmptyState
          title="No videos yet"
          description="Track a YouTube channel and fetch its latest videos to fill this library."
          action={<Link to="/competitors" className="btn-primary">Go to competitors</Link>}
        />
      ) : videos && visible.length === 0 ? (
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-base text-ink/70">No videos match these filters.</p>
          <button
            type="button"
            className="btn-outline px-4 py-2 text-sm"
            onClick={() => {
              setCompetitorId('');
              setQuery('');
              setSort('newest');
            }}
          >
            Clear filters
          </button>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((video, index) => (
            <article key={video.id} className="rise" style={{ '--i': Math.min(index, 8) } as React.CSSProperties}>
              <img
                src={video.thumbnailUrl}
                referrerPolicy="no-referrer"
                decoding="async"
                alt={video.caption}
                loading="lazy"
                className="aspect-video w-full rounded-2xl bg-surface-2 object-cover"
              />
              <div className="mt-5 space-y-2">
                <p className="text-sm text-ink/60">
                  {channelLabel(video.competitorUsername)} · {relativeTime(video.postedAt)}
                </p>
                <h3 className="line-clamp-2 min-h-[3.5rem] text-lg font-medium leading-snug text-ink">
                  {video.caption}
                </h3>
                <p className="stat">
                  {videoStats(video)}
                </p>
              </div>
              <VideoActions
                video={video}
                busy={busyId === video.id}
                inPlan={planByVideo[video.id]}
                hasRemix={Boolean(remixByVideo[video.id])}
                onRemix={() => handleRemix(video)}
                onAddToPlan={() => handleAddToPlan(video)}
                onPreview={() => setPreview(remixByVideo[video.id])}
              />
            </article>
          ))}
        </div>
      ) : (
        <ul className="max-w-5xl">
          {visible.map((video) => (
            <li key={video.id} className="rise rounded-2xl bg-surface p-4 transition-colors duration-200 hover:bg-surface-2 [&+&]:mt-3">
              <div className="flex flex-wrap items-center gap-5">
                <img
                  src={video.thumbnailUrl}
                  referrerPolicy="no-referrer"
                  decoding="async"
                  alt={video.caption}
                  loading="lazy"
                  className="aspect-video w-32 shrink-0 rounded-xl bg-surface-2 object-cover"
                />
                <div className="min-w-0 flex-1 basis-64">
                  <p className="text-sm text-ink/60">
                    {channelLabel(video.competitorUsername)} · {relativeTime(video.postedAt)}
                  </p>
                  <h3 className="text-base font-medium text-ink">{video.caption}</h3>
                  <p className="stat mt-1">
                    {videoStats(video)}
                  </p>
                </div>
                <VideoActions
                  video={video}
                  busy={busyId === video.id}
                  inPlan={planByVideo[video.id]}
                  hasRemix={Boolean(remixByVideo[video.id])}
                  onRemix={() => handleRemix(video)}
                  onAddToPlan={() => handleAddToPlan(video)}
                  onPreview={() => setPreview(remixByVideo[video.id])}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {preview && <RemixPreview remix={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function VideoActions({
  video,
  busy,
  inPlan,
  hasRemix,
  onRemix,
  onAddToPlan,
  onPreview,
}: {
  video: Video;
  busy: boolean;
  inPlan: ContentPlanItem | undefined;
  hasRemix: boolean;
  onRemix: () => void;
  onAddToPlan: () => void;
  onPreview: () => void;
}) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      {hasRemix && (
        <button type="button" onClick={onPreview} className="btn-ghost px-3 py-2 text-sm">
          Preview
        </button>
      )}
      {inPlan ? (
        <span className="px-3 py-2 text-sm text-ink/70">
          <span aria-hidden="true">{planStatusMeta(inPlan.status).emoji}</span> In content plan
        </span>
      ) : (
        <button type="button" onClick={onAddToPlan} disabled={busy} className="btn-outline px-4 py-2 text-sm">
          Add to plan
        </button>
      )}
      <button type="button" onClick={onRemix} disabled={busy} className="btn-primary px-4 py-2 text-sm">
        {busy ? <Spinner /> : null} Remix
      </button>
      <div className="basis-full">
        <WatchOnYouTubeLink permalink={video.permalink} username={video.competitorUsername} />
      </div>
    </div>
  );
}

function RemixPreview({ remix, onClose }: { remix: RemixedVideo; onClose: () => void }) {
  const panelRef = useRef<HTMLElement>(null);
  // Escape closes it, focus moves in, and returns to the Preview button afterwards.
  useDialogFocus(panelRef, onClose, { trap: false });
  return (
    <aside
      ref={panelRef}
      aria-label="Remix preview"
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col gap-6 overflow-y-auto rounded-l-3xl bg-surface p-8"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink/60">Remix preview</p>
        <button type="button" onClick={onClose} className="btn-ghost px-2 py-1 text-sm">Close</button>
      </div>
      <h2 className="text-2xl font-semibold leading-snug tracking-[-0.02em] text-ink">{remix.title}</h2>
      <div>
        <p className="label">Hook</p>
        <p className="mt-2 text-base text-ink">{remix.hook}</p>
      </div>
      <div>
        <p className="label">Script</p>
        <p className="mt-2 text-base text-ink">{remix.script}</p>
      </div>
      <div>
        <p className="label">Call to action</p>
        <p className="mt-2 text-base text-ink">{remix.cta}</p>
      </div>
      <Link to={`/remix/${remix.id}`} className="btn-primary self-start">Open editor</Link>
    </aside>
  );
}
