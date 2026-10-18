import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Instagram,
  Plus,
  Trash2,
  RefreshCw,
  Film,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
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
      const reels = res.data ?? [];
      const counts: Record<string, number> = {};
      for (const r of reels) counts[r.competitorId] = (counts[r.competitorId] ?? 0) + 1;
      setReelCounts(counts);
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
    const counts: Record<string, number> = {};
    for (const r of reels.data ?? []) counts[r.competitorId] = (counts[r.competitorId] ?? 0) + 1;
    setReelCounts(counts);
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
    <div className="animate-fade-in">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Competitors
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Paste any Instagram profile URL to track a competitor and pull their 20
          most recent Reels into your library.
        </p>
      </header>

      <form onSubmit={handleAdd} className="card mb-8 p-5">
        <label htmlFor="ig-url" className="label">
          Instagram profile URL
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Instagram
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500"
            />
            <input
              id="ig-url"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://instagram.com/vibecoder"
              className="input pl-10"
              autoComplete="off"
            />
          </div>
          <button type="submit" disabled={adding || !url.trim()} className="btn-primary">
            {adding ? <Spinner /> : <Plus size={15} />} Add competitor
          </button>
        </div>
        <p className="mt-2 text-[11px] text-gray-500">
          Tip: you can also paste a bare <span className="text-gray-300">@username</span>.
        </p>
      </form>

      {error && <div className="mb-6"><ErrorBanner message={error} /></div>}

      {competitors === null ? (
        <FullPageLoader label="Loading competitors…" />
      ) : competitors.length === 0 ? (
        <div className="card flex flex-col items-center justify-center px-6 py-14 text-center">
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-brand-500/10 text-brand-300">
            <Instagram size={20} />
          </div>
          <h3 className="text-base font-semibold text-white">No competitors yet</h3>
          <p className="mt-1 max-w-sm text-sm text-gray-400">
            Add your first Instagram account above to start collecting Reels.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {competitors.map((c) => {
            const isFetching = fetchingId === c.id;
            const justFetched = fetchedId === c.id;
            const count = reelCounts[c.id] ?? 0;
            return (
              <li key={c.id} className="card p-5">
                <div className="flex flex-wrap items-center gap-4">
                  <img
                    src={c.avatarUrl}
                    alt={c.displayName}
                    className="h-12 w-12 rounded-full border border-white/10 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-white">
                        {c.displayName}
                      </h3>
                      <a
                        href={c.instagramUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-gray-500 hover:text-gray-300"
                        title="Open on Instagram"
                      >
                        <ExternalLink size={13} />
                      </a>
                    </div>
                    <p className="truncate text-xs text-gray-500">
                      @{c.username} · added {relativeTime(c.addedAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="chip border border-white/10 bg-white/5 text-gray-300">
                      <Film size={12} /> {count} reels
                    </span>
                    <button
                      onClick={() => handleFetch(c)}
                      disabled={isFetching}
                      className="btn-outline px-3 py-1.5 text-xs"
                    >
                      {isFetching ? (
                        <Spinner />
                      ) : justFetched ? (
                        <CheckCircle2 size={13} className="text-accent-400" />
                      ) : (
                        <RefreshCw size={13} />
                      )}
                      {isFetching ? 'Fetching…' : justFetched ? 'Fetched' : 'Fetch reels'}
                    </button>
                    <button
                      onClick={() => handleRemove(c)}
                      className="btn-ghost px-2.5 py-1.5 text-xs text-gray-400 hover:text-danger-400"
                      title="Remove competitor"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {justFetched && (
                  <div className="mt-4 flex items-center justify-between rounded-lg border border-accent-500/20 bg-accent-500/10 px-4 py-3 text-sm text-accent-200">
                    <span>Pulled 20 Reels into your library.</span>
                    <Link to="/" className="font-medium underline-offset-2 hover:underline">
                      View dashboard
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
