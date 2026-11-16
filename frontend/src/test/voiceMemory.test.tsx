import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { AiDraft, RemixedVideo, ServiceResult, Video, VideosApi } from '@/types';
import { ApiProvider } from '@/services/ApiContext';
import { RemixPage } from '@/pages/RemixPage';
import { AI_MESSAGES, voiceName } from '@/utils/voices';
import {
  LAST_VOICE_KEY,
  SAVED_VOICES_KEY,
  readLastVoice,
  readSavedVoices,
  saveVoice,
  type SavedVoice,
} from '@/utils/voiceStorage';

// Issue #98: remember the chosen creator voice and save custom voices for reuse.

const REMIX: RemixedVideo = {
  id: 'remix_1',
  videoId: 'video_1',
  title: 'Old title',
  hook: 'Old hook',
  script: '1. Old',
  cta: 'Old CTA',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
};

const DRAFT: AiDraft = {
  title: 'AI title',
  hook: 'AI hook',
  script: '1. Hook',
  cta: 'AI CTA',
  model: 'gemini-3.5-flash',
  writesLeftToday: 12,
  writesPerDay: 50,
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
    updateRemix: vi.fn(),
    applyRemixTemplate: vi.fn(),
  };
}
type Stub = ReturnType<typeof makeStub>;

async function renderPage(stub: Stub = makeStub()) {
  const view = render(
    <ApiProvider api={stub as unknown as VideosApi}>
      <MemoryRouter initialEntries={['/remix/remix_1']}>
        <Routes>
          <Route path="/remix/:id" element={<RemixPage />} />
        </Routes>
      </MemoryRouter>
    </ApiProvider>
  );
  await screen.findByRole('heading', { name: 'Write with AI' });
  return view;
}

const voiceSelect = () => screen.getByLabelText('Creator voice') as HTMLSelectElement;
const writeButton = () => screen.getByRole('button', { name: 'Write with AI' });
const optionTexts = () => Array.from(voiceSelect().options).map((o) => o.text);

function voice(id: string, name: string, text: string): SavedVoice {
  return { id, name, text, savedAt: '2026-11-01T10:00:00.000Z' };
}

function store(key: string, value: unknown) {
  localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
}

async function typeCustomVoice(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.selectOptions(voiceSelect(), 'custom');
  const box = screen.getByLabelText('Describe the voice');
  await user.clear(box);
  await user.type(box, text);
}

async function saveAs(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: 'Save this voice' }));
  const input = screen.getByLabelText('Name');
  await user.type(input, name);
  await user.click(screen.getByRole('button', { name: 'Save voice' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Remember the last voice', () => {
  it('with nothing stored the block looks as before', async () => {
    await renderPage();
    expect(voiceSelect().value).toBe('educational_blogger');
    expect(voiceSelect().querySelector('optgroup')).toBeNull();
    expect(optionTexts()).toEqual([
      'Educational blogger', 'Storyteller', 'Entertainer', 'Expert reviewer', 'Motivational coach', 'Custom voice…',
    ]);
    expect(screen.getByLabelText('Extra instructions (optional)')).toHaveValue('');
  });

  it('stores the preset after a successful write and preselects it on the next page', async () => {
    const user = userEvent.setup();
    const view = await renderPage();
    await user.selectOptions(voiceSelect(), 'storyteller');
    // Changing the select alone stores nothing.
    expect(localStorage.getItem(LAST_VOICE_KEY)).toBeNull();
    await user.type(screen.getByLabelText('Extra instructions (optional)'), 'Short.');
    await user.click(writeButton());
    await screen.findByText(/Draft written in the Storyteller voice/);
    expect(readLastVoice()).toEqual({ selection: 'storyteller', customText: '' });
    view.unmount();

    await renderPage();
    expect(voiceSelect().value).toBe('storyteller');
    // Extra instructions are not remembered.
    expect(screen.getByLabelText('Extra instructions (optional)')).toHaveValue('');
  });

  it('restores Custom voice with its text', async () => {
    const user = userEvent.setup();
    const view = await renderPage();
    await typeCustomVoice(user, 'You are a calm coach');
    await user.click(writeButton());
    await screen.findByText(/Draft written in the custom voice/);
    view.unmount();

    await renderPage();
    expect(voiceSelect().value).toBe('custom');
    expect(screen.getByLabelText('Describe the voice')).toHaveValue('You are a calm coach');
  });

  it('restores a saved voice, or Educational blogger when it no longer exists', async () => {
    store(SAVED_VOICES_KEY, [voice('a', 'Finance', 'You are a finance coach')]);
    store(LAST_VOICE_KEY, { selection: 'saved:a', customText: '' });
    const view = await renderPage();
    expect(voiceSelect().value).toBe('saved:a');
    expect(screen.getByText('You are a finance coach')).toBeInTheDocument();
    view.unmount();

    store(SAVED_VOICES_KEY, []);
    await renderPage();
    expect(voiceSelect().value).toBe('educational_blogger');
  });

  it('a failed write stores nothing', async () => {
    const user = userEvent.setup();
    const stub = makeStub();
    stub.writeRemixWithAi.mockResolvedValue({ data: null, error: AI_MESSAGES.failed });
    await renderPage(stub);
    await user.selectOptions(voiceSelect(), 'entertainer');
    await user.click(writeButton());
    await screen.findByText(AI_MESSAGES.failed);
    expect(localStorage.getItem(LAST_VOICE_KEY)).toBeNull();
  });
});

describe('Save a custom voice', () => {
  it('offers Save this voice only for a non-blank custom voice', async () => {
    const user = userEvent.setup();
    await renderPage();
    expect(screen.queryByRole('button', { name: 'Save this voice' })).toBeNull();
    await user.selectOptions(voiceSelect(), 'custom');
    expect(screen.queryByRole('button', { name: 'Save this voice' })).toBeNull();
    await user.type(screen.getByLabelText('Describe the voice'), '   ');
    expect(screen.queryByRole('button', { name: 'Save this voice' })).toBeNull();
    await user.type(screen.getByLabelText('Describe the voice'), 'x');
    expect(screen.getByRole('button', { name: 'Save this voice' })).toBeInTheDocument();
  });

  it('saves with a name, selects it, and keeps it for other pages', async () => {
    const user = userEvent.setup();
    const view = await renderPage();
    await typeCustomVoice(user, '  You are a calm finance coach  ');
    await user.click(screen.getByRole('button', { name: 'Save this voice' }));
    const input = screen.getByLabelText('Name');
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('maxlength', '40');
    expect(input).toHaveAttribute('placeholder', 'e.g. My finance voice');
    await user.type(input, ' My finance voice ');
    expect(screen.getByText('18/40')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save voice' }));

    expect(voiceSelect().value).toMatch(/^saved:/);
    await waitFor(() => expect(voiceSelect()).toHaveFocus());
    expect(screen.getByRole('status')).toHaveTextContent('Saved “My finance voice”.');
    expect(screen.queryByLabelText('Name')).toBeNull();
    expect(screen.queryByLabelText('Describe the voice')).toBeNull();
    const group = voiceSelect().querySelector('optgroup')!;
    expect(group).toHaveAttribute('label', 'Saved voices');
    expect(within(group as unknown as HTMLElement).getByRole('option', { name: 'My finance voice' })).toBeInTheDocument();
    expect(readSavedVoices()).toEqual([
      expect.objectContaining({ name: 'My finance voice', text: 'You are a calm finance coach' }),
    ]);
    // The status line goes away on the next voice change.
    await user.selectOptions(voiceSelect(), 'storyteller');
    expect(screen.queryByText('Saved “My finance voice”.')).toBeNull();
    view.unmount();

    await renderPage();
    expect(optionTexts()).toEqual([
      'Educational blogger', 'Storyteller', 'Entertainer', 'Expert reviewer', 'Motivational coach',
      'My finance voice', 'Custom voice…',
    ]);
  });

  it('Enter saves; the list is in saved order', async () => {
    const user = userEvent.setup();
    store(SAVED_VOICES_KEY, [voice('a', 'First', 'one')]);
    await renderPage();
    await typeCustomVoice(user, 'two');
    await user.click(screen.getByRole('button', { name: 'Save this voice' }));
    await user.type(screen.getByLabelText('Name'), 'Second{Enter}');
    expect(readSavedVoices().map((v) => v.name)).toEqual(['First', 'Second']);
    expect(optionTexts().slice(5, 7)).toEqual(['First', 'Second']);
  });

  it('refuses a blank name; the error goes when the name changes', async () => {
    const user = userEvent.setup();
    await renderPage();
    await typeCustomVoice(user, 'You are calm');
    await saveAs(user, '   ');
    const input = screen.getByLabelText('Name');
    const error = screen.getByText('Give the voice a name.');
    expect(error).toHaveClass('text-danger');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain(error.id);
    expect(readSavedVoices()).toEqual([]);
    await user.type(input, 'a');
    expect(screen.queryByText('Give the voice a name.')).toBeNull();
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('refuses a duplicate name ignoring case and spaces', async () => {
    const user = userEvent.setup();
    store(SAVED_VOICES_KEY, [voice('a', 'My Voice', 'original')]);
    await renderPage();
    await typeCustomVoice(user, 'new text');
    await saveAs(user, '  my voice ');
    expect(screen.getByText('You already have a voice called “My Voice”.')).toBeInTheDocument();
    expect(readSavedVoices()).toEqual([voice('a', 'My Voice', 'original')]);
  });

  it('Cancel and Escape close the row, keep the text and return focus', async () => {
    const user = userEvent.setup();
    await renderPage();
    await typeCustomVoice(user, 'You are calm');
    await user.click(screen.getByRole('button', { name: 'Save this voice' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Name')).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save this voice' })).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Save this voice' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByLabelText('Name')).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save this voice' })).toHaveFocus());
    expect(screen.getByLabelText('Describe the voice')).toHaveValue('You are calm');
  });

  it('with 20 voices saving is not offered', async () => {
    const user = userEvent.setup();
    store(SAVED_VOICES_KEY, Array.from({ length: 20 }, (_, i) => voice(`id${i}`, `Voice ${i}`, `text ${i}`)));
    await renderPage();
    expect(voiceSelect().querySelectorAll('optgroup option')).toHaveLength(20);
    await typeCustomVoice(user, 'one more');
    expect(screen.queryByRole('button', { name: 'Save this voice' })).toBeNull();
    expect(screen.getByText('You can keep up to 20 voices. Delete one to save another.')).toHaveClass('text-ink/50');
    expect(saveVoice(readSavedVoices(), 'Extra', 'x')).toEqual({
      ok: false, error: 'You can keep up to 20 voices. Delete one to save another.',
    });
  });
});

describe('Use a saved voice', () => {
  it('sends voice custom with the saved text and names it in the message', async () => {
    const user = userEvent.setup();
    const stub = makeStub();
    store(SAVED_VOICES_KEY, [voice('a', 'Finance', 'You are a finance coach')]);
    await renderPage(stub);
    await user.selectOptions(voiceSelect(), 'saved:a');
    const description = document.getElementById('ai-voice-description')!;
    expect(description).toHaveTextContent('You are a finance coach');
    expect(description).toHaveAttribute('title', 'You are a finance coach');
    expect(description).toHaveClass('line-clamp-3', 'break-words');
    await user.click(writeButton());
    expect(stub.writeRemixWithAi).toHaveBeenCalledWith('remix_1', {
      voice: 'custom', customVoice: 'You are a finance coach', instructions: undefined,
    });
    expect(
      await screen.findByText('Draft written in the “Finance” voice. Review it, then press Save changes.')
    ).toBeInTheDocument();
    expect(readLastVoice()?.selection).toBe('saved:a');
  });

  it('renders saved text as text, never as HTML', async () => {
    store(SAVED_VOICES_KEY, [voice('a', '<b>Bold</b>', '<img src=x onerror=alert(1)>')]);
    store(LAST_VOICE_KEY, { selection: 'saved:a', customText: '' });
    await renderPage();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(optionTexts()).toContain('<b>Bold</b>');
  });
});

describe('Loading state', () => {
  it('disables the voice controls while Gemini writes', async () => {
    const user = userEvent.setup();
    const stub = makeStub();
    let finish!: (value: ServiceResult<AiDraft>) => void;
    stub.writeRemixWithAi.mockReturnValueOnce(new Promise((r) => (finish = r)));
    store(SAVED_VOICES_KEY, [voice('a', 'Finance', 'You are a finance coach')]);
    await renderPage(stub);
    await typeCustomVoice(user, 'You are calm');
    await user.click(screen.getByRole('button', { name: 'Save this voice' }));
    await user.click(writeButton());
    expect(voiceSelect()).toBeDisabled();
    expect(screen.getByLabelText('Name')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save voice' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    finish({ data: DRAFT, error: null });
    await screen.findByText(/Draft written in the custom voice/);

    await user.selectOptions(voiceSelect(), 'saved:a');
    stub.writeRemixWithAi.mockReturnValueOnce(new Promise((r) => (finish = r)));
    await user.click(writeButton());
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Write with AI' }));
    expect(screen.getByRole('button', { name: 'Delete saved voice Finance' })).toBeDisabled();
    finish({ data: DRAFT, error: null });
    await screen.findByText(/Draft written in the “Finance” voice/);
  });
});

describe('Delete a saved voice', () => {
  it('asks first; Cancel keeps it and returns focus to Delete', async () => {
    const user = userEvent.setup();
    store(SAVED_VOICES_KEY, [voice('a', 'Finance', 'You are a finance coach')]);
    await renderPage();
    await user.selectOptions(voiceSelect(), 'saved:a');
    const del = screen.getByRole('button', { name: 'Delete saved voice Finance' });
    await user.click(del);
    const dialog = screen.getByRole('dialog', { name: 'Delete this voice?' });
    expect(dialog).toHaveTextContent('“Finance” will be removed from this browser. Remixes you already wrote are not changed.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(del).toHaveFocus();
    expect(readSavedVoices()).toHaveLength(1);
  });

  it('deletes after confirming and falls back to Custom voice with the text', async () => {
    const user = userEvent.setup();
    store(SAVED_VOICES_KEY, [voice('a', 'Finance', 'You are a finance coach'), voice('b', 'Other', 'other')]);
    store(LAST_VOICE_KEY, { selection: 'saved:a', customText: '' });
    const view = await renderPage();
    expect(voiceSelect().value).toBe('saved:a');
    await user.click(screen.getByRole('button', { name: 'Delete saved voice Finance' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete voice' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(voiceSelect().value).toBe('custom');
    expect(screen.getByLabelText('Describe the voice')).toHaveValue('You are a finance coach');
    await waitFor(() => expect(voiceSelect()).toHaveFocus());
    expect(optionTexts()).not.toContain('Finance');
    expect(readSavedVoices().map((v) => v.id)).toEqual(['b']);
    view.unmount();

    // The remembered voice was the deleted one: the next page starts with Educational blogger.
    await renderPage();
    expect(voiceSelect().value).toBe('educational_blogger');
    expect(optionTexts()).not.toContain('Finance');
  });
});

describe('Robustness', () => {
  it.each([
    ['not JSON', '{not json'],
    ['wrong shape', '{"voices": 3}'],
    ['a number', '42'],
  ])('ignores stored data that is %s', async (_name, raw) => {
    store(SAVED_VOICES_KEY, raw);
    store(LAST_VOICE_KEY, raw);
    await renderPage();
    expect(voiceSelect().value).toBe('educational_blogger');
    expect(voiceSelect().querySelector('optgroup')).toBeNull();
  });

  it('drops bad entries and cuts long ones', () => {
    store(SAVED_VOICES_KEY, [
      voice('a', 'Good', 'fine'),
      voice('b', '   ', 'blank name'),
      voice('c', 'Blank text', '  '),
      voice('a', 'Duplicate id', 'dup'),
      { id: 'd', name: 5, text: 'x' },
      null,
      voice('e', 'N'.repeat(60), 'T'.repeat(400)),
    ]);
    const voices = readSavedVoices();
    expect(voices.map((v) => v.id)).toEqual(['a', 'e']);
    expect(voices[1].name).toHaveLength(40);
    expect(voices[1].text).toHaveLength(300);
  });

  it('works when localStorage throws: nothing is remembered, saving shows an error', async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    const stub = makeStub();
    await renderPage(stub);
    expect(voiceSelect().value).toBe('educational_blogger');
    await user.click(writeButton());
    await screen.findByText(/Draft written in the Educational blogger voice/);

    await typeCustomVoice(user, 'You are calm');
    await saveAs(user, 'Calm');
    expect(screen.getByText("This browser can't save voices right now.")).toHaveClass('text-danger');
    expect(voiceSelect().value).toBe('custom');
    expect(voiceSelect().querySelector('optgroup')).toBeNull();
  });

  it('names a saved voice in quotes', () => {
    expect(voiceName('custom', 'Finance')).toBe('“Finance”');
    expect(voiceName('custom')).toBe('custom');
  });
});
