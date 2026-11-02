import { useEffect, useState } from 'react';
import { Link, useBlocker, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useApi } from '@/services';
import type { ContentPlanItem, Video, RemixedVideo, RemixTemplate } from '@/types';
import { relativeTime, videoStats } from '@/utils/format';
import { ErrorBanner, FullPageLoader, Spinner } from '@/components/ui';
import { ConfirmDialog } from '@/components/Modal';
import { REMIX_TEMPLATES } from '@/utils/templates';
import { planStatusMeta } from '@/utils/plan';
import { WatchOnYouTubeLink } from '@/components/YouTubeLinks';
import { channelLabel } from '@/utils/youtube';
import { changedRemixFields, remixFields, type RemixFields } from '@/utils/remix';

export function RemixPage() {
  const { id } = useParams<{ id: string }>();
  // A fresh editor per remix: moving from /remix/A to /remix/B starts B from a
  // clean load, and a late response for A cannot reach B's editor.
  return <RemixEditor key={id} id={id} />;
}

function RemixEditor({ id }: { id: string | undefined }) {
  const api = useApi();

  const [remix, setRemix] = useState<RemixedVideo | null>(null);
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  // A failed load replaces the page; a failed action (save, apply template,
  // add to plan) shows inside the editor and keeps the user's text.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [hook, setHook] = useState('');
  const [script, setScript] = useState('');
  const [cta, setCta] = useState('');
  // What the editor compares against: the remix as loaded, then as returned by
  // each successful save or template apply.
  const [baseline, setBaseline] = useState<RemixFields | null>(null);
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
        setLoadError(remixRes.error ?? 'Remix not found.');
        setLoading(false);
        return;
      }
      const r = remixRes.data;
      setRemix(r);
      setTitle(r.title);
      setHook(r.hook);
      setScript(r.script);
      setCta(r.cta);
      setBaseline(remixFields(r));
      const videoRes = await api.getVideo(r.videoId);
      if (!active) return;
      if (videoRes.data) setVideo(videoRes.data);
      const planRes = await api.listContentPlan();
      if (!active) return;
      setPlanItem(planRes.data?.find((item) => item.videoId === r.videoId) ?? null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [api, id]);

  const changes = baseline ? changedRemixFields({ title, hook, script, cta }, baseline) : {};
  const dirty = Object.keys(changes).length > 0;

  // Warn before leaving with unsaved changes: in-app links and browser
  // Back/Forward through the router, reload, tab close and typed URLs through
  // the browser's own prompt.
  const blocker = useBlocker(dirty);
  const leaving = blocker.state === 'blocked';

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers show the prompt only when returnValue is set.
      e.returnValue = true;
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // One dialog at a time: leaving replaces the "Replace your edits?" question.
  useEffect(() => {
    if (leaving) setConfirmApply(false);
  }, [leaving]);

  function markDirty(setter: (v: string) => void) {
    return (e: { target: { value: string } }) => {
      setter(e.target.value);
      setActionError(null);
    };
  }

  async function handleSave() {
    if (!remix || !dirty) return;
    setSaving(true);
    const res = await api.updateRemix(remix.id, changes);
    setSaving(false);
    if (res.error || !res.data) {
      setActionError(res.error ?? 'Could not save.');
      return;
    }
    setActionError(null);
    // Fields keep what is on screen (including anything typed while saving);
    // only the baseline moves to the saved values.
    setRemix(res.data);
    setBaseline(remixFields(res.data));
    setSavedAt(res.data.updatedAt);
  }

  async function handleAddToPlan() {
    if (!video) return;
    const res = await api.addToContentPlan(video.id);
    if (res.error || !res.data) {
      setActionError(res.error ?? 'Could not add to the content plan.');
      return;
    }
    setActionError(null);
    setPlanItem(res.data);
  }

  async function applyTemplate() {
    if (!remix) return;
    setConfirmApply(false);
    const res = await api.applyRemixTemplate(remix.id, template);
    if (res.error || !res.data) {
      setActionError(res.error ?? 'Could not apply the template.');
      return;
    }
    setActionError(null);
    const updated = res.data;
    setRemix(updated);
    setTitle(updated.title);
    setHook(updated.hook);
    setScript(updated.script);
    setCta(updated.cta);
    setBaseline(remixFields(updated));
    setSavedAt(updated.updatedAt);
  }

  function handleApplyClick() {
    if (dirty) setConfirmApply(true);
    else applyTemplate();
  }

  if (loading) return <FullPageLoader label="Loading remix…" />;
  if (loadError)
    return (
      <div>
        <BackLink />
        <div className="mt-10 max-w-xl">
          <ErrorBanner message={loadError} />
        </div>
      </div>
    );
  if (!remix) return null;

  return (
    <div>
      {leaving && (
        <ConfirmDialog
          title="Leave without saving?"
          message="Your changes to this remix have not been saved. If you leave now, they will be lost."
          confirmLabel="Leave page"
          onConfirm={() => blocker.proceed?.()}
          onCancel={() => blocker.reset?.()}
        />
      )}
      {confirmApply && !leaving && (
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
          A draft written from the source video's title, description and numbers.
          Edit the hook, script and call to action until it sounds like you.
        </p>
      </header>

      <div className="mt-16 grid gap-14 lg:grid-cols-[320px_1fr]">
        <section>
          {video ? (
            <>
              <img
                src={video.thumbnailUrl}
                referrerPolicy="no-referrer"
                decoding="async"
                alt={video.caption}
                className="aspect-video w-full rounded-2xl bg-surface-2 object-cover"
              />
              <p className="mt-5 text-sm text-ink/60">
                {channelLabel(video.competitorUsername)} · {relativeTime(video.postedAt)}
              </p>
              <p className="mt-2 text-lg leading-snug text-ink">{video.caption}</p>
              <p className="stat mt-3">
                {videoStats(video)}
              </p>
              <div className="mt-4">
                <WatchOnYouTubeLink permalink={video.permalink} username={video.competitorUsername} />
              </div>
            </>
          ) : (
            <p className="text-base text-ink/70">Source video is no longer available.</p>
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
              built from the video's details, not AI analysis.
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
                rows={Math.min(14, Math.max(6, script.split('\n').length + 1))}
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

          {actionError && (
            <div role="alert" className="mt-10">
              <ErrorBanner message={actionError} />
            </div>
          )}

          <div
            className={`${actionError ? 'mt-4' : 'mt-10'} flex flex-wrap items-center justify-between gap-4`}
          >
            <p className="text-sm text-ink/50">
              {dirty
                ? 'Unsaved changes'
                : savedAt
                  ? `Saved ${relativeTime(savedAt)}`
                  : `Created ${relativeTime(remix.createdAt)}`}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {video && planItem ? (
                <span className="px-4 py-2 text-sm text-ink/70">
                  <span aria-hidden="true">{planStatusMeta(planItem.status).emoji}</span>{' '}
                  In content plan
                </span>
              ) : video ? (
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
      to="/videos"
      className="inline-flex items-center gap-2 text-sm text-ink/60 transition-colors hover:text-ink"
    >
      <ArrowLeft size={15} /> Back to videos
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
