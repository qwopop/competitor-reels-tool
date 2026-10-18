import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
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
      <div>
        <BackLink />
        <div className="mt-10 max-w-xl">
          <ErrorBanner message={error} />
        </div>
      </div>
    );
  if (!remix) return null;

  return (
    <div>
      <BackLink />

      <header className="mt-10 max-w-3xl">
        <h1 className="text-4xl font-semibold leading-[1.0] tracking-[-0.03em] text-ink sm:text-6xl">
          {title || 'Untitled remix'}
        </h1>
        <p className="mt-5 max-w-md text-base text-ink/70">
          An AI breakdown of the source Reel. Edit the hook, script and call to
          action until it sounds like you.
        </p>
      </header>

      <div className="mt-16 grid gap-14 lg:grid-cols-[320px_1fr]">
        <section>
          {reel ? (
            <>
              <img
                src={reel.thumbnailUrl}
                alt={reel.caption}
                className="aspect-[4/5] w-full bg-surface-2 object-cover"
              />
              <p className="mt-5 text-sm text-ink/60">
                @{reel.competitorUsername} · {relativeTime(reel.postedAt)}
              </p>
              <p className="mt-2 text-lg leading-snug text-ink">{reel.caption}</p>
              <p className="stat mt-3">
                {compactNumber(reel.viewCount)} views · {compactNumber(reel.likeCount)} likes
                · {compactNumber(reel.commentCount)} comments
              </p>
              <a
                href={reel.permalink}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block text-sm text-ink/60 underline-offset-4 transition-colors hover:text-ink hover:underline"
              >
                View profile on Instagram
              </a>
            </>
          ) : (
            <p className="text-base text-ink/70">Source Reel is no longer available.</p>
          )}
        </section>

        <section className="panel sm:p-8">
          <div className="space-y-8">
            <Field id="remix-title" label="Title">
              <input
                id="remix-title"
                className="input"
                value={title}
                onChange={markDirty(setTitle)}
                placeholder="Give your remix a title"
              />
            </Field>

            <Field
              id="remix-hook"
              label="Hook"
              hint="The first line that stops the scroll."
            >
              <textarea
                id="remix-hook"
                className="input min-h-[88px] resize-y"
                value={hook}
                onChange={markDirty(setHook)}
                placeholder="Write a scroll-stopping hook…"
              />
            </Field>

            <Field
              id="remix-script"
              label="Script"
              hint="Beat by beat, what happens in the video."
            >
              <textarea
                id="remix-script"
                className="input min-h-[180px] resize-y leading-relaxed"
                value={script}
                onChange={markDirty(setScript)}
                placeholder="Break the video into beats…"
              />
            </Field>

            <Field
              id="remix-cta"
              label="Call to action"
              hint="What the viewer should do next."
            >
              <textarea
                id="remix-cta"
                className="input min-h-[80px] resize-y"
                value={cta}
                onChange={markDirty(setCta)}
                placeholder="Tell the viewer what to do next…"
              />
            </Field>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-ink/50">
              {dirty
                ? 'Unsaved changes'
                : savedAt
                  ? `Saved ${relativeTime(savedAt)}`
                  : `Created ${relativeTime(remix.createdAt)}`}
            </p>
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="btn-primary"
            >
              {saving ? <Spinner /> : null} Save changes
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
      className="inline-flex items-center gap-2 text-sm text-ink/60 transition-colors hover:text-ink"
    >
      <ArrowLeft size={15} /> Back to reels
    </Link>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="mt-3">{children}</div>
      {hint ? (
        <p className="mt-2 text-sm text-ink/50">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
