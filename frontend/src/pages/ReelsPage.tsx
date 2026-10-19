import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ContentPlanItem, Reel, RemixedReel } from '@/types';
import { useApi } from '@/services';
import { compactNumber, relativeTime } from '@/utils/format';
import { filterReels, type ReelSort } from '@/utils/reels';
import { planStatusMeta } from '@/utils/plan';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorBanner, FullPageLoader, Spinner } from '@/components/ui';
import { Notice } from '@/components/Notice';
import { ViewToggle } from '@/components/ViewToggle';

type LibraryView = 'grid' | 'list';

const SORT_OPTIONS: { value: ReelSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'views', label: 'Most views' },
  { value: 'likes', label: 'Most likes' },
];

export function ReelsPage() {
  const api = useApi();
  const navigate = useNavigate();
  const [reels, setReels] = useState<Reel[] | null>(null);
  const [remixByReel, setRemixByReel] = useState<Record<string, RemixedReel>>({});
  const [planByReel, setPlanByReel] = useState<Record<string, ContentPlanItem>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<RemixedReel | null>(null);

  const [view, setView] = useState<LibraryView>('grid');
  const [competitorId, setCompetitorId] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ReelSort>('newest');

  useEffect(() => {
    let active = true;
    api.listReels().then((res) => {
      if (!active) return;
      if (res.error) setError(res.error);
      else setReels(res.data ?? []);
    });
    api.listRemixes().then((res) => {
      if (active && res.data) setRemixByReel(Object.fromEntries(res.data.map((r) => [r.reelId, r])));
    });
    api.listContentPlan().then((res) => {
      if (active && res.data) setPlanByReel(Object.fromEntries(res.data.map((i) => [i.reelId, i])));
    });
    return () => {
      active = false;
    };
  }, [api]);

  const competitors = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of reels ?? []) seen.set(r.competitorId, r.competitorUsername);
    return [...seen.entries()];
  }, [reels]);

  const visible = useMemo(
    () => (reels ? filterReels(reels, { competitorId, query, sort }) : []),
    [reels, competitorId, query, sort]
  );

  async function handleRemix(reel: Reel) {
    setBusyId(reel.id);
    const res = await api.remixReel(reel.id);
    setBusyId(null);
    if (res.error || !res.data) {
      setError(res.error ?? 'Could not create the breakdown.');
      return;
    }
    navigate(`/remix/${res.data.id}`);
  }

  async function handleAddToPlan(reel: Reel) {
    if (planByReel[reel.id]) {
      setNotice('Already in your Content Plan.');
      return;
    }
    setBusyId(reel.id);
    const res = await api.addToContentPlan(reel.id);
    setBusyId(null);
    if (res.error || !res.data) {
      setError(res.error ?? 'Could not add to the Content Plan.');
      return;
    }
    const item = res.data;
    setPlanByReel((prev) => ({ ...prev, [reel.id]: item }));
    setNotice('Added to your Content Plan.');
  }

  return (
    <div>
      <PageHeader
        title="Browse"
        accent="reels"
        description="Every Reel from your tracked competitors. Search, filter and sort them, then remix or queue the ones worth making."
      />

      <div className="mb-8 flex flex-wrap items-end gap-4">
        <div className="min-w-[12rem]">
          <label htmlFor="reel-competitor" className="label">Competitor</label>
          <select
            id="reel-competitor"
            className="input mt-2"
            value={competitorId}
            onChange={(e) => setCompetitorId(e.target.value)}
          >
            <option value="">All competitors</option>
            {competitors.map(([id, username]) => (
              <option key={id} value={id}>@{username}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="reel-search" className="label">Search captions</label>
          <input
            id="reel-search"
            type="search"
            className="input mt-2"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try “SaaS” or “prompt”"
          />
        </div>
        <div className="min-w-[10rem]">
          <label htmlFor="reel-sort" className="label">Sort by</label>
          <select
            id="reel-sort"
            className="input mt-2"
            value={sort}
            onChange={(e) => setSort(e.target.value as ReelSort)}
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

      {reels === null && !error ? (
        <FullPageLoader label="Loading your reels…" />
      ) : reels && reels.length === 0 ? (
        <EmptyState
          title="No reels yet"
          description="Track an Instagram competitor and fetch their latest Reels to fill this library."
          action={<Link to="/competitors" className="btn-primary">Go to competitors</Link>}
        />
      ) : reels && visible.length === 0 ? (
        <p className="text-base text-ink/70">No Reels match these filters.</p>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((reel, index) => (
            <article key={reel.id} className="rise" style={{ '--i': Math.min(index, 8) } as React.CSSProperties}>
              <img
                src={reel.thumbnailUrl}
                alt={reel.caption}
                loading="lazy"
                className="aspect-[4/5] w-full rounded-2xl bg-surface-2 object-cover"
              />
              <div className="mt-5 space-y-2">
                <p className="text-sm text-ink/60">
                  @{reel.competitorUsername} · {relativeTime(reel.postedAt)}
                </p>
                <h3 className="line-clamp-2 min-h-[3.5rem] text-lg font-medium leading-snug text-ink">
                  {reel.caption}
                </h3>
                <p className="stat">
                  {compactNumber(reel.viewCount)} views · {compactNumber(reel.likeCount)} likes
                  · {compactNumber(reel.commentCount)} comments
                </p>
              </div>
              <ReelActions
                reel={reel}
                busy={busyId === reel.id}
                inPlan={planByReel[reel.id]}
                hasRemix={Boolean(remixByReel[reel.id])}
                onRemix={() => handleRemix(reel)}
                onAddToPlan={() => handleAddToPlan(reel)}
                onPreview={() => setPreview(remixByReel[reel.id])}
              />
            </article>
          ))}
        </div>
      ) : (
        <ul className="max-w-5xl">
          {visible.map((reel) => (
            <li key={reel.id} className="rise rounded-2xl bg-surface p-4 transition-colors duration-200 hover:bg-surface-2 [&+&]:mt-3">
              <div className="flex flex-wrap items-center gap-5">
                <img
                  src={reel.thumbnailUrl}
                  alt={reel.caption}
                  loading="lazy"
                  className="aspect-[4/5] w-16 rounded-xl bg-surface-2 object-cover"
                />
                <div className="min-w-0 flex-1 basis-64">
                  <p className="text-sm text-ink/60">
                    @{reel.competitorUsername} · {relativeTime(reel.postedAt)}
                  </p>
                  <h3 className="text-base font-medium text-ink">{reel.caption}</h3>
                  <p className="stat mt-1">
                    {compactNumber(reel.viewCount)} views · {compactNumber(reel.likeCount)} likes
                    · {compactNumber(reel.commentCount)} comments
                  </p>
                </div>
                <ReelActions
                  reel={reel}
                  busy={busyId === reel.id}
                  inPlan={planByReel[reel.id]}
                  hasRemix={Boolean(remixByReel[reel.id])}
                  onRemix={() => handleRemix(reel)}
                  onAddToPlan={() => handleAddToPlan(reel)}
                  onPreview={() => setPreview(remixByReel[reel.id])}
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

function ReelActions({
  reel,
  busy,
  inPlan,
  hasRemix,
  onRemix,
  onAddToPlan,
  onPreview,
}: {
  reel: Reel;
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
      <a
        href={reel.permalink}
        target="_blank"
        rel="noreferrer"
        className="basis-full text-sm text-ink/60 underline-offset-4 transition-colors hover:text-ink hover:underline"
      >
        View profile on Instagram
      </a>
    </div>
  );
}

function RemixPreview({ remix, onClose }: { remix: RemixedReel; onClose: () => void }) {
  return (
    <aside
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
