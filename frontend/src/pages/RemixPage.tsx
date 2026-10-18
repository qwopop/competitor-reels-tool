import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Sparkles,
  Eye,
  Heart,
  MessageCircle,
  Save,
  Check,
  Anchor,
  FileText,
  Megaphone,
  ExternalLink,
} from 'lucide-react';
import { useApi } from '@/services';
import type { Reel, RemixedReel } from '@/types';
import { compactNumber, relativeTime } from '@/utils/format';
import { ErrorBanner, FullPageLoader, Spinner } from '@/components/ui';

export function RemixPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();

  const [remix, setRemix] = useState<RemixedReel | null>(null);
  const [reel, setReel] = useState<Reel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [hook, setHook] = useState('');
  const [script, setScript] = useState('');
  const [cta, setCta] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    (async () => {
      const remixRes = await api.getRemix(id);
      if (!active) return;
      if (remixRes.error || !remixRes.data) {
        setError(remixRes.error ?? 'Remix not found.');
        setLoading(false);
        return;
      }
      const r = remixRes.data;
      setRemix(r);
      setTitle(r.title);
      setHook(r.hook);
      setScript(r.script);
      setCta(r.cta);
      const reelRes = await api.getReel(r.reelId);
      if (!active) return;
      if (reelRes.data) setReel(reelRes.data);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [api, id]);

  function markDirty(setter: (v: string) => void) {
    return (e: { target: { value: string } }) => {
      setter(e.target.value);
      setDirty(true);
    };
  }

  async function handleSave() {
    if (!remix) return;
    setSaving(true);
    const res = await api.updateRemix(remix.id, { title, hook, script, cta });
    setSaving(false);
    if (res.error || !res.data) {
      setError(res.error ?? 'Could not save.');
      return;
    }
    setRemix(res.data);
    setSavedAt(res.data.updatedAt);
    setDirty(false);
  }

  if (loading) return <FullPageLoader label="Loading remix…" />;
  if (error)
    return (
      <div className="animate-fade-in">
        <BackLink />
        <div className="mt-6">
          <ErrorBanner message={error} />
        </div>
      </div>
    );
  if (!remix) return null;

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <BackLink />
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-xs text-warn-400">Unsaved changes</span>
          )}
          {savedAt && !dirty && (
            <span className="inline-flex items-center gap-1 text-xs text-accent-300">
              <Check size={13} /> Saved {relativeTime(savedAt)}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="btn-primary"
          >
            {saving ? <Spinner /> : <Save size={15} />} Save changes
          </button>
        </div>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-white">
        {title || 'Untitled remix'}
      </h1>
      <p className="mt-1 text-sm text-gray-400">
        AI breakdown of the source Reel — edit the hook, script, and CTA directly.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
        {/* Source Reel panel */}
        <section className="card h-fit overflow-hidden">
          {reel ? (
            <>
              <div className="relative aspect-[4/5] overflow-hidden bg-ink-900">
                <img
                  src={reel.thumbnailUrl}
                  alt={reel.caption}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink-950 to-transparent" />
                <div className="absolute bottom-3 left-3 flex items-center gap-3 text-[11px] text-white/90">
                  <span className="inline-flex items-center gap-1">
                    <Eye size={12} /> {compactNumber(reel.viewCount)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Heart size={12} /> {compactNumber(reel.likeCount)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle size={12} />{' '}
                    {compactNumber(reel.commentCount)}
                  </span>
                </div>
              </div>
              <div className="p-4">
                <p className="text-[11px] uppercase tracking-wider text-accent-300/80">
                  @{reel.competitorUsername} · {relativeTime(reel.postedAt)}
                </p>
                <p className="mt-1.5 text-sm text-gray-200">{reel.caption}</p>
                <a
                  href={reel.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200"
                >
                  View profile on Instagram <ExternalLink size={12} />
                </a>
              </div>
            </>
          ) : (
            <div className="p-5 text-sm text-gray-400">
              Source Reel is no longer available.
            </div>
          )}
        </section>

        {/* Editor panel */}
        <section className="card p-6">
          <div className="mb-5 flex items-center gap-2 text-accent-300">
            <Sparkles size={16} />
            <h2 className="text-sm font-semibold uppercase tracking-wider">
              Remix editor
            </h2>
          </div>

          <div className="space-y-6">
            <Field label="Title" icon={<FileText size={14} />}>
              <input
                className="input"
                value={title}
                onChange={markDirty(setTitle)}
                placeholder="Give your remix a title"
              />
            </Field>

            <Field
              label="Hook"
              icon={<Anchor size={14} />}
              hint="The first line that stops the scroll."
            >
              <textarea
                className="input min-h-[80px] resize-y"
                value={hook}
                onChange={markDirty(setHook)}
                placeholder="Write a scroll-stopping hook…"
              />
            </Field>

            <Field
              label="Script"
              icon={<FileText size={14} />}
              hint="Beat-by-beat what happens in the video."
            >
              <textarea
                className="input min-h-[160px] resize-y font-mono text-[13px] leading-relaxed"
                value={script}
                onChange={markDirty(setScript)}
                placeholder="Break the video into beats…"
              />
            </Field>

            <Field
              label="Call to action"
              icon={<Megaphone size={14} />}
              hint="What the viewer should do next."
            >
              <textarea
                className="input min-h-[72px] resize-y"
                value={cta}
                onChange={markDirty(setCta)}
                placeholder="Tell the viewer what to do next…"
              />
            </Field>
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
            <span className="text-[11px] text-gray-500">
              Created {relativeTime(remix.createdAt)}
            </span>
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="btn-primary"
            >
              {saving ? <Spinner /> : <Save size={15} />} Save changes
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/"
      className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white"
    >
      <ArrowLeft size={15} /> Back to dashboard
    </Link>
  );
}

function Field({
  label,
  icon,
  hint,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-accent-300">{icon}</span>
        <label className="label">{label}</label>
      </div>
      {children}
      {hint ? (
        <p className="mt-1.5 text-[11px] text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
}
