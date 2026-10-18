import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ContentPlanItem, Reel } from '@/types';
import { useApi } from '@/services';
import { compactNumber, relativeTime } from '@/utils/format';
import { EmptyState, ErrorBanner, FullPageLoader, Spinner } from '@/components/ui';
import { planStatusMeta } from '@/utils/plan';

export function DashboardPage() {
  const api = useApi();
  const navigate = useNavigate();
  const [reels, setReels] = useState<Reel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remixingId, setRemixingId] = useState<string | null>(null);
  // Plan items keyed by the Reel they came from, so each card knows its state.
  const [planByReel, setPlanByReel] = useState<Record<string, ContentPlanItem>>({});

  useEffect(() => {
    let active = true;
    api.listReels().then((res) => {
      if (!active) return;
      if (res.error) setError(res.error);
      else setReels(res.data ?? []);
    });
    api.listContentPlan().then((res) => {
      if (!active || !res.data) return;
      setPlanByReel(Object.fromEntries(res.data.map((item) => [item.reelId, item])));
    });
    return () => {
      active = false;
    };
  }, [api]);

  async function handleAddToPlan(reel: Reel) {
    const res = await api.addToContentPlan(reel.id);
    if (res.error || !res.data) {
      setError(res.error ?? 'Could not add to the content plan.');
      return;
    }
    const item = res.data;
    setPlanByReel((prev) => ({ ...prev, [reel.id]: item }));
  }

  async function handleRemix(reel: Reel) {
    setRemixingId(reel.id);
    const res = await api.remixReel(reel.id);
    setRemixingId(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.data) navigate(`/remix/${res.data.id}`);
  }

  return (
    <div>
      <header className="mb-14 flex flex-wrap items-end justify-between gap-8">
        <div>
          <h1 className="text-5xl font-semibold leading-[0.95] tracking-[-0.03em] text-ink sm:text-6xl">
            Reels
          </h1>
          <p className="mt-5 max-w-md text-base text-ink/70">
            Every Reel from your tracked competitors, newest first. Remix any of
            them into a breakdown you can edit.
          </p>
        </div>
        <Link to="/competitors" className="btn-outline">
          Add a competitor
        </Link>
      </header>

      {error && (
        <div className="mb-10">
          <ErrorBanner message={error} />
        </div>
      )}

      {reels === null && !error ? (
        <FullPageLoader label="Loading your reels…" />
      ) : reels && reels.length === 0 ? (
        <EmptyState
          title="No reels yet"
          description="Track an Instagram competitor and fetch their latest Reels to fill this library."
          action={
            <Link to="/competitors" className="btn-primary">
              Go to competitors
            </Link>
          }
        />
      ) : reels && reels.length > 0 ? (
        <div className="grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          {reels.map((reel, index) => (
            <article
              key={reel.id}
              className="rise"
              style={{ '--i': Math.min(index, 8) } as React.CSSProperties}
            >
              <img
                src={reel.thumbnailUrl}
                alt={reel.caption}
                loading="lazy"
                className="aspect-[4/5] w-full bg-surface-2 object-cover"
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
              <div className="mt-5 flex flex-wrap items-center gap-3">
                {planByReel[reel.id] ? (
                  <span className="px-4 py-2 text-sm text-ink/70">
                    <span aria-hidden="true">{planStatusMeta(planByReel[reel.id].status).emoji}</span>{' '}
                    In content plan
                  </span>
                ) : (
                  <button
                    onClick={() => handleAddToPlan(reel)}
                    className="btn-outline px-4 py-2 text-sm"
                  >
                    Add to plan
                  </button>
                )}
                <button
                  onClick={() => handleRemix(reel)}
                  disabled={remixingId === reel.id}
                  className="btn-primary px-4 py-2 text-sm"
                >
                  {remixingId === reel.id ? (
                    <>
                      <Spinner /> Remixing…
                    </>
                  ) : (
                    'Remix'
                  )}
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
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
