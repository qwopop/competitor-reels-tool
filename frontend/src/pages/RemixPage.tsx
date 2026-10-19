import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useApi } from '@/services';
import type { ContentPlanItem, Reel, RemixedReel, RemixTemplate } from '@/types';
import { relativeTime, reelStats } from '@/utils/format';
import { ErrorBanner, FullPageLoader, Spinner } from '@/components/ui';
import { ConfirmDialog } from '@/components/Modal';
import { REMIX_TEMPLATES } from '@/utils/templates';
import { planStatusMeta } from '@/utils/plan';

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
  const [planItem, setPlanItem] = useState<ContentPlanItem | null>(null);
  const [template, setTemplate] = useState<RemixTemplate>('default');
  const [confirmApply, setConfirmApply] = useState(false);

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
      const planRes = await api.listContentPlan();
      if (!active) return;
      setPlanItem(planRes.data?.find((item) => item.reelId === r.reelId) ?? null);
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

  async function handleAddToPlan() {
    if (!reel) return;
    const res = await api.addToContentPlan(reel.id);
    if (res.error || !res.data) {
      setError(res.error ?? 'Could not add to the content plan.');
      return;
    }
    setPlanItem(res.data);
  }

  async function applyTemplate() {
    if (!remix) return;
    setConfirmApply(false);
    const res = await api.applyRemixTemplate(remix.id, template);
    if (res.error || !res.data) {
      setError(res.error ?? 'Could not apply the template.');
      return;
    }
    const updated = res.data;
    setRemix(updated);
    setTitle(updated.title);
    setHook(updated.hook);
    setScript(updated.script);
    setCta(updated.cta);
    setSavedAt(updated.updatedAt);
    setDirty(false);
  }

  function handleApplyClick() {
    if (dirty) setConfirmApply(true);
    else applyTemplate();
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
      {confirmApply && (
        <ConfirmDialog
          title="Replace your edits?"
          message="Applying a template overwrites the title, hook, script and call to action. Unsaved edits will be lost."
          confirmLabel="Apply template"
          onConfirm={applyTemplate}
          onCancel={() => setConfirmApply(false)}
        />
      )}
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
                className="aspect-[4/5] w-full rounded-2xl bg-surface-2 object-cover"
              />
              <p className="mt-5 text-sm text-ink/60">
                @{reel.competitorUsername} · {relativeTime(reel.postedAt)}
              </p>
              <p className="mt-2 text-lg leading-snug text-ink">{reel.caption}</p>
              <p className="stat mt-3">
                {reelStats(reel)}
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
          <div className="mb-10">
            <p className="label">Template</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <select
                className="input max-w-xs"
                value={template}
                onChange={(e) => setTemplate(e.target.value as RemixTemplate)}
                aria-label="Remix template"
              >
                {REMIX_TEMPLATES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <button type="button" onClick={handleApplyClick} className="btn-outline">
                Apply template
              </button>
            </div>
            <p className="mt-2 text-sm text-ink/50">
              {REMIX_TEMPLATES.find((t) => t.value === template)?.description} Drafts are
              built from the Reel's details, not AI analysis.
            </p>
          </div>

          <div className="space-y-8">
            <Field id="remix-title" label="Title">
              <input
                id="remix-title"
                maxLength={500}
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
                maxLength={1000}
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
                maxLength={2000}
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
                maxLength={500}
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
            <div className="flex flex-wrap items-center gap-3">
              {reel && planItem ? (
                <span className="px-4 py-2 text-sm text-ink/70">
                  <span aria-hidden="true">{planStatusMeta(planItem.status).emoji}</span>{' '}
                  In content plan
                </span>
              ) : reel ? (
                <button onClick={handleAddToPlan} className="btn-outline">
                  Add to plan
                </button>
              ) : null}
              <button
                onClick={handleSave}
                disabled={!dirty || saving}
                className="btn-primary"
              >
                {saving ? <Spinner /> : null} Save changes
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/reels"
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
