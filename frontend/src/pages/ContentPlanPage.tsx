import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ContentPlanItem, PlanStatus, RemixedReel } from '@/types';
import { useApi } from '@/services';
import { formatDate, relativeTime } from '@/utils/format';
import { PLAN_STATUSES } from '@/utils/plan';
import { EmptyState, ErrorBanner, FullPageLoader, Spinner } from '@/components/ui';
import { ViewToggle } from '@/components/ViewToggle';

type PlanView = 'board' | 'table';

export function ContentPlanPage() {
  const api = useApi();
  const navigate = useNavigate();
  const [items, setItems] = useState<ContentPlanItem[] | null>(null);
  const [remixByReel, setRemixByReel] = useState<Record<string, RemixedReel>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [view, setView] = useState<PlanView>('board');

  useEffect(() => {
    let active = true;
    Promise.all([api.listContentPlan(), api.listRemixes()]).then(([planRes, remixRes]) => {
      if (!active) return;
      if (planRes.error) setError(planRes.error);
      else setItems(planRes.data ?? []);
      if (remixRes.data) setRemixByReel(Object.fromEntries(remixRes.data.map((r) => [r.reelId, r])));
    });
    return () => {
      active = false;
    };
  }, [api]);

  const countsByStatus = useMemo(() => {
    const counts: Record<PlanStatus, number> = { not_started: 0, ready: 0, filmed: 0 };
    for (const item of items ?? []) counts[item.status] += 1;
    return counts;
  }, [items]);

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

  // Opens the remix for this item, creating a default breakdown if there is none yet.
  async function handleEditRemix(item: ContentPlanItem) {
    const existing = remixByReel[item.reelId];
    if (existing) {
      navigate(`/remix/${existing.id}`);
      return;
    }
    setBusyId(item.id);
    const res = await api.remixReel(item.reelId);
    setBusyId(null);
    if (res.error || !res.data) {
      setError(res.error ?? 'Could not create the breakdown.');
      return;
    }
    navigate(`/remix/${res.data.id}`);
  }

  return (
    <div>
      <header className="mb-10 flex flex-wrap items-end justify-between gap-8">
        <div>
          <h1 className="text-5xl font-semibold leading-[0.95] tracking-[-0.03em] text-ink sm:text-6xl">
            Content plan
          </h1>
          <p className="mt-5 max-w-md text-base text-ink/70">
            Reels you are filming. Move each one along as it gets scripted, filmed and posted.
          </p>
        </div>
        {items && items.length > 0 && (
          <ViewToggle<PlanView>
            label="Plan layout"
            value={view}
            onChange={setView}
            options={[
              { value: 'board', label: 'Board' },
              { value: 'table', label: 'Table' },
            ]}
          />
        )}
      </header>

      {items && items.length > 0 && (
        <ul className="mb-10 flex flex-wrap gap-x-8 gap-y-2 text-sm text-ink/70">
          {PLAN_STATUSES.map((s) => (
            <li key={s.value}>
              <span aria-hidden="true">{s.emoji}</span> {s.label}{' '}
              <span className="tabular-nums text-ink">{countsByStatus[s.value]}</span>
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
          action={<Link to="/reels" className="btn-primary">Go to reels</Link>}
        />
      ) : items && view === 'board' ? (
        <div className="grid grid-cols-1 gap-px bg-ground md:grid-cols-3">
          {PLAN_STATUSES.map((column) => (
            <section key={column.value} aria-labelledby={`col-${column.value}`} className="bg-surface-2/40 p-4">
              <h2 id={`col-${column.value}`} className="px-2 pb-4 text-base font-medium text-ink">
                <span aria-hidden="true">{column.emoji}</span> {column.label}{' '}
                <span className="tabular-nums text-ink/60">{countsByStatus[column.value]}</span>
              </h2>
              <ul className="space-y-3">
                {items
                  .filter((item) => item.status === column.value)
                  .map((item) => (
                    <PlanCard
                      key={item.id}
                      item={item}
                      remix={remixByReel[item.reelId]}
                      busy={busyId === item.id}
                      onStatus={(status) => handleStatus(item, status)}
                      onEditRemix={() => handleEditRemix(item)}
                      onRemove={() => handleRemove(item)}
                    />
                  ))}
              </ul>
            </section>
          ))}
        </div>
      ) : items ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] border-separate border-spacing-y-2 text-left text-sm">
            <thead>
              <tr className="text-ink/60">
                <th scope="col" className="px-4 py-2 font-medium">Reel</th>
                <th scope="col" className="px-4 py-2 font-medium">Competitor</th>
                <th scope="col" className="px-4 py-2 font-medium">Status</th>
                <th scope="col" className="px-4 py-2 font-medium">Hook</th>
                <th scope="col" className="px-4 py-2 font-medium">Added</th>
                <th scope="col" className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const remix = remixByReel[item.reelId];
                return (
                  <tr key={item.id} className="bg-surface">
                    <td className="px-4 py-4 align-top text-base text-ink">
                      <div className="flex items-center gap-3">
                        <img src={item.thumbnailUrl} alt="" className="aspect-[4/5] w-10 bg-surface-2 object-cover" />
                        <span className="max-w-xs">{item.caption}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top text-ink/70">@{item.competitorUsername}</td>
                    <td className="px-4 py-4 align-top">
                      <StatusControl item={item} busy={busyId === item.id} onChange={(s) => handleStatus(item, s)} />
                    </td>
                    <td className="px-4 py-4 align-top text-ink/70">{remix ? remix.hook : 'No breakdown yet'}</td>
                    <td className="px-4 py-4 align-top text-ink/70">{formatDate(item.addedAt)}</td>
                    <td className="px-4 py-4 align-top">
                      <PlanLinks item={item} hasRemix={Boolean(remix)} busy={busyId === item.id} onEditRemix={() => handleEditRemix(item)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function PlanCard({
  item,
  remix,
  busy,
  onStatus,
  onEditRemix,
  onRemove,
}: {
  item: ContentPlanItem;
  remix: RemixedReel | undefined;
  busy: boolean;
  onStatus: (status: PlanStatus) => void;
  onEditRemix: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="rise bg-surface p-4">
      <div className="flex gap-4">
        <img src={item.thumbnailUrl} alt="" className="aspect-[4/5] w-16 bg-surface-2 object-cover" />
        <div className="min-w-0">
          <p className="text-xs text-ink/60">@{item.competitorUsername} · added {relativeTime(item.addedAt)}</p>
          <h3 className="mt-1 text-base font-medium leading-snug text-ink">{item.caption}</h3>
          <p className="mt-2 line-clamp-2 text-sm text-ink/70">
            {remix ? remix.hook : 'No breakdown yet. Create one to see a hook here.'}
          </p>
        </div>
      </div>
      <div className="mt-4">
        <StatusControl item={item} busy={busy} onChange={onStatus} />
      </div>
      <div className="mt-3">
        <PlanLinks item={item} hasRemix={Boolean(remix)} busy={busy} onEditRemix={onEditRemix} />
      </div>
      <button type="button" onClick={onRemove} className="btn-ghost mt-2 px-2 py-1 text-xs hover:text-danger">
        Remove from plan
      </button>
    </li>
  );
}

function StatusControl({
  item,
  busy,
  onChange,
}: {
  item: ContentPlanItem;
  busy: boolean;
  onChange: (status: PlanStatus) => void;
}) {
  return (
    <div role="group" aria-label={`Status for ${item.caption}`} className="flex flex-wrap gap-1">
      {PLAN_STATUSES.map((s) => {
        const active = item.status === s.value;
        return (
          <button
            key={s.value}
            type="button"
            aria-pressed={active}
            disabled={busy}
            onClick={() => onChange(s.value)}
            className={[
              'px-2.5 py-1.5 text-xs transition-colors duration-200',
              active ? 'bg-surface-3 text-ink' : 'text-ink/60 hover:bg-surface-2 hover:text-ink',
            ].join(' ')}
          >
            <span aria-hidden="true">{s.emoji}</span> {s.label}
          </button>
        );
      })}
    </div>
  );
}

function PlanLinks({
  item,
  hasRemix,
  busy,
  onEditRemix,
}: {
  item: ContentPlanItem;
  hasRemix: boolean;
  busy: boolean;
  onEditRemix: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button type="button" onClick={onEditRemix} disabled={busy} className="btn-outline px-3 py-1.5 text-xs">
        {busy ? <Spinner /> : null} {hasRemix ? 'Edit remix' : 'Create breakdown'}
      </button>
      <a
        href={item.permalink}
        target="_blank"
        rel="noreferrer"
        className="text-ink/60 underline-offset-4 transition-colors hover:text-ink hover:underline"
      >
        View profile on Instagram
      </a>
    </div>
  );
}
