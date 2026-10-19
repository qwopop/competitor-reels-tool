import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, RefreshCw, Check } from 'lucide-react';
import { useApi } from '@/services';
import type { Competitor } from '@/types';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBanner, FullPageLoader, Spinner } from '@/components/ui';
import { Modal, ConfirmDialog } from '@/components/Modal';
import { plural, relativeTime } from '@/utils/format';

export function CompetitorsPage() {
  const api = useApi();
  const [competitors, setCompetitors] = useState<Competitor[] | null>(null);
  const [reelCounts, setReelCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<Competitor | null>(null);
  const [fetchingId, setFetchingId] = useState<string | null>(null);
  const [fetchedId, setFetchedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.listCompetitors().then((res) => {
      if (!active) return;
      if (res.error) setError(res.error);
      else setCompetitors(res.data ?? []);
    });
    api.listReels().then((res) => {
      if (active && res.data) setReelCounts(countByCompetitor(res.data));
    });
    return () => {
      active = false;
    };
  }, [api]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setAdding(true);
    setAddError(null);
    const res = await api.addCompetitor(url);
    setAdding(false);
    if (res.error) {
      setAddError(res.error);
      return;
    }
    setUrl('');
    setShowAdd(false);
    const list = await api.listCompetitors();
    setCompetitors(list.data ?? []);
  }

  async function handleFetch(c: Competitor) {
    setFetchingId(c.id);
    setFetchedId(null);
    setError(null);
    const res = await api.fetchReelsForCompetitor(c.id);
    setFetchingId(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    setFetchedId(c.id);
    const reels = await api.listReels();
    setReelCounts(countByCompetitor(reels.data ?? []));
  }

  async function confirmRemove(c: Competitor) {
    setPendingRemove(null);
    const res = await api.removeCompetitor(c.id);
    if (res.error) {
      setError(res.error);
      return;
    }
    setCompetitors((prev) => prev?.filter((x) => x.id !== c.id) ?? null);
    setReelCounts((prev) => {
      const next = { ...prev };
      delete next[c.id];
      return next;
    });
  }

  return (
    <div>
      <PageHeader
        title="Track your"
        accent="competitors"
        description="Track an Instagram profile, then fetch its 20 most recent Reels into your library."
        actions={
          <button type="button" onClick={() => setShowAdd(true)} className="btn-primary">
            <Plus size={15} /> Add competitor
          </button>
        }
      />

      {error && (
        <div className="mb-10 max-w-3xl">
          <ErrorBanner message={error} />
        </div>
      )}

      {competitors === null && !error ? (
        <FullPageLoader label="Loading competitors…" />
      ) : competitors && competitors.length === 0 ? (
        <p className="text-base text-ink/70">
          No competitors yet. Add your first Instagram account to start collecting Reels.
        </p>
      ) : competitors ? (
        <ul className="max-w-3xl">
          {competitors.map((c) => {
            const isFetching = fetchingId === c.id;
            const justFetched = fetchedId === c.id;
            const count = reelCounts[c.id] ?? 0;
            return (
              <li key={c.id} className="rise rounded-2xl bg-surface px-6 py-5 transition-colors duration-200 hover:bg-surface-2 [&+&]:mt-3">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
                  <img src={c.avatarUrl} alt={c.displayName} className="h-12 w-12 rounded-full bg-surface-2 object-cover" />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-lg font-medium text-ink">{c.displayName}</h3>
                    <p className="truncate text-sm text-ink/60">
                      @{c.username} · added {relativeTime(c.addedAt)} · {plural(count, 'reel')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleFetch(c)}
                      disabled={isFetching}
                      className="btn-outline px-3.5 py-2 text-sm"
                    >
                      {isFetching ? <Spinner /> : justFetched ? <Check size={14} className="text-accent" /> : <RefreshCw size={14} />}
                      {isFetching ? 'Fetching…' : justFetched ? 'Fetched' : 'Fetch reels'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingRemove(c)}
                      className="btn-ghost px-2.5 py-2 hover:text-danger"
                      aria-label={`Remove @${c.username}`}
                      title="Remove competitor"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                {justFetched && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-accent/10 px-4 py-3 text-sm text-ink">
                    <span>Pulled 20 Reels into your library.</span>
                    <Link to="/reels" className="font-medium underline-offset-4 hover:underline">View reels</Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {showAdd && (
        <Modal
          title="Add a competitor"
          onClose={() => {
            setShowAdd(false);
            setAddError(null);
          }}
        >
          <form onSubmit={handleAdd}>
            <label htmlFor="ig-url" className="label">Instagram profile URL</label>
            <input
              id="ig-url"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://instagram.com/vibecoder or @vibecoder"
              className="input mt-3"
              autoComplete="off"
              autoFocus
              aria-describedby={addError ? 'ig-url-error' : undefined}
            />
            {addError && (
              <p id="ig-url-error" role="alert" className="mt-3 text-sm text-danger">{addError}</p>
            )}
            <div className="mt-8 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={() => setShowAdd(false)} className="btn-ghost">Cancel</button>
              <button type="submit" disabled={adding || !url.trim()} className="btn-primary">
                {adding ? <Spinner /> : null} Add competitor
              </button>
            </div>
          </form>
        </Modal>
      )}

      {pendingRemove && (
        <ConfirmDialog
          title={`Remove @${pendingRemove.username}?`}
          message="Their Reels and remixes will be deleted. Reels already in your Content Plan are kept."
          confirmLabel="Remove competitor"
          onConfirm={() => confirmRemove(pendingRemove)}
          onCancel={() => setPendingRemove(null)}
        />
      )}
    </div>
  );
}

function countByCompetitor(reels: { competitorId: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of reels) counts[r.competitorId] = (counts[r.competitorId] ?? 0) + 1;
  return counts;
}
