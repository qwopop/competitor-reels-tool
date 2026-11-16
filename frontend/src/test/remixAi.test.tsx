import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { AiDraft, RemixedVideo, ServiceResult, Video, VideosApi } from '@/types';
import { ApiProvider } from '@/services/ApiContext';
import { RemixPage } from '@/pages/RemixPage';
import { AI_MESSAGES } from '@/utils/voices';

// Issue #96: Write the remix with Gemini in a chosen creator voice.

const REMIX: RemixedVideo = {
  id: 'remix_1',
  videoId: 'video_1',
  title: 'Old title',
  hook: 'Old hook',
  script: '1. Old\n2. Script\n3. Lines',
  cta: 'Old CTA',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
};

const DRAFT: AiDraft = {
  title: 'AI title',
  hook: 'AI hook',
  script: '1. Hook (first 15 seconds)\n2. Middle\n3. Wrap up and CTA',
  cta: 'AI CTA',
  model: 'gemini-3.5-flash',
};

const VIDEO: Video = {
  id: 'video_1',
  competitorId: 'comp_1',
  competitorUsername: 'vibecoder',
  youtubeId: 'AAAAAAAAAA1',
  permalink: 'https://www.youtube.com/watch?v=AAAAAAAAAA1',
  caption: 'I let AI build my SaaS in 48 hours',
  description: '',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  viewCount: 1000,
  likeCount: 10,
  commentCount: 1,
  postedAt: '2026-11-01T10:00:00.000Z',
  fetchedAt: '2026-11-01T10:00:00.000Z',
};

function makeStub() {
  return {
    getRemix: vi.fn(async (): Promise<ServiceResult<RemixedVideo>> => ({ data: REMIX, error: null })),
    getVideo: vi.fn(async (): Promise<ServiceResult<Video>> => ({ data: VIDEO, error: null })),
    listContentPlan: vi.fn(async () => ({ data: [], error: null })),
    writeRemixWithAi: vi.fn(async (): Promise<ServiceResult<AiDraft>> => ({ data: DRAFT, error: null })),
    updateRemix: vi.fn(async (_id: string, patch: Partial<RemixedVideo>): Promise<ServiceResult<RemixedVideo>> => ({
      data: { ...REMIX, ...patch, updatedAt: new Date().toISOString() },
      error: null,
    })),
    applyRemixTemplate: vi.fn(async (): Promise<ServiceResult<RemixedVideo>> => ({
      data: { ...REMIX, hook: 'Template hook', updatedAt: new Date().toISOString() },
      error: null,
    })),
  };
}
type Stub = ReturnType<typeof makeStub>;

async function renderPage(stub: Stub) {
  const view = render(
    <ApiProvider api={stub as unknown as VideosApi}>
      <MemoryRouter initialEntries={['/remix/remix_1']}>
        <Routes>
          <Route path="/remix/:id" element={<RemixPage />} />
          <Route path="/videos" element={<p>Videos page</p>} />
        </Routes>
      </MemoryRouter>
    </ApiProvider>
  );
  await screen.findByRole('heading', { name: 'Write with AI' });
  return view;
}

function fields() {
  return {
    title: screen.getByLabelText('Title') as HTMLInputElement,
    hook: screen.getByLabelText('Hook') as HTMLTextAreaElement,
    script: screen.getByLabelText('Script') as HTMLTextAreaElement,
    cta: screen.getByLabelText('Call to action') as HTMLTextAreaElement,
  };
}

const values = () => Object.values(fields()).map((f) => f.value);
const writeButton = () => screen.getByRole('button', { name: 'Write with AI' });

// A promise the test resolves by hand, to look at the loading state.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Write with AI: layout and idle state', () => {
  it('puts the AI block above the template block with the presets in order', async () => {
    await renderPage(makeStub());
    const voice = screen.getByLabelText('Creator voice') as HTMLSelectElement;
    expect(Array.from(voice.options).map((o) => o.text)).toEqual([
      'Educational blogger', 'Storyteller', 'Entertainer', 'Expert reviewer', 'Motivational coach', 'Custom voice…',
    ]);
    expect(voice.value).toBe('educational_blogger');
    expect(screen.getByText('Explains one idea step by step, in plain words.')).toBeInTheDocument();
    expect(screen.getByText('or start from a template')).toBeInTheDocument();
    expect(screen.getByText(/Drafts are built by rules from the video's details\./)).toBeInTheDocument();
    expect(screen.queryByText(/not AI analysis/)).toBeNull();
    // AI first: the voice select comes before the template select in the document.
    const template = screen.getByLabelText('Remix template');
    expect(voice.compareDocumentPosition(template) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(writeButton()).toBeEnabled();
    expect(screen.getByText('0/500')).toBeInTheDocument();
    expect(screen.queryByLabelText('Describe the voice')).toBeNull();
  });

  it('shows the custom voice box only for Custom voice, and keeps what was typed', async () => {
    const user = userEvent.setup();
    await renderPage(makeStub());
    const voice = screen.getByLabelText('Creator voice');
    await user.selectOptions(voice, 'custom');
    expect(screen.getByText('Write who is speaking, in your own words.')).toBeInTheDocument();
    const box = screen.getByLabelText('Describe the voice');
    expect(screen.getByText('0/300')).toBeInTheDocument();
    await user.type(box, 'You are calm');
    expect(screen.getByText('12/300')).toBeInTheDocument();
    await user.selectOptions(voice, 'storyteller');
    expect(screen.queryByLabelText('Describe the voice')).toBeNull();
    expect(screen.getByText('Tells it as a personal story with stakes and a turn.')).toBeInTheDocument();
    await user.selectOptions(voice, 'custom');
    expect(screen.getByLabelText('Describe the voice')).toHaveValue('You are calm');
  });

  it('limits the boxes and counts characters', async () => {
    const user = userEvent.setup();
    await renderPage(makeStub());
    const instructions = screen.getByLabelText('Extra instructions (optional)');
    expect(instructions).toHaveAttribute('maxlength', '500');
    expect(instructions).toHaveAttribute('aria-describedby', 'ai-instructions-count');
    await user.type(instructions, 'Short.');
    expect(screen.getByText('6/500')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Creator voice'), 'custom');
    expect(screen.getByLabelText('Describe the voice')).toHaveAttribute('maxlength', '300');
  });

  it('needs a custom voice: nothing is sent, the box is marked and focused', async () => {
    const user = userEvent.setup();
    const stub = makeStub();
    await renderPage(stub);
    await user.selectOptions(screen.getByLabelText('Creator voice'), 'custom');
    const box = screen.getByLabelText('Describe the voice');
    await user.type(box, '   ');
    await user.click(writeButton());
    expect(stub.writeRemixWithAi).not.toHaveBeenCalled();
    expect(screen.getByText('Describe the voice, or pick a preset.')).toBeInTheDocument();
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(box).toHaveFocus();
    await user.type(box, 'x');
    expect(screen.queryByText('Describe the voice, or pick a preset.')).toBeNull();
    expect(box).not.toHaveAttribute('aria-invalid');
  });

  it('disables Write with AI when the source video is gone', async () => {
    const stub = makeStub();
    stub.getVideo.mockResolvedValue({ data: null as unknown as Video, error: 'Video not found.' });
    await renderPage(stub);
    expect(writeButton()).toBeDisabled();
    expect(screen.getByText("The source video is gone, so AI can't write from it. You can still edit the text.")).toBeInTheDocument();
  });
});

describe('Write with AI: loading and success', () => {
  it('shows the loading state, then fills the fields as unsaved and saves only on Save changes', async () => {
    const user = userEvent.setup();
    const stub = makeStub();
    const pending = deferred<ServiceResult<AiDraft>>();
    stub.writeRemixWithAi.mockReturnValueOnce(pending.promise);
    await renderPage(stub);
    await user.selectOptions(screen.getByLabelText('Creator voice'), 'expert_reviewer');
    await user.type(screen.getByLabelText('Extra instructions (optional)'), 'Keep it short.');
    await user.click(writeButton());

    expect(stub.writeRemixWithAi).toHaveBeenCalledWith('remix_1', {
      voice: 'expert_reviewer', customVoice: undefined, instructions: 'Keep it short.',
    });
    const busy = screen.getByRole('button', { name: 'Writing…' });
    expect(busy).toBeDisabled();
    expect(screen.getByText('Gemini is writing your draft. This can take up to half a minute.')).toHaveAttribute('role', 'status');
    const f = fields();
    for (const field of Object.values(f)) {
      expect(field).toHaveAttribute('readonly');
      expect(field.className).toContain('opacity-60');
    }
    expect(f.title.closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
    for (const label of ['Creator voice', 'Extra instructions (optional)', 'Remix template']) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: 'Apply template' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add to plan' })).toBeEnabled();

    pending.resolve({ data: DRAFT, error: null });
    await waitFor(() => expect(fields().title).toHaveValue('AI title'));
    expect(values()).toEqual([DRAFT.title, DRAFT.hook, DRAFT.script, DRAFT.cta]);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('AI title');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(screen.getByText('Draft written in the Expert reviewer voice. Review it, then press Save changes.')).toBeInTheDocument();
    await waitFor(() => expect(fields().title).toHaveFocus());
    expect(fields().title).not.toHaveAttribute('readonly');
    expect(stub.updateRemix).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(stub.updateRemix).toHaveBeenCalledWith('remix_1', {
      title: DRAFT.title, hook: DRAFT.hook, script: DRAFT.script, cta: DRAFT.cta,
    });
    expect(await screen.findByText(/^Saved/)).toBeInTheDocument();
    expect(screen.queryByText(/Draft written in the/)).toBeNull();
  });

  it('sends the custom voice and names it custom', async () => {
    const user = userEvent.setup();
    const stub = makeStub();
    await renderPage(stub);
    await user.selectOptions(screen.getByLabelText('Creator voice'), 'custom');
    await user.type(screen.getByLabelText('Describe the voice'), 'You are a calm coach');
    await user.click(writeButton());
    expect(stub.writeRemixWithAi).toHaveBeenCalledWith('remix_1', {
      voice: 'custom', customVoice: 'You are a calm coach', instructions: undefined,
    });
    expect(await screen.findByText('Draft written in the custom voice. Review it, then press Save changes.')).toBeInTheDocument();
  });

  it('Enter in a box makes a new line and does not start writing', async () => {
    const user = userEvent.setup();
    const stub = makeStub();
    await renderPage(stub);
    const box = screen.getByLabelText('Extra instructions (optional)');
    await user.type(box, 'one{Enter}two');
    expect(box).toHaveValue('one\ntwo');
    expect(stub.writeRemixWithAi).not.toHaveBeenCalled();
  });
});

describe('Write with AI: unsaved edits', () => {
  it('asks first; Cancel keeps everything, confirming writes', async () => {
    const user = userEvent.setup();
    const stub = makeStub();
    await renderPage(stub);
    await user.clear(fields().hook);
    await user.type(fields().hook, 'My edit');
    await user.click(writeButton());
    const dialog = screen.getByRole('dialog', { name: 'Replace your edits?' });
    expect(dialog).toHaveTextContent(
      'Writing with AI replaces the title, hook, script and call to action in the editor. Your unsaved edits will be lost.'
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(stub.writeRemixWithAi).not.toHaveBeenCalled();
    expect(fields().hook).toHaveValue('My edit');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(writeButton()).toHaveFocus();

    await user.click(writeButton());
    const confirm = screen.getByRole('dialog', { name: 'Replace your edits?' });
    await user.click(
      Array.from(confirm.querySelectorAll('button')).find((b) => b.textContent === 'Write with AI')!
    );
    await waitFor(() => expect(fields().hook).toHaveValue('AI hook'));
  });
});

describe('Write with AI: errors keep the editor text', () => {
  it.each([
    ['not configured', AI_MESSAGES.notConfigured],
    ['quota', AI_MESSAGES.quota],
    ['failure', AI_MESSAGES.failed],
    ['unreachable', 'Could not reach the server. Check that the backend is running.'],
  ])('%s: shows the message next to the button and changes nothing', async (_name, message) => {
    const user = userEvent.setup();
    const stub = makeStub();
    stub.writeRemixWithAi.mockResolvedValue({ data: null, error: message });
    await renderPage(stub);
    const before = values();
    await user.click(writeButton());
    const notice = await screen.findByText(message);
    expect(notice.closest('[role="status"]')).toHaveClass('text-danger');
    expect(values()).toEqual(before);
    expect(screen.queryByText('Unsaved changes')).toBeNull();
    expect(screen.getByLabelText('Title')).not.toHaveAttribute('readonly');
    await waitFor(() => expect(writeButton()).toHaveFocus());
    expect(writeButton()).toBeEnabled();
    // The rest of the page stays: no full-page error.
    expect(screen.getByLabelText('Remix template')).toBeEnabled();
  });

  it('keeps unsaved edits and the unsaved status on error, and the template still works afterwards', async () => {
    const user = userEvent.setup();
    const stub = makeStub();
    stub.writeRemixWithAi.mockResolvedValue({ data: null, error: AI_MESSAGES.failed });
    await renderPage(stub);
    await user.type(fields().cta, ' more');
    const before = values();
    await user.click(writeButton());
    await user.click(
      Array.from(screen.getByRole('dialog').querySelectorAll('button')).find((b) => b.textContent === 'Write with AI')!
    );
    expect(await screen.findByText(AI_MESSAGES.failed)).toBeInTheDocument();
    expect(values()).toEqual(before);
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(stub.updateRemix).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/^Saved/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Apply template' }));
    await waitFor(() => expect(fields().hook).toHaveValue('Template hook'));
    expect(screen.queryByText(AI_MESSAGES.failed)).toBeNull();
  });

  it('Dismiss removes the message', async () => {
    const user = userEvent.setup();
    const stub = makeStub();
    stub.writeRemixWithAi.mockResolvedValue({ data: null, error: AI_MESSAGES.quota });
    await renderPage(stub);
    await user.click(writeButton());
    await screen.findByText(AI_MESSAGES.quota);
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(AI_MESSAGES.quota)).toBeNull();
  });

  it('ignores a late answer after leaving the page', async () => {
    const user = userEvent.setup();
    const stub = makeStub();
    const pending = deferred<ServiceResult<AiDraft>>();
    stub.writeRemixWithAi.mockReturnValueOnce(pending.promise);
    const view = await renderPage(stub);
    await user.click(writeButton());
    view.unmount();
    pending.resolve({ data: DRAFT, error: null });
    await pending.promise;
    expect(stub.updateRemix).not.toHaveBeenCalled();
  });
});
