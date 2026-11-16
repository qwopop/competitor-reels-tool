import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookmarkPlus, Sparkles, Trash2 } from 'lucide-react';
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
import {
  SAVED_VOICES_MAX,
  VOICE_MESSAGES,
  VOICE_NAME_LIMIT,
  deleteSavedVoice,
  readLastVoice,
  readSavedVoices,
  saveVoice,
  savedIdOf,
  savedSelection,
  writeLastVoice,
  type SavedVoice,
  type VoiceSelection,
} from '@/utils/voiceStorage';
import { REMIX_TEMPLATES } from '@/utils/templates';
import { planStatusMeta } from '@/utils/plan';
import { WatchOnYouTubeLink } from '@/components/YouTubeLinks';
import { channelLabel } from '@/utils/youtube';

// The Write with AI block's starting voice: the one of the last successful write in this browser
// (issue #98), or Educational blogger when nothing usable is stored.
function initialVoiceState(): { savedVoices: SavedVoice[]; voice: VoiceSelection; customVoice: string } {
  const savedVoices = readSavedVoices();
  const last = readLastVoice();
  if (!last) return { savedVoices, voice: 'educational_blogger', customVoice: '' };
  const savedId = savedIdOf(last.selection);
  const voice = savedId && !savedVoices.some((v) => v.id === savedId) ? 'educational_blogger' : last.selection;
  return { savedVoices, voice, customVoice: last.customText };
}

// Shown when the page is opened from a video's Write with AI button (issue #99).
const WRITE_AI_INTRO = 'Pick a voice, then press Write with AI. Nothing changes until you press Save changes.';

export function RemixPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const [searchParams, setSearchParams] = useSearchParams();

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
  const [initialVoice] = useState(initialVoiceState);
  const [voice, setVoice] = useState<VoiceSelection>(initialVoice.voice);
  const [customVoice, setCustomVoice] = useState(initialVoice.customVoice);
  // Custom voices saved in this browser, oldest first, and the "Saved “…”." line.
  const [savedVoices, setSavedVoices] = useState<SavedVoice[]>(initialVoice.savedVoices);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [confirmDeleteVoice, setConfirmDeleteVoice] = useState<SavedVoice | null>(null);
  const [instructions, setInstructions] = useState('');
  const [voiceMissing, setVoiceMissing] = useState(false);
  const [confirmAi, setConfirmAi] = useState(false);
  const [writing, setWriting] = useState(false);
  const [aiNotice, setAiNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  // From the last successful AI write of this visit; null until then (nothing is shown).
  const [aiWrites, setAiWrites] = useState<{ left: number; limit: number } | null>(null);
  const [focusAfterWrite, setFocusAfterWrite] = useState<'title' | 'button' | 'voice' | null>(null);
  // Opened with ?write=ai: the info notice in the AI block, and a scroll and focus still to do.
  const [writeIntro, setWriteIntro] = useState(false);
  const pendingAiFocus = useRef(false);
  const aiBlock = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const writeButton = useRef<HTMLButtonElement>(null);
  const customVoiceBox = useRef<HTMLTextAreaElement>(null);
  const titleField = useRef<HTMLInputElement>(null);
  const voiceSelect = useRef<HTMLSelectElement>(null);
  const selectedSaved = savedVoices.find((v) => v.id === savedIdOf(voice)) ?? null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; // a late AI answer after leaving the page is ignored
    };
  }, []);

  // ?write=ai is read once and dropped from the address at once (history replace), so a reload or
  // back and forward does not show the notice or move focus again. Gemini is not called here.
  useEffect(() => {
    if (searchParams.get('write') !== 'ai') return;
    pendingAiFocus.current = true;
    setWriteIntro(true);
    const next = new URLSearchParams(searchParams);
    next.delete('write');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Once the remix has loaded, bring the Write with AI block into view and focus Creator voice.
  useEffect(() => {
    if (loading || !remix || !pendingAiFocus.current) return;
    pendingAiFocus.current = false;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    aiBlock.current?.scrollIntoView?.({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    voiceSelect.current?.focus({ preventScroll: true });
  }, [loading, remix]);

  // Focus moves once the fields are editable again (they are read-only while Gemini writes).
  useEffect(() => {
    if (!focusAfterWrite) return;
    ({ title: titleField, button: writeButton, voice: voiceSelect })[focusAfterWrite].current?.focus();
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
    setWriteIntro(false);
    if (dirty) setConfirmApply(true);
    else applyTemplate();
  }

  async function writeWithAi() {
    if (!remix) return;
    setConfirmAi(false);
    setAiNotice(null);
    setVoiceStatus(null);
    setWriting(true);
    // A saved voice is sent as a custom voice with its saved text (the API is unchanged).
    const selection = voice;
    const saved = selectedSaved;
    const customText = customVoice;
    const apiVoice: CreatorVoice = saved ? 'custom' : (selection as CreatorVoice);
    const res = await api.writeRemixWithAi(remix.id, {
      voice: apiVoice,
      customVoice: saved ? saved.text : apiVoice === 'custom' ? customText : undefined,
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
    // Only a successful write is remembered, for the next Remix page in this browser.
    writeLastVoice({ selection, customText });
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
      message: `Draft written in the ${voiceName(apiVoice, saved?.name)} voice. Review it, then press Save changes.`,
    });
    setFocusAfterWrite('title');
  }

  function handleWriteClick() {
    setWriteIntro(false);
    if (voice === 'custom' && !customVoice.trim()) {
      setVoiceMissing(true);
      customVoiceBox.current?.focus();
      return;
    }
    if (dirty) setConfirmAi(true);
    else writeWithAi();
  }

  function handleVoiceChange(next: VoiceSelection) {
    setVoice(next);
    setVoiceStatus(null);
  }

  // Saves the custom voice under `name`; returns the error to show, or null when it was saved.
  function handleSaveVoice(name: string): string | null {
    // Re-read storage so a voice saved on another page in the meantime is kept.
    const result = saveVoice(mergeVoices(savedVoices, readSavedVoices()), name, customVoice);
    if (!result.ok) return result.error;
    setSavedVoices(result.voices);
    setVoice(savedSelection(result.voice.id));
    setVoiceStatus(`Saved “${result.voice.name}”.`);
    setFocusAfterWrite('voice');
    return null;
  }

  function deleteVoice() {
    const target = confirmDeleteVoice;
    setConfirmDeleteVoice(null);
    if (!target) return;
    setSavedVoices(deleteSavedVoice(mergeVoices(savedVoices, readSavedVoices()), target.id));
    // The text stays in the box, so the owner can still write with it once or save it again.
    setVoice('custom');
    setCustomVoice(target.text);
    setVoiceMissing(false);
    setVoiceStatus(null);
    setFocusAfterWrite('voice');
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
      {confirmDeleteVoice && (
        <ConfirmDialog
          title="Delete this voice?"
          message={`“${confirmDeleteVoice.name}” will be removed from this browser. Remixes you already wrote are not changed.`}
          confirmLabel="Delete voice"
          onConfirm={deleteVoice}
          onCancel={() => setConfirmDeleteVoice(null)}
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
            blockRef={aiBlock}
            intro={writeIntro}
            onDismissIntro={() => setWriteIntro(false)}
            voice={voice}
            onVoice={handleVoiceChange}
            voiceSelect={voiceSelect}
            savedVoices={savedVoices}
            selectedSaved={selectedSaved}
            onSaveVoice={handleSaveVoice}
            onDeleteVoice={() => selectedSaved && setConfirmDeleteVoice(selectedSaved)}
            voiceStatus={voiceStatus}
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
  blockRef,
  intro,
  onDismissIntro,
  voice,
  onVoice,
  voiceSelect,
  savedVoices,
  selectedSaved,
  onSaveVoice,
  onDeleteVoice,
  voiceStatus,
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
  blockRef: React.RefObject<HTMLDivElement>;
  intro: boolean;
  onDismissIntro: () => void;
  voice: VoiceSelection;
  onVoice: (voice: VoiceSelection) => void;
  voiceSelect: React.RefObject<HTMLSelectElement>;
  savedVoices: SavedVoice[];
  selectedSaved: SavedVoice | null;
  onSaveVoice: (name: string) => string | null;
  onDeleteVoice: () => void;
  voiceStatus: string | null;
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
  const presets = CREATOR_VOICES.filter((v) => v.value !== 'custom');
  const custom = CREATOR_VOICES.find((v) => v.value === 'custom')!;
  return (
    <div ref={blockRef} className="scroll-mt-6">
      <h2 className="label">Write with AI</h2>
      {intro ? (
        <div className="mt-4">
          <Notice tone="info" message={WRITE_AI_INTRO} onDismiss={onDismissIntro} />
        </div>
      ) : null}

      <label htmlFor="ai-voice" className="mt-4 block text-sm text-ink/70">
        Creator voice
      </label>
      <select
        id="ai-voice"
        ref={voiceSelect}
        className="input mt-2 sm:max-w-xs"
        value={voice}
        onChange={(e) => onVoice(e.target.value as VoiceSelection)}
        disabled={writing}
        aria-describedby="ai-voice-description"
      >
        {presets.map((v) => (
          <option key={v.value} value={v.value}>{v.label}</option>
        ))}
        {savedVoices.length > 0 ? (
          <optgroup label="Saved voices">
            {savedVoices.map((v) => (
              <option key={v.id} value={savedSelection(v.id)}>{v.name}</option>
            ))}
          </optgroup>
        ) : null}
        <option value={custom.value}>{custom.label}</option>
      </select>
      {selectedSaved ? (
        <div className="mt-2 flex flex-col items-start gap-2 sm:flex-row sm:justify-between sm:gap-4">
          <p
            id="ai-voice-description"
            title={selectedSaved.text}
            className="line-clamp-3 min-w-0 flex-1 whitespace-pre-line break-words text-sm text-ink/50 [overflow-wrap:anywhere]"
          >
            {selectedSaved.text}
          </p>
          <button
            type="button"
            onClick={onDeleteVoice}
            disabled={writing}
            className="btn-ghost shrink-0 px-3 py-2 text-sm"
            aria-label={`Delete saved voice ${selectedSaved.name}`}
          >
            <Trash2 size={14} aria-hidden="true" /> Delete
          </button>
        </div>
      ) : (
        <p id="ai-voice-description" className="mt-2 text-sm text-ink/50">
          {description}
        </p>
      )}
      {voiceStatus ? (
        <p role="status" className="mt-2 break-words text-sm text-ink/70 [overflow-wrap:anywhere]">
          {voiceStatus}
        </p>
      ) : null}

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
          {savedVoices.length >= SAVED_VOICES_MAX ? (
            <p className="mt-3 text-sm text-ink/50">{VOICE_MESSAGES.limit}</p>
          ) : customVoice.trim() ? (
            <SaveVoiceControls writing={writing} onSave={onSaveVoice} />
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

// "Save this voice", and the Name row it opens (issue #98).
function SaveVoiceControls({ writing, onSave }: { writing: boolean; onSave: (name: string) => string | null }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<'name' | 'button' | null>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focus) return;
    (focus === 'name' ? nameInput : openButton).current?.focus();
    setFocus(null);
  }, [focus]);

  function close() {
    setOpen(false);
    setName('');
    setError(null);
    setFocus('button');
  }

  function save() {
    const problem = onSave(name);
    if (problem) {
      setError(problem);
      return;
    }
    setOpen(false);
    setName('');
    setError(null);
  }

  if (!open) {
    return (
      <button
        ref={openButton}
        type="button"
        onClick={() => {
          setOpen(true);
          setFocus('name');
        }}
        disabled={writing}
        className="btn-ghost mt-3 px-3 py-2 text-sm"
      >
        <BookmarkPlus size={14} aria-hidden="true" /> Save this voice
      </button>
    );
  }

  return (
    <div className="mt-4">
      <CountedLabel id="ai-voice-name" label="Name" count={name.length} limit={VOICE_NAME_LIMIT} />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <input
          id="ai-voice-name"
          ref={nameInput}
          type="text"
          className="input sm:max-w-xs"
          maxLength={VOICE_NAME_LIMIT}
          value={name}
          placeholder="e.g. My finance voice"
          disabled={writing}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              close();
            }
          }}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={`ai-voice-name-count${error ? ' ai-voice-name-error' : ''}`}
        />
        <button type="button" onClick={save} disabled={writing} className="btn-outline">
          Save voice
        </button>
        <button type="button" onClick={close} disabled={writing} className="btn-ghost">
          Cancel
        </button>
      </div>
      {error ? (
        <p id="ai-voice-name-error" className="mt-2 break-words text-sm text-danger [overflow-wrap:anywhere]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// The stored list, plus any voice only this page knows about (kept in its saved order).
function mergeVoices(current: SavedVoice[], stored: SavedVoice[]): SavedVoice[] {
  const ids = new Set(stored.map((v) => v.id));
  return [...stored, ...current.filter((v) => !ids.has(v.id))];
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
