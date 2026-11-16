import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { AiDraft, ContentPlanItem, RemixedVideo, ServiceResult, Video, VideosApi } from '@/types';
import { ApiProvider } from '@/services/ApiContext';
import { VideosPage } from '@/pages/VideosPage';
import { RemixPage } from '@/pages/RemixPage';
import { writeLastVoice } from '@/utils/voiceStorage';

// Issue #99: Write with AI straight from the Videos page.

const INTRO = 'Pick a voice, then press Write with AI. Nothing changes until you press Save changes.';

function video(overrides: Partial<Video> = {}): Video {
  return {
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
    ...overrides,
  };
}

const REMIX: RemixedVideo = {
  id: 'remix_1',
  videoId: 'video_1',
  title: 'Saved title',
  hook: 'Saved hook',
  script: '1. Saved\n2. Script',
  cta: 'Saved CTA',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
};

const DRAFT: AiDraft = {
  title: 'AI title',
  hook: 'AI hook',
  script: '1. AI\n2. Script',
  cta: 'AI CTA',
  model: 'gemini-3.5-flash',
  writesLeftToday: 12,
  writesPerDay: 50,
};

function makeStub() {
  return {
    listVideos: vi.fn(async (): Promise<ServiceResult<Video[]>> => ({
      data: [video(), video({ id: 'video_2', youtubeId: 'AAAAAAAAAA2', caption: 'Second video' })],
      error: null,
    })),
    listRemixes: vi.fn(async (): Promise<ServiceResult<RemixedVideo[]>> => ({ data: [], error: null })),
    listContentPlan: vi.fn(async (): Promise<ServiceResult<ContentPlanItem[]>> => ({ data: [], error: null })),
    addToContentPlan: vi.fn(async (): Promise<ServiceResult<ContentPlanItem>> => ({ data: null, error: 'nope' })),
    remixVideo: vi.fn(async (): Promise<ServiceResult<RemixedVideo>> => ({ data: REMIX, error: null })),
    getRemix: vi.fn(async (): Promise<ServiceResult<RemixedVideo>> => ({ data: REMIX, error: null })),
    getVideo: vi.fn(async (): Promise<ServiceResult<Video>> => ({ data: video(), error: null })),
    writeRemixWithAi: vi.fn(async (): Promise<ServiceResult<AiDraft>> => ({ data: DRAFT, error: null })),
    updateRemix: vi.fn(async (_id: string, patch: Partial<RemixedVideo>): Promise<ServiceResult<RemixedVideo>> => ({
      data: { ...REMIX, ...patch },
      error: null,
    })),
    applyRemixTemplate: vi.fn(async (): Promise<ServiceResult<RemixedVideo>> => ({ data: REMIX, error: null })),
  };
}
type Stub = ReturnType<typeof makeStub>;

// Shows the current address, so tests can check where the page went and what is left of it.
function Location() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname + location.search}</p>;
}

function renderAt(stub: Stub, path: string, remixElement = <p>Remix editor</p>) {
  return render(
    <ApiProvider api={stub as unknown as VideosApi}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/videos" element={<VideosPage />} />
          <Route path="/remix/:id" element={remixElement} />
        </Routes>
        <Location />
      </MemoryRouter>
    </ApiProvider>
  );
}

const location = () => screen.getByTestId('location').textContent;
const writeOn = (caption: string) => screen.getByRole('button', { name: `Write with AI: ${caption}` });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('Videos page: Write with AI', () => {
  it('shows Write with AI on every card, between Add to plan and Remix, as an outline button', async () => {
    renderAt(makeStub(), '/videos');
    await screen.findByText('Second video');
    const buttons = screen.getAllByRole('button', { name: /^Write with AI: / });
    expect(buttons).toHaveLength(2);
    const button = writeOn('I let AI build my SaaS in 48 hours');
    expect(button).toHaveClass('btn-outline');
    expect(button).toHaveTextContent('Write with AI');
    const card = button.closest('article')!;
    const order = within(card).getAllByRole('button').map((b) => b.textContent?.trim());
    expect(order).toEqual(['Add to plan', 'Write with AI', 'Remix']);
    // Remix stays the card's one gradient button.
    expect(within(card).getAllByRole('button').filter((b) => b.classList.contains('btn-primary'))).toHaveLength(1);
  });

  it('cuts a long caption to 80 characters in the accessible name', async () => {
    const stub = makeStub();
    const long = 'A'.repeat(120);
    stub.listVideos.mockResolvedValue({ data: [video({ caption: long })], error: null });
    renderAt(stub, '/videos');
    expect(await screen.findByRole('button', { name: `Write with AI: ${'A'.repeat(80)}` })).toBeInTheDocument();
  });

  it('creates (or reuses) the remix once and opens /remix/{id}?write=ai in grid view', async () => {
    const user = userEvent.setup();
    const stub = makeStub();
    renderAt(stub, '/videos');
    await user.click(await screen.findByRole('button', { name: 'Write with AI: Second video' }));
    expect(stub.remixVideo).toHaveBeenCalledTimes(1);
    expect(stub.remixVideo).toHaveBeenCalledWith('video_2');
    expect(await screen.findByText('Remix editor')).toBeInTheDocument();
    expect(location()).toBe('/remix/remix_1?write=ai');
    expect(stub.writeRemixWithAi).not.toHaveBeenCalled();
    expect(stub.updateRemix).not.toHaveBeenCalled();
  });

  it('does the same in list view', async () => {
    const user = userEvent.setup();
    const stub = makeStub();
    renderAt(stub, '/videos');
    await screen.findByText('Second video');
    await user.click(screen.getByRole('button', { name: 'List' }));
    const button = writeOn('I let AI build my SaaS in 48 hours');
    expect(button.closest('li')).not.toBeNull();
    await user.click(button);
    expect(stub.remixVideo).toHaveBeenCalledTimes(1);
    expect(stub.remixVideo).toHaveBeenCalledWith('video_1');
    await waitFor(() => expect(location()).toBe('/remix/remix_1?write=ai'));
  });

  it('Remix still opens the editor without the parameter', async () => {
    const user = userEvent.setup();
    renderAt(makeStub(), '/videos');
    const card = (await screen.findByText('Second video')).closest('article')!;
    await user.click(within(card).getByRole('button', { name: 'Remix' }));
    await waitFor(() => expect(location()).toBe('/remix/remix_1'));
  });

  it('while it runs, that video’s three buttons are disabled and only Write with AI spins', async () => {
    const user = userEvent.setup();
    const stub = makeStub();
    const pending = deferred<ServiceResult<RemixedVideo>>();
    stub.remixVideo.mockReturnValue(pending.promise);
    renderAt(stub, '/videos');
    await user.click(await screen.findByRole('button', { name: 'Write with AI: Second video' }));

    const card = writeOn('Second video').closest('article')!;
    const [addToPlan, write, remix] = within(card).getAllByRole('button');
    expect(addToPlan).toBeDisabled();
    expect(write).toBeDisabled();
    expect(remix).toBeDisabled();
    expect(write.querySelector('.animate-spin')).not.toBeNull();
    expect(write).toHaveTextContent('Write with AI');
    expect(remix.querySelector('.animate-spin')).toBeNull();
    // Other videos are unaffected.
    expect(writeOn('I let AI build my SaaS in 48 hours')).toBeEnabled();

    pending.resolve({ data: REMIX, error: null });
    await waitFor(() => expect(location()).toBe('/remix/remix_1?write=ai'));
  });

  it('shows the error and stays on the page when creating fails', async () => {
    const user = userEvent.setup();
    const stub = makeStub();
    stub.remixVideo.mockResolvedValue({ data: null, error: 'Video not found.' });
    renderAt(stub, '/videos');
    await user.click(await screen.findByRole('button', { name: 'Write with AI: Second video' }));
    expect(await screen.findByText('Video not found.')).toBeInTheDocument();
    expect(location()).toBe('/videos');
    expect(writeOn('Second video')).toBeEnabled();
  });

  it('falls back to the Remix wording when the server gives no message', async () => {
    const user = userEvent.setup();
    const stub = makeStub();
    stub.remixVideo.mockResolvedValue({ data: null, error: null });
    renderAt(stub, '/videos');
    await user.click(await screen.findByRole('button', { name: 'Write with AI: Second video' }));
    expect(await screen.findByText('Could not create the breakdown.')).toBeInTheDocument();
    expect(location()).toBe('/videos');
  });
});

describe('Remix page opened with ?write=ai', () => {
  async function openWithAi(stub: Stub) {
    renderAt(stub, '/remix/remix_1?write=ai', <RemixPage />);
    await screen.findByRole('heading', { name: 'Write with AI' });
  }

  it('focuses Creator voice, shows the info notice, does not call Gemini, and drops the parameter', async () => {
    const stub = makeStub();
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    await openWithAi(stub);
    await waitFor(() => expect(screen.getByLabelText('Creator voice')).toHaveFocus());
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }));
    expect(screen.getByText(INTRO)).toBeInTheDocument();
    expect(location()).toBe('/remix/remix_1');
    expect(stub.writeRemixWithAi).not.toHaveBeenCalled();
    // The editor keeps the saved text; nothing is unsaved.
    expect(screen.getByLabelText('Hook')).toHaveValue('Saved hook');
    expect(screen.queryByText('Unsaved changes')).toBeNull();
    // The notice sits under the heading, above Creator voice.
    const notice = screen.getByText(INTRO);
    expect(notice.compareDocumentPosition(screen.getByLabelText('Creator voice')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // @ts-expect-error clean up the jsdom stub
    delete Element.prototype.scrollIntoView;
  });

  it('the notice goes on Dismiss', async () => {
    const user = userEvent.setup();
    await openWithAi(makeStub());
    const notice = screen.getByText(INTRO).closest('[role="status"]') as HTMLElement;
    await user.click(within(notice).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(INTRO)).toBeNull();
  });

  it('the notice goes on Write with AI, and the draft is saved only with Save changes', async () => {
    const user = userEvent.setup();
    const stub = makeStub();
    await openWithAi(stub);
    await user.click(screen.getByRole('button', { name: 'Write with AI' }));
    expect(screen.queryByText(INTRO)).toBeNull();
    expect(stub.writeRemixWithAi).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Unsaved changes')).toBeInTheDocument();
    expect(screen.getByLabelText('Hook')).toHaveValue('AI hook');
    expect(stub.updateRemix).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(stub.updateRemix).toHaveBeenCalledWith('remix_1', expect.objectContaining({ hook: 'AI hook' }));
  });

  it('the notice goes on Apply template', async () => {
    const user = userEvent.setup();
    await openWithAi(makeStub());
    await user.click(screen.getByRole('button', { name: 'Apply template' }));
    expect(screen.queryByText(INTRO)).toBeNull();
  });

  it('starts with the last remembered voice (#98)', async () => {
    writeLastVoice({ selection: 'storyteller', customText: '' });
    await openWithAi(makeStub());
    await waitFor(() => expect(screen.getByLabelText('Creator voice')).toHaveFocus());
    expect(screen.getByLabelText('Creator voice')).toHaveValue('storyteller');
  });

  it('without the parameter nothing changes', async () => {
    const stub = makeStub();
    renderAt(stub, '/remix/remix_1', <RemixPage />);
    await screen.findByRole('heading', { name: 'Write with AI' });
    expect(screen.queryByText(INTRO)).toBeNull();
    expect(screen.getByLabelText('Creator voice')).not.toHaveFocus();
    expect(location()).toBe('/remix/remix_1');
    expect(stub.writeRemixWithAi).not.toHaveBeenCalled();
  });
});
