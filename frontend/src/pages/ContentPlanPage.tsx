import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ContentPlanItem, PlanStatus, RemixedVideo } from '@/types';
import { useApi } from '@/services';
import { formatDate, relativeTime } from '@/utils/format';
import { PLAN_STATUSES } from '@/utils/plan';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorBanner, FullPageLoader, Spinner } from '@/components/ui';
import { ViewToggle } from '@/components/ViewToggle';
import { ConfirmDialog } from '@/components/Modal';
import { VideoOnInstagramLink } from '@/components/InstagramVideosLink';

type PlanView = 'board' | 'table';

export function ContentPlanPage() {
  const api = useApi();
  const navigate = useNavigate();
  const [items, setItems] = useState<ContentPlanItem[] | null>(null);
  const [remixByVideo, setRemixByVideo] = useState<Record<string, RemixedVideo>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [view, setView] = useState<PlanView>('board');
  const [pendingRemove, setPendingRemove] = useState<ContentPlanItem | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([api.listContentPlan(), api.listRemixes()]).then(([planRes, remixRes]) => {
      if (!active) return;
      if (planRes.error) setError(planRes.error);
      else setItems(planRes.data ?? []);
      if (remixRes.data) setRemixByVideo(Object.fromEntries(remixRes.data.map((r) => [r.videoId, r])));
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
    setPendingRemove(null);
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
    const existing = remixByVideo[item.videoId];
    if (existing) {
      navigate(`/remix/${existing.id}`);
      return;
    }
    setBusyId(item.id);
    const res = await api.remixVideo(item.videoId);
    setBusyId(null);
    if (res.error || !res.data) {
      setError(
        res.error === 'Video not found.'
          ? "This Video is no longer in your library, so a breakdown can't be created."
          : (res.error ?? 'Could not create the breakdown.')
      );
      return;
    }
    navigate(`/remix/${res.data.id}`);
  }

  return (
    <div>
      <PageHeader
        title="Your"
        accent="content plan"
        description="Videos you are filming. Move each one along as it gets scripted, filmed and posted."
        actions={
          items && items.length > 0 ? (
            <ViewToggle<PlanView>
              label="Plan layout"
              value={view}
              onChange={setView}
              options={[
                { value: 'board', label: 'Board' },
                { value: 'table', label: 'Table' },
              ]}
            />
          ) : undefined
        }
      />

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
          description="Add Videos from the Videos page to start your filming list."
          action={<Link to="/videos" className="btn-primary">Go to videos</Link>}
        />
      ) : items && view === 'board' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {PLAN_STATUSES.map((column) => (
            <section key={column.value} aria-labelledby={`col-${column.value}`} className="rounded-3xl bg-surface p-4">
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
                      remix={remixByVideo[item.videoId]}
                      busy={busyId === item.id}
                      onStatus={(status) => handleStatus(item, status)}
                      onEditRemix={() => handleEditRemix(item)}
                      onRemove={() => setPendingRemove(item)}
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
                <th scope="col" className="px-4 py-2 font-medium">Video</th>
                <th scope="col" className="px-4 py-2 font-medium">Competitor</th>
                <th scope="col" className="px-4 py-2 font-medium">Status</th>
                <th scope="col" className="px-4 py-2 font-medium">Hook</th>
                <th scope="col" className="px-4 py-2 font-medium">Added</th>
                <th scope="col" className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const remix = remixByVideo[item.videoId];
                return (
                  <tr key={item.id} className="bg-surface">
                    <td className="px-4 py-4 align-top text-base text-ink">
                      <div className="flex items-center gap-3">
                        <img src={item.thumbnailUrl} alt="" className="aspect-[4/5] w-10 rounded-lg bg-surface-2 object-cover" />
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
                      <button type="button" onClick={() => setPendingRemove(item)} className="btn-ghost mt-2 px-2 py-1 text-xs hover:text-danger">
                        Remove from plan
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {pendingRemove && (
        <ConfirmDialog
          title={`Remove “${pendingRemove.caption}”?`}
          message="This Video will leave your Content Plan. Its breakdown, if you made one, is kept."
          confirmLabel="Remove from plan"
          onConfirm={() => handleRemove(pendingRemove)}
          onCancel={() => setPendingRemove(null)}
        />
      )}
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
  remix: RemixedVideo | undefined;
  busy: boolean;
  onStatus: (status: PlanStatus) => void;
  onEditRemix: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="rise rounded-2xl bg-surface-2 p-4">
      <div className="flex gap-4">
        <img src={item.thumbnailUrl} alt="" className="aspect-[4/5] w-16 rounded-xl bg-surface-3 object-cover" />
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
              'rounded-full px-2.5 py-1.5 text-xs transition-colors duration-200',
              active ? 'bg-white/10 text-ink' : 'text-ink/60 hover:bg-white/5 hover:text-ink',
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
      <VideoOnInstagramLink
        permalink={item.permalink}
        username={item.competitorUsername}
        className="text-ink/60 underline-offset-4 transition-colors hover:text-ink hover:underline"
      />
    </div>
  );
}
