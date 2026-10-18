import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Competitor, ContentPlanItem, Reel, RemixedReel } from '@/types';
import { useApi } from '@/services';
import { compactNumber, relativeTime } from '@/utils/format';
import { dashboardStats } from '@/utils/stats';
import { PLAN_STATUSES } from '@/utils/plan';
import { EmptyState, ErrorBanner, FullPageLoader } from '@/components/ui';

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

  useEffect(() => {
    let active = true;
    Promise.all([api.listCompetitors(), api.listReels(), api.listRemixes(), api.listContentPlan()]).then(
      ([competitors, reels, remixes, plan]) => {
        if (!active) return;
        const failed = [competitors, reels, remixes, plan].find((r) => r.error);
        if (failed) setError(failed.error);
        else
          setData({
            competitors: competitors.data ?? [],
            reels: reels.data ?? [],
            remixes: remixes.data ?? [],
            plan: plan.data ?? [],
          });
      }
    );
    return () => {
      active = false;
    };
  }, [api]);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <FullPageLoader label="Loading your dashboard…" />;
  if (data.competitors.length === 0) {
    return (
      <EmptyState
        title="Start with a competitor"
        description="Track an Instagram account and fetch its Reels. Your totals, top Reels and filming progress will appear here."
        action={<Link to="/competitors" className="btn-primary">Add a competitor</Link>}
      />
    );
  }

  const stats = dashboardStats(data.competitors, data.reels, data.remixes, data.plan);
  const tiles: { label: string; value: number }[] = [
    { label: 'Competitors', value: stats.totalCompetitors },
    { label: 'Reels', value: stats.totalReels },
    { label: 'Remixes', value: stats.totalRemixes },
    { label: 'Planned videos', value: stats.plannedVideos },
    { label: 'Views', value: stats.totalViews },
    { label: 'Likes', value: stats.totalLikes },
    { label: 'Comments', value: stats.totalComments },
  ];

  return (
    <div>
      <header className="mb-12">
        <h1 className="text-5xl font-semibold leading-[0.95] tracking-[-0.03em] text-ink sm:text-6xl">
          Dashboard
        </h1>
        <p className="mt-5 max-w-md text-base text-ink/70">
          Your competitor research and filming progress at a glance.
        </p>
      </header>

      <section aria-label="Totals" className="grid grid-cols-2 gap-px bg-ground sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="bg-surface p-6">
            <p className="text-3xl font-semibold tabular-nums tracking-[-0.02em] text-ink">
              {compactNumber(tile.value)}
            </p>
            <p className="mt-2 text-sm text-ink/60">{tile.label}</p>
          </div>
        ))}
      </section>

      <div className="mt-14 grid gap-12 lg:grid-cols-2">
        <section aria-labelledby="top-reel">
          <h2 id="top-reel" className="text-xl font-semibold text-ink">Top-performing Reel</h2>
          <p className="mt-1 text-sm text-ink/60">The Reel with the most views.</p>
          {stats.topReel ? (
            <div className="mt-6 flex gap-5">
              <img
                src={stats.topReel.thumbnailUrl}
                alt={stats.topReel.caption}
                className="aspect-[4/5] w-28 bg-surface-2 object-cover"
              />
              <div>
                <p className="text-sm text-ink/60">@{stats.topReel.competitorUsername}</p>
                <p className="mt-1 text-lg font-medium leading-snug text-ink">{stats.topReel.caption}</p>
                <p className="stat mt-2">{compactNumber(stats.topReel.viewCount)} views</p>
              </div>
            </div>
          ) : (
            <p className="mt-6 text-base text-ink/70">No Reels yet. Fetch a competitor's Reels.</p>
          )}

          <h2 className="mt-12 text-xl font-semibold text-ink">Most-viewed competitor</h2>
          <p className="mt-6 text-lg text-ink">
            {stats.mostViewedCompetitor
              ? <>@{stats.mostViewedCompetitor.username} <span className="stat">· {compactNumber(stats.mostViewedCompetitor.views)} views</span></>
              : 'No Reels yet.'}
          </p>
        </section>

        <section aria-labelledby="content-progress">
          <h2 id="content-progress" className="text-xl font-semibold text-ink">Content plan progress</h2>
          <ul className="mt-6 space-y-2">
            {PLAN_STATUSES.map((s) => (
              <li key={s.value} className="flex items-center justify-between bg-surface px-5 py-3 text-base">
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

      <section aria-labelledby="recent" className="mt-14">
        <h2 id="recent" className="text-xl font-semibold text-ink">Recent Reels</h2>
        {stats.recentReels.length === 0 ? (
          <p className="mt-6 text-base text-ink/70">No Reels yet.</p>
        ) : (
          <ul className="mt-6 max-w-4xl">
            {stats.recentReels.map((reel) => (
              <li key={reel.id} className="flex flex-wrap items-center justify-between gap-4 bg-surface px-5 py-4 [&+&]:mt-2">
                <div className="min-w-0">
                  <p className="text-sm text-ink/60">@{reel.competitorUsername} · {relativeTime(reel.postedAt)}</p>
                  <p className="truncate text-base text-ink">{reel.caption}</p>
                </div>
                <span className="stat">{compactNumber(reel.viewCount)} views</span>
              </li>
            ))}
          </ul>
        )}
        <Link to="/reels" className="mt-6 inline-block text-sm text-ink/60 underline-offset-4 hover:text-ink hover:underline">
          Open the Reels library
        </Link>
      </section>
    </div>
  );
}
