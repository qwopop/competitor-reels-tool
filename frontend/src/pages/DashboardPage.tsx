import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Link2 } from 'lucide-react';
import type { Competitor, ContentPlanItem, Reel, RemixedReel } from '@/types';
import { useApi } from '@/services';
import { compactNumber, countLabel, plural, relativeTime } from '@/utils/format';
import { dashboardStats } from '@/utils/stats';
import { PLAN_STATUSES } from '@/utils/plan';
import { ErrorBanner, FullPageLoader, Spinner } from '@/components/ui';
import { Notice } from '@/components/Notice';
import { Accent } from '@/components/PageHeader';
import { ReelCarousel } from '@/components/ReelCarousel';
import { CompetitorMarquee, type MarqueeItem } from '@/components/CompetitorMarquee';

interface DashboardData {
  competitors: Competitor[];
  reels: Reel[];
  remixes: RemixedReel[];
  plan: ContentPlanItem[];
}

export function DashboardPage() {
  const api = useApi();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [competitors, reels, remixes, plan] = await Promise.all([
      api.listCompetitors(),
      api.listReels(),
      api.listRemixes(),
      api.listContentPlan(),
    ]);
    const failed = [competitors, reels, remixes, plan].find((r) => r.error);
    if (failed) {
      setError(failed.error);
      return;
    }
    setError(null);
    setData({
      competitors: competitors.data ?? [],
      reels: reels.data ?? [],
      remixes: remixes.data ?? [],
      plan: plan.data ?? [],
    });
  }, [api]);

  useEffect(() => {
    let active = true;
    load().then(() => {
      if (!active) return;
    });
    return () => {
      active = false;
    };
  }, [load]);

  // Adds the competitor, then pulls its Reels, in one step.
  async function handleTrack(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setFormError(null);
    setNotice(null);
    const added = await api.addCompetitor(url);
    if (added.error || !added.data) {
      setBusy(false);
      setFormError(added.error ?? 'Could not add that profile.');
      return;
    }
    const fetched = await api.fetchReelsForCompetitor(added.data.id);
    setBusy(false);
    if (fetched.error) {
      setFormError(fetched.error);
    } else {
      setUrl('');
      setNotice(`Pulled ${fetched.data?.length ?? 0} Reels from @${added.data.username}.`);
    }
    await load();
  }

  const stats = data ? dashboardStats(data.competitors, data.reels, data.remixes, data.plan) : null;
  const topReels = data ? [...data.reels].sort((a, b) => b.viewCount - a.viewCount).slice(0, 7) : [];
  const marqueeItems: MarqueeItem[] = data
    ? data.competitors.map((c) => ({
        id: c.id,
        username: c.username,
        avatarUrl: c.avatarUrl,
        views: data.reels.filter((r) => r.competitorId === c.id).reduce((sum, r) => sum + r.viewCount, 0),
      }))
    : [];

  const tiles: { label: string; value: number; highlight?: boolean }[] = stats
    ? [
        { label: 'Competitors', value: stats.totalCompetitors },
        { label: 'Reels', value: stats.totalReels },
        { label: 'Remixes', value: stats.totalRemixes },
        { label: 'Planned videos', value: stats.plannedVideos },
        { label: 'Views', value: stats.totalViews, highlight: true },
        { label: 'Likes', value: stats.totalLikes },
        { label: 'Comments', value: stats.totalComments },
      ]
    : [];

  return (
    <div>
      <section className="relative text-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[70%] h-[34rem] w-[70rem] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(closest-side,rgba(124,58,237,0.32),transparent)]"
        />
        <p className="text-gradient relative text-lg font-medium uppercase tracking-wide">
          Competitor reel research
        </p>
        <h1 className="relative mx-auto mt-4 max-w-5xl text-5xl font-semibold leading-[0.98] tracking-[-0.045em] text-ink sm:text-7xl">
          Turn competitor Reels
          <br className="hidden sm:block" /> into <Accent>viral ideas</Accent>
        </h1>
        <p className="relative mx-auto mt-6 max-w-2xl text-lg text-ink/80">
          Track Instagram accounts, remix their best Reels into scripts, and plan every shoot in one place.
        </p>

        <form
          onSubmit={handleTrack}
          className="relative mx-auto mt-10 flex max-w-3xl flex-wrap items-center justify-center gap-4"
        >
          <div className="flex min-w-[18rem] flex-1 items-center gap-3 rounded-full border border-white/10 bg-surface-2/80 p-2 pl-5">
            <Link2 size={18} className="shrink-0 text-ink/50" aria-hidden="true" />
            <input
              type="text"
              aria-label="Instagram profile link"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste an Instagram profile link"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink/40"
            />
            <button type="submit" disabled={busy || !url.trim()} className="btn-primary whitespace-nowrap py-3">
              {busy ? <Spinner /> : null} Track &amp; fetch
            </button>
          </div>
          <span className="text-sm text-ink/60">or</span>
          <Link to="/reels" className="btn-outline py-3">
            Browse reels <ArrowRight size={15} />
          </Link>
        </form>

        {formError && (
          <div role="alert" className="relative mx-auto mt-6 max-w-3xl">
            <ErrorBanner message={formError} />
          </div>
        )}
        {notice && (
          <div className="relative mx-auto mt-6 max-w-3xl text-left">
            <Notice message={notice} onDismiss={() => setNotice(null)} />
          </div>
        )}

        {topReels.length > 0 && <ReelCarousel reels={topReels} />}
      </section>

      {error && (
        <div className="mt-12">
          <ErrorBanner message={error} />
        </div>
      )}
      {!data && !error && <FullPageLoader label="Loading your dashboard…" />}

      {data && stats && data.competitors.length > 0 && (
        <>
          <p className="mt-14 text-center text-lg text-ink/70">
            Tracking {plural(stats.totalCompetitors, 'competitor')} · {plural(stats.totalReels, 'Reel')} ·{' '}
            {countLabel(stats.totalViews, 'view')}
          </p>
          <CompetitorMarquee items={marqueeItems} />

          <section aria-label="Totals" className="mt-20 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {tiles.map((tile) => (
              <div
                key={tile.label}
                className={[
                  'rounded-2xl p-6',
                  tile.highlight ? 'bg-brand text-ground' : 'bg-surface',
                ].join(' ')}
              >
                <p className="text-3xl font-semibold tabular-nums tracking-[-0.03em]">
                  {compactNumber(tile.value)}
                </p>
                <p className={`mt-2 text-sm ${tile.highlight ? 'text-ground/70' : 'text-ink/60'}`}>
                  {tile.label}
                </p>
              </div>
            ))}
          </section>

          <div className="mt-16 grid gap-12 lg:grid-cols-2">
            <section aria-labelledby="top-reel">
              <h2 id="top-reel" className="text-2xl font-semibold tracking-[-0.02em] text-ink">
                Top-performing <Accent>Reel</Accent>
              </h2>
              <p className="mt-1 text-sm text-ink/60">The Reel with the most views.</p>
              {stats.topReel ? (
                <div className="mt-6 flex gap-5">
                  <img
                    src={stats.topReel.thumbnailUrl}
                    alt={stats.topReel.caption}
                    className="aspect-[4/5] w-28 rounded-2xl bg-surface-2 object-cover"
                  />
                  <div>
                    <p className="text-sm text-ink/60">@{stats.topReel.competitorUsername}</p>
                    <p className="mt-1 text-lg font-medium leading-snug text-ink">{stats.topReel.caption}</p>
                    <p className="stat mt-2">{countLabel(stats.topReel.viewCount, 'view')}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-6 text-base text-ink/70">No Reels yet. Track a competitor above.</p>
              )}

              <h2 className="mt-12 text-2xl font-semibold tracking-[-0.02em] text-ink">
                Most-viewed <Accent>competitor</Accent>
              </h2>
              <p className="mt-4 text-lg text-ink">
                {stats.mostViewedCompetitor ? (
                  <>
                    @{stats.mostViewedCompetitor.username}{' '}
                    <span className="stat">· {countLabel(stats.mostViewedCompetitor.views, 'view')}</span>
                  </>
                ) : (
                  'No Reels yet.'
                )}
              </p>
            </section>

            <section aria-labelledby="content-progress">
              <h2 id="content-progress" className="text-2xl font-semibold tracking-[-0.02em] text-ink">
                Content plan <Accent>progress</Accent>
              </h2>
              <ul className="mt-6 space-y-3">
                {PLAN_STATUSES.map((s) => (
                  <li key={s.value} className="flex items-center justify-between rounded-2xl bg-surface px-5 py-3.5 text-base">
                    <span>
                      <span aria-hidden="true">{s.emoji}</span> {s.label}
                    </span>
                    <span className="tabular-nums text-ink">{stats.planCounts[s.value]}</span>
                  </li>
                ))}
              </ul>
              <Link to="/content-plan" className="mt-4 inline-block text-sm text-ink/60 underline-offset-4 hover:text-ink hover:underline">
                Open the content plan
              </Link>
            </section>
          </div>

          <section aria-labelledby="recent" className="mt-16">
            <h2 id="recent" className="text-2xl font-semibold tracking-[-0.02em] text-ink">
              Recent <Accent>Reels</Accent>
            </h2>
            {stats.recentReels.length === 0 ? (
              <p className="mt-6 text-base text-ink/70">No Reels yet.</p>
            ) : (
              <ul className="mt-6 max-w-4xl space-y-3">
                {stats.recentReels.map((reel) => (
                  <li
                    key={reel.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-surface px-5 py-4 transition-colors duration-200 hover:bg-surface-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-ink/60">@{reel.competitorUsername} · {relativeTime(reel.postedAt)}</p>
                      <p className="truncate text-base text-ink">{reel.caption}</p>
                    </div>
                    <span className="stat">{countLabel(reel.viewCount, 'view')}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/reels" className="mt-6 inline-block text-sm text-ink/60 underline-offset-4 hover:text-ink hover:underline">
              Open the Reels library
            </Link>
          </section>
        </>
      )}
    </div>
  );
}
