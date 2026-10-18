import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ContentPlanItem, PlanStatus } from '@/types';
import { useApi } from '@/services';
import { relativeTime } from '@/utils/format';
import { PLAN_STATUSES } from '@/utils/plan';
import { EmptyState, ErrorBanner, FullPageLoader } from '@/components/ui';

export function ContentPlanPage() {
  const api = useApi();
  const [items, setItems] = useState<ContentPlanItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.listContentPlan().then((res) => {
      if (!active) return;
      if (res.error) setError(res.error);
      else setItems(res.data ?? []);
    });
    return () => {
      active = false;
    };
  }, [api]);

  async function handleStatus(item: ContentPlanItem, status: PlanStatus) {
    if (item.status === status) return;
    setBusyId(item.id);
    setError(null);
    const res = await api.updateContentPlanStatus(item.id, status);
    setBusyId(null);
    if (res.error || !res.data) {
      setError(res.error ?? 'Could not update the status.');
      return;
    }
    const updated = res.data;
    setItems((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null);
  }

  async function handleRemove(item: ContentPlanItem) {
    setError(null);
    const res = await api.removeFromContentPlan(item.id);
    if (res.error) {
      setError(res.error);
      return;
    }
    setItems((prev) => prev?.filter((x) => x.id !== item.id) ?? null);
  }

  return (
    <div>
      <header className="mb-12">
        <h1 className="text-5xl font-semibold leading-[0.95] tracking-[-0.03em] text-ink sm:text-6xl">
          Content plan
        </h1>
        <p className="mt-5 max-w-md text-base text-ink/70">
          Reels you are filming. Move each one along as it gets scripted, filmed
          and posted.
        </p>
      </header>

      {items && items.length > 0 && (
        <ul className="mb-10 flex flex-wrap gap-x-8 gap-y-2 text-sm text-ink/70">
          {PLAN_STATUSES.map((s) => (
            <li key={s.value}>
              <span aria-hidden="true">{s.emoji}</span> {s.label}{' '}
              <span className="tabular-nums text-ink">
                {items.filter((item) => item.status === s.value).length}
              </span>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="mb-10 max-w-3xl">
          <ErrorBanner message={error} />
        </div>
      )}

      {items === null && !error ? (
        <FullPageLoader label="Loading your plan…" />
      ) : items && items.length === 0 ? (
        <EmptyState
          title="Nothing planned yet"
          description="Add Reels from the Reels page to start your filming list."
          action={
            <Link to="/" className="btn-primary">
              Go to reels
            </Link>
          }
        />
      ) : items ? (
        <ul className="max-w-4xl">
          {items.map((item) => (
            <li key={item.id} className="rise bg-surface p-5 [&+&]:mt-2">
              <div className="flex flex-wrap items-center gap-5">
                <img
                  src={item.thumbnailUrl}
                  alt={item.caption}
                  className="aspect-[4/5] w-20 bg-surface-2 object-cover"
                />
                <div className="min-w-0 flex-1 basis-64">
                  <p className="text-sm text-ink/60">
                    @{item.competitorUsername} · {relativeTime(item.postedAt)}
                  </p>
                  <h3 className="mt-1 text-lg font-medium leading-snug text-ink">
                    {item.caption}
                  </h3>
                  <a
                    href={item.permalink}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-sm text-ink/60 underline-offset-4 transition-colors hover:text-ink hover:underline"
                  >
                    View profile on Instagram
                  </a>
                </div>

                <div
                  role="group"
                  aria-label={`Status for ${item.caption}`}
                  className="flex flex-wrap gap-1"
                >
                  {PLAN_STATUSES.map((s) => {
                    const active = item.status === s.value;
                    return (
                      <button
                        key={s.value}
                        type="button"
                        aria-pressed={active}
                        disabled={busyId === item.id}
                        onClick={() => handleStatus(item, s.value)}
                        className={[
                          'px-3 py-2 text-sm transition-colors duration-200',
                          active
                            ? 'bg-surface-3 text-ink'
                            : 'text-ink/60 hover:bg-surface-2 hover:text-ink',
                        ].join(' ')}
                      >
                        <span aria-hidden="true">{s.emoji}</span> {s.label}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => handleRemove(item)}
                  className="btn-ghost px-2 py-2 text-sm hover:text-danger"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
