import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, RefreshCw, Check } from 'lucide-react';
import { useApi } from '@/services';
import type { Competitor } from '@/types';
import { ErrorBanner, FullPageLoader, Spinner } from '@/components/ui';
import { relativeTime } from '@/utils/format';

export function CompetitorsPage() {
  const api = useApi();
  const [competitors, setCompetitors] = useState<Competitor[] | null>(null);
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchingId, setFetchingId] = useState<string | null>(null);
  const [fetchedId, setFetchedId] = useState<string | null>(null);
  const [reelCounts, setReelCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    api.listCompetitors().then((res) => {
      if (!active) return;
      if (res.error) setError(res.error);
      else setCompetitors(res.data ?? []);
    });
    return () => {
      active = false;
    };
  }, [api]);

  useEffect(() => {
    if (!competitors) return;
    let active = true;
    api.listReels().then((res) => {
      if (!active) return;
      setReelCounts(countByCompetitor(res.data ?? []));
    });
    return () => {
      active = false;
    };
  }, [api, competitors]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setAdding(true);
    setError(null);
    const res = await api.addCompetitor(url);
    setAdding(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setUrl('');
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

  async function handleRemove(c: Competitor) {
    await api.removeCompetitor(c.id);
    setCompetitors((prev) => prev?.filter((x) => x.id !== c.id) ?? null);
    setReelCounts((prev) => {
      const next = { ...prev };
      delete next[c.id];
      return next;
    });
  }

  return (
    <div>
      <header className="mb-14">
        <h1 className="text-5xl font-semibold leading-[0.95] tracking-[-0.03em] text-ink sm:text-6xl">
          Competitors
        </h1>
        <p className="mt-5 max-w-md text-base text-ink/70">
          Paste an Instagram profile to track it. Fetch its 20 most recent Reels
          into your library.
        </p>
      </header>

      <form onSubmit={handleAdd} className="mb-14 max-w-2xl">
        <label htmlFor="ig-url" className="label">
          Instagram profile URL
        </label>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            id="ig-url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://instagram.com/vibecoder"
            className="input"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={adding || !url.trim()}
            className="btn-primary whitespace-nowrap"
          >
            {adding ? <Spinner /> : <Plus size={15} />} Add competitor
          </button>
        </div>
        <p className="mt-3 text-sm text-ink/50">
          A bare @username works too.
        </p>
      </form>

      {error && (
        <div className="mb-10 max-w-2xl">
          <ErrorBanner message={error} />
        </div>
      )}

      {competitors === null ? (
        <FullPageLoader label="Loading competitors…" />
      ) : competitors.length === 0 ? (
        <p className="text-base text-ink/70">
          No competitors yet. Add your first Instagram account above.
        </p>
      ) : (
        <ul className="max-w-3xl">
          {competitors.map((c) => {
            const isFetching = fetchingId === c.id;
            const justFetched = fetchedId === c.id;
            const count = reelCounts[c.id] ?? 0;
            return (
              <li key={c.id} className="bg-surface px-6 py-5 [&+&]:mt-2">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
                  <img
                    src={c.avatarUrl}
                    alt={c.displayName}
                    className="h-12 w-12 bg-surface-2 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-lg font-medium text-ink">
                      {c.displayName}
                    </h3>
                    <p className="truncate text-sm text-ink/60">
                      @{c.username} · added {relativeTime(c.addedAt)} · {count}{' '}
                      reels
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleFetch(c)}
                      disabled={isFetching}
                      className="btn-outline px-3.5 py-2 text-sm"
                    >
                      {isFetching ? (
                        <Spinner />
                      ) : justFetched ? (
                        <Check size={14} className="text-accent" />
                      ) : (
                        <RefreshCw size={14} />
                      )}
                      {isFetching ? 'Fetching…' : justFetched ? 'Fetched' : 'Fetch reels'}
                    </button>
                    <button
                      onClick={() => handleRemove(c)}
                      className="btn-ghost px-2.5 py-2 hover:text-danger"
                      title="Remove competitor"
                      aria-label="Remove competitor"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {justFetched && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 bg-accent/10 px-4 py-3 text-sm text-ink">
                    <span>Pulled 20 Reels into your library.</span>
                    <Link to="/" className="font-medium underline-offset-4 hover:underline">
                      View reels
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function countByCompetitor(reels: { competitorId: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of reels) counts[r.competitorId] = (counts[r.competitorId] ?? 0) + 1;
  return counts;
}
