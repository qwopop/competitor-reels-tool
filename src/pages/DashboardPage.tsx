import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Film,
  Heart,
  MessageCircle,
  Play,
  Sparkles,
  Eye,
  ArrowRight,
} from 'lucide-react';
import { useApi } from '@/services';
import type { Reel } from '@/types';
import { compactNumber, relativeTime } from '@/utils/format';
import { EmptyState, ErrorBanner, FullPageLoader, Spinner } from '@/components/ui';

export function DashboardPage() {
  const api = useApi();
  const navigate = useNavigate();
  const [reels, setReels] = useState<Reel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remixingId, setRemixingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.listReels().then((res) => {
      if (!active) return;
      if (res.error) setError(res.error);
      else setReels(res.data ?? []);
    });
    return () => {
      active = false;
    };
  }, [api]);

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
    <div className="animate-fade-in">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Reels Library
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Every Reel fetched from your tracked competitors. Remix any of them
            into an AI breakdown.
          </p>
        </div>
        <Link to="/competitors" className="btn-outline">
          <Sparkles size={15} /> Add a competitor
        </Link>
      </header>

      {error && <div className="mb-6"><ErrorBanner message={error} /></div>}

      {reels === null && !error ? (
        <FullPageLoader label="Loading your reels…" />
      ) : reels && reels.length === 0 ? (
        <EmptyState
          icon={<Film size={22} />}
          title="No reels yet"
          description="Add an Instagram competitor and fetch their latest Reels to see them here."
          action={
            <Link to="/competitors" className="btn-primary">
              Go to Competitors <ArrowRight size={15} />
            </Link>
          }
        />
      ) : reels && reels.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {reels.map((reel) => (
            <article
              key={reel.id}
              className="card group overflow-hidden transition-all duration-300 hover:border-white/20 hover:shadow-card"
            >
              <div className="relative aspect-[4/5] overflow-hidden bg-ink-900">
                <img
                  src={reel.thumbnailUrl}
                  alt={reel.caption}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/30 to-transparent" />
                <div className="absolute left-3 top-3 chip bg-black/50 text-white backdrop-blur-sm">
                  <Play size={11} /> Reel
                </div>
                <div className="absolute bottom-3 left-3 flex items-center gap-3 text-[11px] text-white/90">
                  <span className="inline-flex items-center gap-1">
                    <Eye size={12} /> {compactNumber(reel.viewCount)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Heart size={12} /> {compactNumber(reel.likeCount)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle size={12} /> {compactNumber(reel.commentCount)}
                  </span>
                </div>
              </div>

              <div className="p-4">
                <p className="text-[11px] uppercase tracking-wider text-accent-300/80">
                  @{reel.competitorUsername} · {relativeTime(reel.postedAt)}
                </p>
                <h3 className="mt-1.5 line-clamp-2 min-h-[2.5rem] text-sm font-medium text-white">
                  {reel.caption}
                </h3>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <a
                    href={reel.permalink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-gray-500 underline-offset-2 hover:text-gray-300 hover:underline"
                  >
                    View on Instagram
                  </a>
                  <button
                    onClick={() => handleRemix(reel)}
                    disabled={remixingId === reel.id}
                    className="btn-primary px-3 py-1.5 text-xs"
                  >
                    {remixingId === reel.id ? (
                      <>
                        <Spinner /> Remixing…
                      </>
                    ) : (
                      <>
                        <Sparkles size={13} /> Remix
                      </>
                    )}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
