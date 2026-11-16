import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { useApi } from '@/services';
import type { ContentPlanItem, CreatorVoice, Video, RemixedVideo, RemixTemplate } from '@/types';
import { relativeTime, videoStats } from '@/utils/format';
import { ErrorBanner, FullPageLoader, Spinner } from '@/components/ui';
import { ConfirmDialog } from '@/components/Modal';
import { Notice } from '@/components/Notice';
import {
  CREATOR_VOICES,
  CUSTOM_VOICE_LIMIT,
  INSTRUCTIONS_LIMIT,
  aiWritesLeftText,
  isAiDailyLimitMessage,
  voiceName,
} from '@/utils/voices';
import { REMIX_TEMPLATES } from '@/utils/templates';
import { planStatusMeta } from '@/utils/plan';
import { WatchOnYouTubeLink } from '@/components/YouTubeLinks';
import { channelLabel } from '@/utils/youtube';

export function RemixPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();

  const [remix, setRemix] = useState<RemixedVideo | null>(null);
  const [video, setVideo] = useState<Video | null>(null);
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

  // Write with AI: the chosen voice and instructions, the request in flight, and its message.
  const [voice, setVoice] = useState<CreatorVoice>('educational_blogger');
  const [customVoice, setCustomVoice] = useState('');
  const [instructions, setInstructions] = useState('');
  const [voiceMissing, setVoiceMissing] = useState(false);
  const [confirmAi, setConfirmAi] = useState(false);
  const [writing, setWriting] = useState(false);
  const [aiNotice, setAiNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  // From the last successful AI write of this visit; null until then (nothing is shown).
  const [aiWrites, setAiWrites] = useState<{ left: number; limit: number } | null>(null);
  const [focusAfterWrite, setFocusAfterWrite] = useState<'title' | 'button' | null>(null);
  const mounted = useRef(true);
  const writeButton = useRef<HTMLButtonElement>(null);
  const customVoiceBox = useRef<HTMLTextAreaElement>(null);
  const titleField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; // a late AI answer after leaving the page is ignored
    };
  }, []);

  // Focus moves once the fields are editable again (they are read-only while Gemini writes).
  useEffect(() => {
    if (!focusAfterWrite) return;
    (focusAfterWrite === 'title' ? titleField : writeButton).current?.focus();
    setFocusAfterWrite(null);
  }, [focusAfterWrite]);

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
    if (aiNotice?.tone === 'success') setAiNotice(null);
  }

  async function handleAddToPlan() {
    if (!video) return;
    const res = await api.addToContentPlan(video.id);
    if (res.error || !res.data) {
      setError(res.error ?? 'Could not add to the content plan.');
      return;
    }
    setPlanItem(res.data);
  }

  async function applyTemplate() {
    if (!remix) return;
    setConfirmApply(false);
    setAiNotice(null);
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

  async function writeWithAi() {
    if (!remix) return;
    setConfirmAi(false);
    setAiNotice(null);
    setWriting(true);
    const res = await api.writeRemixWithAi(remix.id, {
      voice,
      customVoice: voice === 'custom' ? customVoice : undefined,
      instructions: instructions.trim() ? instructions : undefined,
    });
    if (!mounted.current) return;
    setWriting(false);
    if (res.error || !res.data) {
      // The editor keeps exactly the text it had; only the message is shown.
      setAiNotice({ tone: 'error', message: res.error ?? "Gemini couldn't write a draft this time. Your text hasn't changed. Try again." });
      // The server's daily limit: a shown "writes left" line switches to the 0 wording.
      if (isAiDailyLimitMessage(res.error)) setAiWrites((current) => (current ? { ...current, left: 0 } : current));
      setFocusAfterWrite('button');
      return;
    }
    const draft = res.data;
    setTitle(draft.title);
    setHook(draft.hook);
    setScript(draft.script);
    setCta(draft.cta);
    setDirty(true);
    if (typeof draft.writesLeftToday === 'number' && typeof draft.writesPerDay === 'number') {
      setAiWrites({ left: draft.writesLeftToday, limit: draft.writesPerDay });
    }
    setAiNotice({
      tone: 'success',
      message: `Draft written in the ${voiceName(voice)} voice. Review it, then press Save changes.`,
    });
    setFocusAfterWrite('title');
  }

  function handleWriteClick() {
    if (voice === 'custom' && !customVoice.trim()) {
      setVoiceMissing(true);
      customVoiceBox.current?.focus();
      return;
    }
    if (dirty) setConfirmAi(true);
    else writeWithAi();
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
      {confirmAi && (
        <ConfirmDialog
          title="Replace your edits?"
          message="Writing with AI replaces the title, hook, script and call to action in the editor. Your unsaved edits will be lost."
          confirmLabel="Write with AI"
          onConfirm={writeWithAi}
          onCancel={() => setConfirmAi(false)}
        />
      )}
      <BackLink />

      <header className="mt-10 max-w-3xl">
        <h1 className="break-words text-4xl font-semibold leading-[1.0] tracking-[-0.03em] text-ink [overflow-wrap:anywhere] sm:text-6xl">
          {title || 'Untitled remix'}
        </h1>
        <p className="mt-5 max-w-md text-base text-ink/70">
          Write a draft with AI in a creator voice, or start from a template. Then edit the
          hook, script and call to action until it sounds like you.
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

        <section className="panel min-w-0 sm:p-8">
          <AiBlock
            voice={voice}
            onVoice={setVoice}
            customVoice={customVoice}
            onCustomVoice={(value) => {
              setCustomVoice(value);
              if (value.trim()) setVoiceMissing(false);
            }}
            voiceMissing={voiceMissing}
            instructions={instructions}
            onInstructions={setInstructions}
            writing={writing}
            sourceGone={!video}
            onWrite={handleWriteClick}
            notice={aiNotice}
            onDismissNotice={() => setAiNotice(null)}
            writesLeft={aiWrites}
            writeButton={writeButton}
            customVoiceBox={customVoiceBox}
          />

          <div className="my-10 flex items-center gap-4">
            <span aria-hidden="true" className="flex-1 border-t border-white/10" />
            <span className="max-w-[60%] text-center text-sm text-ink/50">or start from a template</span>
            <span aria-hidden="true" className="flex-1 border-t border-white/10" />
          </div>

          <div className="mb-10">
            <p className="label">Template</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <select
                className="input max-w-xs"
                value={template}
                onChange={(e) => setTemplate(e.target.value as RemixTemplate)}
                aria-label="Remix template"
                disabled={writing}
              >
                {REMIX_TEMPLATES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <button type="button" onClick={handleApplyClick} className="btn-outline" disabled={writing}>
                Apply template
              </button>
            </div>
            <p className="mt-2 text-sm text-ink/50">
              {REMIX_TEMPLATES.find((t) => t.value === template)?.description} Drafts are
              built by rules from the video's details.
            </p>
          </div>

          <div className="space-y-8" aria-busy={writing}>
            <Field id="remix-title" label="Title">
              <input
                id="remix-title"
                ref={titleField}
                maxLength={500}
                readOnly={writing}
                className={`input${writing ? ' opacity-60 animate-pulse-soft motion-reduce:animate-none' : ''}`}
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
                readOnly={writing}
                className={`input min-h-[88px] resize-y${writing ? ' opacity-60 animate-pulse-soft motion-reduce:animate-none' : ''}`}
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
                readOnly={writing}
                className={`input min-h-[180px] resize-y leading-relaxed${writing ? ' opacity-60 animate-pulse-soft motion-reduce:animate-none' : ''}`}
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
                readOnly={writing}
                className={`input min-h-[80px] resize-y${writing ? ' opacity-60 animate-pulse-soft motion-reduce:animate-none' : ''}`}
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
                disabled={!dirty || saving || writing}
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

function AiBlock({
  voice,
  onVoice,
  customVoice,
  onCustomVoice,
  voiceMissing,
  instructions,
  onInstructions,
  writing,
  sourceGone,
  onWrite,
  notice,
  onDismissNotice,
  writesLeft,
  writeButton,
  customVoiceBox,
}: {
  voice: CreatorVoice;
  onVoice: (voice: CreatorVoice) => void;
  customVoice: string;
  onCustomVoice: (value: string) => void;
  voiceMissing: boolean;
  instructions: string;
  onInstructions: (value: string) => void;
  writing: boolean;
  sourceGone: boolean;
  onWrite: () => void;
  notice: { tone: 'success' | 'error'; message: string } | null;
  onDismissNotice: () => void;
  writesLeft: { left: number; limit: number } | null;
  writeButton: React.RefObject<HTMLButtonElement>;
  customVoiceBox: React.RefObject<HTMLTextAreaElement>;
}) {
  const description = CREATOR_VOICES.find((v) => v.value === voice)?.description;
  return (
    <div>
      <h2 className="label">Write with AI</h2>

      <label htmlFor="ai-voice" className="mt-4 block text-sm text-ink/70">
        Creator voice
      </label>
      <select
        id="ai-voice"
        className="input mt-2 sm:max-w-xs"
        value={voice}
        onChange={(e) => onVoice(e.target.value as CreatorVoice)}
        disabled={writing}
        aria-describedby="ai-voice-description"
      >
        {CREATOR_VOICES.map((v) => (
          <option key={v.value} value={v.value}>{v.label}</option>
        ))}
      </select>
      <p id="ai-voice-description" className="mt-2 text-sm text-ink/50">
        {description}
      </p>

      {voice === 'custom' ? (
        <div className="mt-5">
          <CountedLabel id="ai-custom-voice" label="Describe the voice" count={customVoice.length} limit={CUSTOM_VOICE_LIMIT} />
          <textarea
            id="ai-custom-voice"
            ref={customVoiceBox}
            className="input mt-2 min-h-[80px] resize-y"
            maxLength={CUSTOM_VOICE_LIMIT}
            value={customVoice}
            onChange={(e) => onCustomVoice(e.target.value)}
            placeholder="You are a calm finance coach who explains with everyday examples…"
            disabled={writing}
            aria-invalid={voiceMissing ? 'true' : undefined}
            aria-describedby={`ai-custom-voice-count${voiceMissing ? ' ai-custom-voice-error' : ''}`}
          />
          {voiceMissing ? (
            <p id="ai-custom-voice-error" className="mt-2 text-sm text-danger">
              Describe the voice, or pick a preset.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5">
        <CountedLabel id="ai-instructions" label="Extra instructions (optional)" count={instructions.length} limit={INSTRUCTIONS_LIMIT} />
        <textarea
          id="ai-instructions"
          className="input mt-2 min-h-[80px] resize-y"
          maxLength={INSTRUCTIONS_LIMIT}
          value={instructions}
          onChange={(e) => onInstructions(e.target.value)}
          placeholder="Keep it under 45 seconds. Mention my free checklist."
          disabled={writing}
          aria-describedby="ai-instructions-count"
        />
      </div>

      <button
        ref={writeButton}
        type="button"
        onClick={onWrite}
        disabled={writing || sourceGone}
        className="btn-primary mt-5 w-full sm:w-auto"
        aria-describedby={writesLeft ? 'ai-writes-left' : undefined}
      >
        {/* Both labels share one grid cell, so the button keeps its width while busy. */}
        <span className="grid">
          <span
            aria-hidden={writing || undefined}
            className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-2 ${writing ? 'invisible' : ''}`}
          >
            <Sparkles size={16} aria-hidden="true" /> Write with AI
          </span>
          <span
            aria-hidden={!writing || undefined}
            className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-2 ${writing ? '' : 'invisible'}`}
          >
            <Spinner /> Writing…
          </span>
        </span>
      </button>
      <p className="mt-3 text-sm text-ink/50">
        {sourceGone
          ? "The source video is gone, so AI can't write from it. You can still edit the text."
          : "Gemini writes a draft from this video's details. Nothing is saved until you press Save changes."}
      </p>
      {writesLeft ? (
        <p id="ai-writes-left" className={`mt-1 text-sm ${writesLeft.left <= 5 ? 'text-ink/70' : 'text-ink/50'}`}>
          {aiWritesLeftText(writesLeft.left, writesLeft.limit)}
        </p>
      ) : null}
      {writing ? (
        <p role="status" className="mt-3 text-sm text-ink/70">
          Gemini is writing your draft. This can take up to half a minute.
        </p>
      ) : null}
      {notice ? (
        <div className="mt-4">
          <Notice tone={notice.tone} message={notice.message} onDismiss={onDismissNotice} />
        </div>
      ) : null}
    </div>
  );
}

function CountedLabel({ id, label, count, limit }: { id: string; label: string; count: number; limit: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <label htmlFor={id} className="text-sm text-ink/70">
        {label}
      </label>
      <span id={`${id}-count`} className="text-sm tabular-nums text-ink/50">
        {count}/{limit}
      </span>
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
