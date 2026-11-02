import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type {
  VideosApi,
  Video,
  Competitor,
  ContentPlanItem,
  RemixedVideo,
  ServiceResult,
} from '@/types';
import { ApiProvider } from '@/services/ApiContext';
import { DashboardPage } from '@/pages/DashboardPage';
import { VideosPage } from '@/pages/VideosPage';
import { CompetitorsPage } from '@/pages/CompetitorsPage';
import { RemixesPage } from '@/pages/RemixesPage';
import { ContentPlanPage } from '@/pages/ContentPlanPage';
import { RemixPage } from '@/pages/RemixPage';

// A stub service whose returns we control per test. Pages depend only on VideosApi.
class StubApi implements Partial<VideosApi> {
  listVideos = vi.fn(async (): Promise<ServiceResult<Video[]>> => ({ data: [], error: null }));
  listCompetitors = vi.fn(async (): Promise<ServiceResult<Competitor[]>> => ({ data: [], error: null }));
  addCompetitor = vi.fn(async (): Promise<ServiceResult<Competitor>> => ({ data: null, error: 'Invalid' }));
  fetchVideosForCompetitor = vi.fn(async (): Promise<ServiceResult<Video[]>> => ({ data: [], error: null }));
  removeCompetitor = vi.fn(async (): Promise<ServiceResult<void>> => ({ data: null, error: null }));
  remixVideo = vi.fn(async (): Promise<ServiceResult<RemixedVideo>> => ({ data: null, error: 'nope' }));
  getVideo = vi.fn(async (): Promise<ServiceResult<Video>> => ({ data: null, error: 'nope' }));
  getRemix = vi.fn(async (): Promise<ServiceResult<RemixedVideo>> => ({ data: null, error: 'nope' }));
  updateRemix = vi.fn(async (): Promise<ServiceResult<RemixedVideo>> => ({ data: null, error: 'nope' }));
  listRemixes = vi.fn(async (): Promise<ServiceResult<RemixedVideo[]>> => ({ data: [], error: null }));
  getRemixForVideo = vi.fn(async (): Promise<ServiceResult<RemixedVideo>> => ({ data: null, error: 'none' }));
  applyRemixTemplate = vi.fn(async (): Promise<ServiceResult<RemixedVideo>> => ({ data: null, error: 'nope' }));
  listContentPlan = vi.fn(async (): Promise<ServiceResult<ContentPlanItem[]>> => ({ data: [], error: null }));
  addToContentPlan = vi.fn(async (): Promise<ServiceResult<ContentPlanItem>> => ({ data: null, error: 'nope' }));
  updateContentPlanStatus = vi.fn(async (): Promise<ServiceResult<ContentPlanItem>> => ({ data: null, error: 'nope' }));
  updateContentPlanItem = vi.fn(async (): Promise<ServiceResult<ContentPlanItem>> => ({ data: null, error: 'nope' }));
  removeFromContentPlan = vi.fn(async (): Promise<ServiceResult<void>> => ({ data: undefined, error: null }));
}

function video(overrides: Partial<Video> = {}): Video {
  return {
    id: 'video_1',
    competitorId: 'comp_1',
    competitorUsername: 'vibecoder',
    youtubeId: 'AAAAAAAAAA1',
    permalink: 'https://www.youtube.com/@vibecoder',
    caption: 'I let AI build my SaaS in 48 hours',
    description: '',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    viewCount: 120000,
    likeCount: 5400,
    commentCount: 230,
    postedAt: new Date(Date.now() - 86_400_000 * 3).toISOString(),
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

function planItem(overrides: Partial<ContentPlanItem> = {}): ContentPlanItem {
  return {
    id: 'plan_1',
    videoId: 'video_1',
    status: 'not_started',
    competitorUsername: 'vibecoder',
    caption: 'I let AI build my SaaS in 48 hours',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    permalink: 'https://www.youtube.com/@vibecoder',
    postedAt: new Date(Date.now() - 86_400_000).toISOString(),
    addedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    filmDate: null,
    publishDate: null,
    scriptDone: false,
    recordingDone: false,
    captionDone: false,
    publishedDone: false,
    ...overrides,
  };
}

function renderAt(stub: StubApi, path: string, element: React.ReactElement, route: string) {
  return render(
    <ApiProvider api={stub as unknown as VideosApi}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={element} />
          <Route path="/remix/:id" element={<p>Remix editor</p>} />
        </Routes>
      </MemoryRouter>
    </ApiProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DashboardPage', () => {
  it('shows the hero with a link field when nothing is tracked yet', async () => {
    const stub = new StubApi();
    renderAt(stub, '/', <DashboardPage />, '/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/viral ideas/i);
    expect(screen.getByLabelText(/youtube channel link/i)).toBeInTheDocument();
    await waitFor(() => expect(stub.listCompetitors).toHaveBeenCalled());
  });

  it('adds a competitor and fetches its Videos in one step', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.addCompetitor.mockResolvedValue({
      data: { id: 'comp_1', username: 'vibecoder', channelId: 'sample-vibecoder', channelUrl: '', displayName: 'Vibecoder', avatarUrl: '', addedAt: '' },
      error: null,
    });
    stub.fetchVideosForCompetitor.mockResolvedValue({ data: [video(), video({ id: 'video_2' })], error: null });
    renderAt(stub, '/', <DashboardPage />, '/');

    await user.type(screen.getByLabelText(/youtube channel link/i), '@vibecoder');
    await user.click(screen.getByRole('button', { name: /track & fetch/i }));

    expect(stub.addCompetitor).toHaveBeenCalledWith('@vibecoder');
    await waitFor(() => expect(stub.fetchVideosForCompetitor).toHaveBeenCalledWith('comp_1'));
    expect(await screen.findByText('Pulled 2 videos from Vibecoder.')).toBeInTheDocument();
  });

  it('shows the validation error and does not fetch when the link is invalid', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.addCompetitor.mockResolvedValue({ data: null, error: 'That is not a valid YouTube channel' });
    renderAt(stub, '/', <DashboardPage />, '/');

    await user.type(screen.getByLabelText(/youtube channel link/i), 'https://twitter.com/x');
    await user.click(screen.getByRole('button', { name: /track & fetch/i }));

    expect(await screen.findByText(/not a valid youtube channel/i)).toBeInTheDocument();
    expect(stub.fetchVideosForCompetitor).not.toHaveBeenCalled();
  });

  it('shows totals, the top Video and the most-viewed competitor', async () => {
    const stub = new StubApi();
    stub.listCompetitors.mockResolvedValue({
      data: [{ id: 'comp_1', username: 'vibecoder', channelId: 'sample-vibecoder', channelUrl: '', displayName: 'Vibecoder', avatarUrl: '', addedAt: '' }],
      error: null,
    });
    stub.listVideos.mockResolvedValue({
      data: [video({ viewCount: 500 }), video({ id: 'video_2', caption: 'Top one', viewCount: 9000 })],
      error: null,
    });
    stub.listContentPlan.mockResolvedValue({ data: [planItem({ status: 'filmed' })], error: null });
    renderAt(stub, '/', <DashboardPage />, '/');

    const totals = await screen.findByRole('region', { name: /totals/i });
    expect(within(totals).getByText('Videos').previousSibling).toHaveTextContent('2');
    expect((await screen.findAllByText('Top one')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/@vibecoder/).length).toBeGreaterThan(0);
  });
});

describe('VideosPage', () => {
  it('shows the empty state when there are no videos', async () => {
    const stub = new StubApi();
    renderAt(stub, '/videos', <VideosPage />, '/videos');
    expect(await screen.findByText(/no videos yet/i)).toBeInTheDocument();
  });

  it('renders videos with a Remix button for each', async () => {
    const stub = new StubApi();
    stub.listVideos.mockResolvedValue({
      data: [video(), video({ id: 'video_2', caption: 'Second video' })],
      error: null,
    });
    renderAt(stub, '/videos', <VideosPage />, '/videos');
    expect(await screen.findByText(/I let AI build my SaaS/)).toBeInTheDocument();
    expect(screen.getByText('Second video')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^remix$/i })).toHaveLength(2);
  });

  it('filters by caption search and sorts by views', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listVideos.mockResolvedValue({
      data: [
        video({ id: 'a', caption: 'Prompt tips', viewCount: 10 }),
        video({ id: 'b', caption: 'SaaS build', viewCount: 900 }),
      ],
      error: null,
    });
    renderAt(stub, '/videos', <VideosPage />, '/videos');
    await screen.findByText('Prompt tips');

    await user.type(screen.getByLabelText(/search captions/i), 'saas');
    expect(screen.queryByText('Prompt tips')).toBeNull();
    expect(screen.getByText('SaaS build')).toBeInTheDocument();
  });

  it('switches to the list layout', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listVideos.mockResolvedValue({ data: [video()], error: null });
    renderAt(stub, '/videos', <VideosPage />, '/videos');
    await screen.findByText(/I let AI build my SaaS/);
    await user.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('adds a Video to the plan and shows a success message', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listVideos.mockResolvedValue({ data: [video()], error: null });
    stub.addToContentPlan.mockResolvedValue({ data: planItem(), error: null });
    renderAt(stub, '/videos', <VideosPage />, '/videos');

    await user.click(await screen.findByRole('button', { name: /add to plan/i }));

    expect(stub.addToContentPlan).toHaveBeenCalledWith('video_1');
    expect(await screen.findByText('Added to your Content Plan.')).toBeInTheDocument();
    expect(screen.getByText(/in content plan/i)).toBeInTheDocument();
  });

  it('says so when the Video is already in the plan', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listVideos.mockResolvedValue({ data: [video()], error: null });
    stub.listContentPlan.mockResolvedValue({ data: [planItem({ status: 'ready' })], error: null });
    renderAt(stub, '/videos', <VideosPage />, '/videos');
    expect(await screen.findByText(/in content plan/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add to plan/i })).toBeNull();
  });

  it('opens a preview of an existing remix', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listVideos.mockResolvedValue({ data: [video()], error: null });
    stub.listRemixes.mockResolvedValue({
      data: [{ id: 'remix_1', videoId: 'video_1', title: 'Remix: SaaS', hook: 'Hook text', script: 's', cta: 'c', createdAt: '', updatedAt: '' }],
      error: null,
    });
    renderAt(stub, '/videos', <VideosPage />, '/videos');
    await user.click(await screen.findByRole('button', { name: 'Preview' }));
    expect(await screen.findByRole('complementary', { name: /remix preview/i })).toHaveTextContent('Hook text');
  });
});

describe('CompetitorsPage', () => {
  it('adds a competitor from the modal', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.addCompetitor.mockResolvedValue({
      data: { id: 'comp_1', username: 'vibecoder', channelId: 'sample-vibecoder', channelUrl: '', displayName: 'Vibecoder', avatarUrl: '', addedAt: '' },
      error: null,
    });
    renderAt(stub, '/competitors', <CompetitorsPage />, '/competitors');

    await user.click(await screen.findByRole('button', { name: /add competitor/i }));
    const dialog = screen.getByRole('dialog', { name: /add a competitor/i });
    await user.type(within(dialog).getByPlaceholderText(/youtube\.com\/@mkbhd/i), 'https://www.youtube.com/@vibecoder');
    await user.click(within(dialog).getByRole('button', { name: /add competitor/i }));

    await waitFor(() => expect(stub.addCompetitor).toHaveBeenCalledWith('https://www.youtube.com/@vibecoder'));
  });

  it('shows a validation error inside the modal', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.addCompetitor.mockResolvedValue({ data: null, error: 'That is not a valid YouTube channel' });
    renderAt(stub, '/competitors', <CompetitorsPage />, '/competitors');

    await user.click(await screen.findByRole('button', { name: /add competitor/i }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), 'https://twitter.com/x');
    await user.click(within(dialog).getByRole('button', { name: /add competitor/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/not a valid youtube channel/i);
  });

  it('asks for confirmation before removing a competitor', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listCompetitors.mockResolvedValue({
      data: [{ id: 'comp_1', username: 'vibecoder', channelId: 'sample-vibecoder', channelUrl: '', displayName: 'Vibecoder', avatarUrl: '', addedAt: new Date().toISOString() }],
      error: null,
    });
    renderAt(stub, '/competitors', <CompetitorsPage />, '/competitors');

    await user.click(await screen.findByRole('button', { name: /remove @vibecoder/i }));
    expect(screen.getByRole('dialog', { name: /remove @vibecoder/i })).toBeInTheDocument();
    expect(stub.removeCompetitor).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /remove competitor/i }));
    await waitFor(() => expect(stub.removeCompetitor).toHaveBeenCalledWith('comp_1'));
  });
});

describe('RemixesPage', () => {
  it('shows the empty state when there are no remixes', async () => {
    const stub = new StubApi();
    renderAt(stub, '/remixes', <RemixesPage />, '/remixes');
    expect(await screen.findByText(/no remixes yet/i)).toBeInTheDocument();
  });
});

describe('ContentPlanPage', () => {
  it('shows items on the board by default, with status counts', async () => {
    const stub = new StubApi();
    stub.listContentPlan.mockResolvedValue({ data: [planItem({ status: 'ready' })], error: null });
    renderAt(stub, '/content-plan', <ContentPlanPage />, '/content-plan');

    const readyColumn = await screen.findByRole('region', { name: /ready to film/i });
    expect(within(readyColumn).getByText('I let AI build my SaaS in 48 hours')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches to the table view', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listContentPlan.mockResolvedValue({ data: [planItem()], error: null });
    renderAt(stub, '/content-plan', <ContentPlanPage />, '/content-plan');
    await user.click(await screen.findByRole('button', { name: 'Table' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('changes an item status', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listContentPlan.mockResolvedValue({ data: [planItem()], error: null });
    stub.updateContentPlanStatus.mockResolvedValue({ data: planItem({ status: 'ready' }), error: null });
    renderAt(stub, '/content-plan', <ContentPlanPage />, '/content-plan');

    const group = (await screen.findAllByRole('group', { name: /status for/i }))[0];
    await user.click(within(group).getByRole('button', { name: /ready to film/i }));

    expect(stub.updateContentPlanStatus).toHaveBeenCalledWith('plan_1', 'ready');
  });

  it('shows the empty state when nothing is planned', async () => {
    const stub = new StubApi();
    renderAt(stub, '/content-plan', <ContentPlanPage />, '/content-plan');
    expect(await screen.findByText(/nothing planned yet/i)).toBeInTheDocument();
  });
});


describe('bugs found while testing the running app', () => {
  it('"Back to videos" on the remix page goes to /videos', async () => {
    const stub = new StubApi();
    stub.getRemix.mockResolvedValue({
      data: { id: 'remix_1', videoId: 'video_1', title: 'Remix: x', hook: 'h', script: 's', cta: 'c', createdAt: '', updatedAt: '' },
      error: null,
    });
    stub.getVideo.mockResolvedValue({ data: video(), error: null });
    renderAt(stub, '/remix/remix_1', <RemixPage />, '/remix/:id');
    const link = await screen.findByRole('link', { name: /back to videos/i });
    expect(link).toHaveAttribute('href', '/videos');
  });

  it('Escape closes the remix preview and focus goes back to Preview', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listVideos.mockResolvedValue({ data: [video()], error: null });
    stub.listRemixes.mockResolvedValue({
      data: [{ id: 'remix_1', videoId: 'video_1', title: 'Remix: SaaS', hook: 'Hook text', script: 's', cta: 'c', createdAt: '', updatedAt: '' }],
      error: null,
    });
    renderAt(stub, '/videos', <VideosPage />, '/videos');
    await user.click(await screen.findByRole('button', { name: 'Preview' }));
    expect(await screen.findByRole('complementary', { name: /remix preview/i })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('complementary', { name: /remix preview/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Preview' })).toHaveFocus();
  });

  it('offers Clear filters when nothing matches and restores every Video', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listVideos.mockResolvedValue({
      data: [video({ id: 'a', caption: 'Prompt tips' }), video({ id: 'b', caption: 'SaaS build' })],
      error: null,
    });
    renderAt(stub, '/videos', <VideosPage />, '/videos');
    await screen.findByText('Prompt tips');

    await user.type(screen.getByLabelText(/search captions/i), 'zzzzzz');
    expect(screen.getByText('No videos match these filters.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(screen.getByText('Prompt tips')).toBeInTheDocument();
    expect(screen.getByText('SaaS build')).toBeInTheDocument();
    expect(screen.getByLabelText(/search captions/i)).toHaveValue('');
  });

  it('says "1 competitor" for a single competitor on the dashboard', async () => {
    const stub = new StubApi();
    stub.listCompetitors.mockResolvedValue({
      data: [{ id: 'comp_1', username: 'vibecoder', channelId: 'sample-vibecoder', channelUrl: '', displayName: 'Vibecoder', avatarUrl: '', addedAt: '' }],
      error: null,
    });
    stub.listVideos.mockResolvedValue({ data: [video()], error: null });
    renderAt(stub, '/', <DashboardPage />, '/');
    expect(await screen.findByText(/Tracking 1 competitor · 1 video/)).toBeInTheDocument();
    expect(screen.queryByText(/1 competitors/)).toBeNull();
  });

  it('explains plainly when a planned Video has been removed from the library', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listContentPlan.mockResolvedValue({ data: [planItem()], error: null });
    stub.remixVideo.mockResolvedValue({ data: null, error: 'Video not found.' });
    renderAt(stub, '/content-plan', <ContentPlanPage />, '/content-plan');

    await user.click(await screen.findByRole('button', { name: 'Create breakdown' }));

    expect(await screen.findByText(/no longer in your library/i)).toBeInTheDocument();
    expect(screen.queryByText('Video not found.')).toBeNull();
  });

  it('limits the remix editor fields to what the database stores', async () => {
    const stub = new StubApi();
    stub.getRemix.mockResolvedValue({
      data: { id: 'remix_1', videoId: 'video_1', title: 't', hook: 'h', script: 's', cta: 'c', createdAt: '', updatedAt: '' },
      error: null,
    });
    stub.getVideo.mockResolvedValue({ data: video(), error: null });
    renderAt(stub, '/remix/remix_1', <RemixPage />, '/remix/:id');
    expect(await screen.findByLabelText('Title')).toHaveAttribute('maxlength', '500');
    expect(screen.getByLabelText('Hook')).toHaveAttribute('maxlength', '1000');
    expect(screen.getByLabelText('Script')).toHaveAttribute('maxlength', '2000');
    expect(screen.getByLabelText('Call to action')).toHaveAttribute('maxlength', '500');
  });
});

describe('bugs #49 and #52', () => {
  it('confirms before removing a Content Plan item, and Cancel keeps it', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listContentPlan.mockResolvedValue({ data: [planItem()], error: null });
    renderAt(stub, '/content-plan', <ContentPlanPage />, '/content-plan');

    await user.click((await screen.findAllByRole('button', { name: 'Remove from plan' }))[0]);
    expect(screen.getByRole('dialog')).toHaveTextContent(/I let AI build my SaaS in 48 hours/);
    expect(stub.removeFromContentPlan).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(stub.removeFromContentPlan).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('removes the item only after confirming', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listContentPlan.mockResolvedValue({ data: [planItem()], error: null });
    renderAt(stub, '/content-plan', <ContentPlanPage />, '/content-plan');

    await user.click((await screen.findAllByRole('button', { name: 'Remove from plan' }))[0]);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove from plan' }));
    await waitFor(() => expect(stub.removeFromContentPlan).toHaveBeenCalledWith('plan_1'));
  });
});

describe('links to YouTube', () => {
  it('shows a channel link on the dashboard as soon as a valid channel is typed', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    renderAt(stub, '/', <DashboardPage />, '/');
    const input = screen.getByLabelText(/youtube channel link/i);

    await user.type(input, 'https://twitter.com/x');
    expect(screen.queryByRole('link', { name: /on youtube/i })).not.toBeInTheDocument();

    await user.clear(input);
    await user.type(input, 'https://www.youtube.com/@MKBHD/featured');
    const link = screen.getByRole('link', { name: /open @mkbhd on youtube/i });
    expect(link).toHaveAttribute('href', 'https://www.youtube.com/@mkbhd/videos');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(stub.addCompetitor).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, 'https://youtu.be/AAAAAAAAAA1');
    expect(screen.getByRole('link', { name: /open this video on youtube/i })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=AAAAAAAAAA1'
    );
  });

  it('links each tracked competitor to its channel', async () => {
    const stub = new StubApi();
    stub.listCompetitors.mockResolvedValue({
      data: [{ id: 'comp_1', channelId: 'UCBJycsmduvYEL83R_U4JriQ', username: 'mkbhd', channelUrl: 'https://www.youtube.com/@mkbhd', displayName: 'Marques Brownlee', avatarUrl: '', addedAt: new Date().toISOString() }],
      error: null,
    });
    renderAt(stub, '/competitors', <CompetitorsPage />, '/competitors');

    const link = await screen.findByRole('link', { name: /channel on youtube/i });
    expect(link).toHaveAttribute('href', 'https://www.youtube.com/@mkbhd/videos');
    expect(screen.getByText(/@mkbhd · added/)).toBeInTheDocument();
  });

  it('previews the channel link in the add-competitor modal', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    renderAt(stub, '/competitors', <CompetitorsPage />, '/competitors');

    await user.click(await screen.findByRole('button', { name: /add competitor/i }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), '@vibecoder');
    expect(within(dialog).getByRole('link', { name: /open @vibecoder on youtube/i })).toHaveAttribute(
      'href',
      'https://www.youtube.com/@vibecoder/videos'
    );
  });

  it('links a sample video, which has no real page, to its channel', async () => {
    const stub = new StubApi();
    stub.listVideos.mockResolvedValue({ data: [video()], error: null });
    renderAt(stub, '/videos', <VideosPage />, '/videos');

    const links = await screen.findAllByRole('link', { name: /open @vibecoder on youtube/i });
    for (const link of links) expect(link).toHaveAttribute('href', 'https://www.youtube.com/@vibecoder/videos');
  });

  it('links a fetched video to its own page on YouTube', async () => {
    const stub = new StubApi();
    stub.listVideos.mockResolvedValue({
      data: [video({ competitorUsername: 'mkbhd', permalink: 'https://www.youtube.com/watch?v=AAAAAAAAAA1' })],
      error: null,
    });
    renderAt(stub, '/videos', <VideosPage />, '/videos');

    const links = await screen.findAllByRole('link', { name: /watch on youtube/i });
    for (const link of links) expect(link).toHaveAttribute('href', 'https://www.youtube.com/watch?v=AAAAAAAAAA1');
  });

  it('links a plan item to its video', async () => {
    const stub = new StubApi();
    stub.listContentPlan.mockResolvedValue({
      data: [planItem({ permalink: 'https://www.youtube.com/shorts/BBBBBBBBBB2' })],
      error: null,
    });
    renderAt(stub, '/content-plan', <ContentPlanPage />, '/content-plan');

    const links = await screen.findAllByRole('link', { name: /watch on youtube/i });
    expect(links[0]).toHaveAttribute('href', 'https://www.youtube.com/shorts/BBBBBBBBBB2');
  });
});

describe('Content plan: schedule and production checklist', () => {
  function today(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  it('each board card has the four-step checklist, and ticking a step saves it', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listContentPlan.mockResolvedValue({ data: [planItem({ recordingDone: true })], error: null });
    stub.updateContentPlanItem.mockResolvedValue({ data: planItem({ recordingDone: true, scriptDone: true }), error: null });
    renderAt(stub, '/content-plan', <ContentPlanPage />, '/content-plan');

    const checklist = await screen.findByRole('group', { name: /production checklist/i });
    expect(within(checklist).getByText('1/4')).toBeInTheDocument();
    expect(within(checklist).getByRole('checkbox', { name: 'Script completed' })).not.toBeChecked();
    expect(within(checklist).getByRole('checkbox', { name: 'Recording completed' })).toBeChecked();
    expect(within(checklist).getByRole('checkbox', { name: 'Caption prepared' })).not.toBeChecked();
    expect(within(checklist).getByRole('checkbox', { name: 'Published' })).not.toBeChecked();

    await user.click(within(checklist).getByRole('checkbox', { name: 'Script completed' }));
    expect(stub.updateContentPlanItem).toHaveBeenCalledWith('plan_1', { scriptDone: true });
    expect(await within(checklist).findByText('2/4')).toBeInTheDocument();
  });

  it('a failed save puts the checkbox back and shows the error', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listContentPlan.mockResolvedValue({ data: [planItem()], error: null });
    stub.updateContentPlanItem.mockResolvedValue({ data: null, error: 'Server is down' });
    renderAt(stub, '/content-plan', <ContentPlanPage />, '/content-plan');

    const box = await screen.findByRole('checkbox', { name: 'Caption prepared' });
    await user.click(box);
    expect(await screen.findByText('Server is down')).toBeInTheDocument();
    expect(box).not.toBeChecked();
  });

  it('setting a film date saves it', async () => {
    const stub = new StubApi();
    stub.listContentPlan.mockResolvedValue({ data: [planItem()], error: null });
    stub.updateContentPlanItem.mockResolvedValue({ data: planItem({ filmDate: '2026-11-10' }), error: null });
    renderAt(stub, '/content-plan', <ContentPlanPage />, '/content-plan');

    const input = await screen.findByLabelText(/film date for/i);
    fireEvent.change(input, { target: { value: '2026-11-10' } });
    expect(stub.updateContentPlanItem).toHaveBeenCalledWith('plan_1', { filmDate: '2026-11-10' });
  });

  it('the calendar shows film and publish days, and lists unscheduled videos', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listContentPlan.mockResolvedValue({
      data: [
        planItem({ filmDate: today(), publishDate: today(), scriptDone: true }),
        planItem({ id: 'plan_2', videoId: 'video_2', caption: 'Unscheduled idea' }),
      ],
      error: null,
    });
    renderAt(stub, '/content-plan', <ContentPlanPage />, '/content-plan');

    await user.click(await screen.findByRole('button', { name: 'Calendar' }));
    expect(screen.getByRole('grid', { name: /content calendar/i })).toBeInTheDocument();
    const film = screen.getByRole('button', { name: /^film: i let ai build my saas in 48 hours\. checklist 1 of 4/i });
    expect(screen.getByRole('button', { name: /^publish: i let ai build my saas/i })).toBeInTheDocument();

    const unscheduled = screen.getByRole('region', { name: /not scheduled yet/i });
    expect(within(unscheduled).getByText('Unscheduled idea')).toBeInTheDocument();

    await user.click(film);
    const panel = screen.getByRole('region', { name: /selected video/i });
    expect(within(panel).getByRole('checkbox', { name: 'Script completed' })).toBeChecked();
    expect(within(panel).getByLabelText(/film date for/i)).toHaveValue(today());
  });

  it('warns when publishing is set before filming', async () => {
    const stub = new StubApi();
    stub.listContentPlan.mockResolvedValue({ data: [planItem({ filmDate: '2026-11-10', publishDate: '2026-11-08' })], error: null });
    renderAt(stub, '/content-plan', <ContentPlanPage />, '/content-plan');
    expect(await screen.findByText(/publishing is set before filming/i)).toBeInTheDocument();
  });
});

describe('add-competitor modal after an error (found by e2e issue 53)', () => {
  it('clears the old error as soon as the input changes, so the preview link shows', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.addCompetitor.mockResolvedValue({ data: null, error: 'Please paste a YouTube channel link' });
    renderAt(stub, '/competitors', <CompetitorsPage />, '/competitors');

    await user.click(await screen.findByRole('button', { name: /add competitor/i }));
    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByRole('textbox');
    await user.type(input, 'https://twitter.com/x');
    await user.click(within(dialog).getByRole('button', { name: /add competitor/i }));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, '@vibecoder');
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /open @vibecoder on youtube/i })).toBeInTheDocument();
  });
});

describe('Remix editor sends only changed fields (#74)', () => {
  const loaded: RemixedVideo = {
    id: 'remix_1',
    videoId: 'video_1',
    title: 'Loaded title',
    hook: 'Loaded hook',
    script: 'Loaded script',
    cta: 'Loaded cta',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // updateRemix echoes the patch merged into the last saved remix, like the backend.
  function editorStub() {
    const stub = new StubApi();
    let saved = { ...loaded };
    stub.getRemix.mockResolvedValue({ data: loaded, error: null });
    stub.getVideo.mockResolvedValue({ data: video(), error: null });
    stub.updateRemix.mockImplementation(async (...args: unknown[]) => {
      const patch = args[1] as Partial<RemixedVideo>;
      saved = { ...saved, ...patch, updatedAt: new Date().toISOString() };
      return { data: saved, error: null };
    });
    return stub;
  }

  async function openEditor(stub: StubApi) {
    renderAt(stub, '/remix/remix_1', <RemixPage />, '/remix/:id');
    await screen.findByLabelText('Hook');
    return screen.getByRole('button', { name: /save changes/i });
  }

  function setField(label: string, value: string) {
    fireEvent.change(screen.getByLabelText(label, { selector: 'input, textarea' }), { target: { value } });
  }

  it('starts with Save disabled and the Created status', async () => {
    const stub = editorStub();
    const save = await openEditor(stub);
    expect(save).toBeDisabled();
    expect(screen.getByText(/^Created /)).toBeInTheDocument();
    expect(stub.updateRemix).not.toHaveBeenCalled();
  });

  it('sends only the hook when only the hook changed', async () => {
    const user = userEvent.setup();
    const stub = editorStub();
    const save = await openEditor(stub);
    setField('Hook', 'New hook');
    await user.click(save);
    await waitFor(() => expect(stub.updateRemix).toHaveBeenCalledTimes(1));
    expect(stub.updateRemix.mock.calls[0]).toEqual(['remix_1', { hook: 'New hook' }]);
    expect(await screen.findByText(/^Saved /)).toBeInTheDocument();
    expect(save).toBeDisabled();
    expect(screen.getByLabelText('Hook')).toHaveValue('New hook');
  });

  it('sends exactly the two changed fields', async () => {
    const user = userEvent.setup();
    const stub = editorStub();
    const save = await openEditor(stub);
    setField('Title', 'New title');
    setField('Call to action', 'New cta');
    await user.click(save);
    await waitFor(() => expect(stub.updateRemix).toHaveBeenCalledTimes(1));
    expect(stub.updateRemix.mock.calls[0]).toEqual(['remix_1', { title: 'New title', cta: 'New cta' }]);
  });

  it('sends all four fields when all four changed', async () => {
    const user = userEvent.setup();
    const stub = editorStub();
    const save = await openEditor(stub);
    setField('Title', 'T');
    setField('Hook', 'H');
    setField('Script', 'S');
    setField('Call to action', 'C');
    await user.click(save);
    await waitFor(() => expect(stub.updateRemix).toHaveBeenCalledTimes(1));
    expect(stub.updateRemix.mock.calls[0]).toEqual(['remix_1', { title: 'T', hook: 'H', script: 'S', cta: 'C' }]);
  });

  it('sends a field cleared to the empty string', async () => {
    const user = userEvent.setup();
    const stub = editorStub();
    const save = await openEditor(stub);
    setField('Call to action', '');
    expect(save).toBeEnabled();
    await user.click(save);
    await waitFor(() => expect(stub.updateRemix).toHaveBeenCalledTimes(1));
    expect(stub.updateRemix.mock.calls[0]).toEqual(['remix_1', { cta: '' }]);
    expect(screen.getByLabelText('Call to action')).toHaveValue('');
  });

  it('counts a whitespace-only change and sends it as typed', async () => {
    const user = userEvent.setup();
    const stub = editorStub();
    const save = await openEditor(stub);
    setField('Hook', 'Loaded hook ');
    await user.click(save);
    await waitFor(() => expect(stub.updateRemix).toHaveBeenCalledTimes(1));
    expect(stub.updateRemix.mock.calls[0]).toEqual(['remix_1', { hook: 'Loaded hook ' }]);
  });

  it('edit then revert disables Save, clears Unsaved changes and sends nothing', async () => {
    const user = userEvent.setup();
    const stub = editorStub();
    const save = await openEditor(stub);
    setField('Hook', 'Something else');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(save).toBeEnabled();
    setField('Hook', 'Loaded hook');
    expect(save).toBeDisabled();
    expect(screen.queryByText('Unsaved changes')).toBeNull();
    await user.click(save);
    expect(stub.updateRemix).not.toHaveBeenCalled();
  });

  it('drops a reverted field from the patch', async () => {
    const user = userEvent.setup();
    const stub = editorStub();
    const save = await openEditor(stub);
    setField('Hook', 'New hook');
    setField('Script', 'New script');
    setField('Script', 'Loaded script');
    await user.click(save);
    await waitFor(() => expect(stub.updateRemix).toHaveBeenCalledTimes(1));
    expect(stub.updateRemix.mock.calls[0]).toEqual(['remix_1', { hook: 'New hook' }]);
  });

  it('two saves in a row: the second call has only the second field', async () => {
    const user = userEvent.setup();
    const stub = editorStub();
    const save = await openEditor(stub);
    setField('Hook', 'New hook');
    await user.click(save);
    await waitFor(() => expect(save).toBeDisabled());
    setField('Title', 'New title');
    await user.click(save);
    await waitFor(() => expect(stub.updateRemix).toHaveBeenCalledTimes(2));
    expect(stub.updateRemix.mock.calls[1]).toEqual(['remix_1', { title: 'New title' }]);
  });

  it('compares against the last saved value, not the loaded one', async () => {
    const user = userEvent.setup();
    const stub = editorStub();
    const save = await openEditor(stub);
    setField('Hook', 'New hook');
    await user.click(save);
    await waitFor(() => expect(save).toBeDisabled());
    setField('Hook', 'Loaded hook');
    expect(save).toBeEnabled();
    await user.click(save);
    await waitFor(() => expect(stub.updateRemix).toHaveBeenCalledTimes(2));
    expect(stub.updateRemix.mock.calls[1]).toEqual(['remix_1', { hook: 'Loaded hook' }]);
  });

  it('keeps text typed while a save is in flight and marks it unsaved', async () => {
    const user = userEvent.setup();
    const stub = editorStub();
    let resolve: (v: ServiceResult<RemixedVideo>) => void = () => {};
    stub.updateRemix.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    const save = await openEditor(stub);
    setField('Hook', 'First');
    await user.click(save);
    expect(save).toBeDisabled();
    setField('Hook', 'First and more');
    resolve({ data: { ...loaded, hook: 'First', updatedAt: new Date().toISOString() }, error: null });
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeInTheDocument());
    expect(screen.getByLabelText('Hook')).toHaveValue('First and more');
    expect(save).toBeEnabled();
    await user.click(save);
    await waitFor(() => expect(stub.updateRemix).toHaveBeenCalledTimes(2));
    expect(stub.updateRemix.mock.calls[1]).toEqual(['remix_1', { hook: 'First and more' }]);
  });

  it('makes the applied template the baseline', async () => {
    const user = userEvent.setup();
    const stub = editorStub();
    stub.applyRemixTemplate.mockResolvedValue({
      data: { ...loaded, title: 'Tpl title', hook: 'Tpl hook', script: 'Tpl script', cta: 'Tpl cta', updatedAt: new Date().toISOString() },
      error: null,
    });
    const save = await openEditor(stub);
    await user.click(screen.getByRole('button', { name: 'Apply template' }));
    await waitFor(() => expect(screen.getByLabelText('Hook')).toHaveValue('Tpl hook'));
    expect(save).toBeDisabled();
    setField('Hook', 'Mine');
    await user.click(save);
    await waitFor(() => expect(stub.updateRemix).toHaveBeenCalledTimes(1));
    expect(stub.updateRemix.mock.calls[0]).toEqual(['remix_1', { hook: 'Mine' }]);
  });

  it('asks before applying a template only when fields changed', async () => {
    const user = userEvent.setup();
    const stub = editorStub();
    stub.applyRemixTemplate.mockResolvedValue({ data: loaded, error: null });
    await openEditor(stub);
    setField('Hook', 'Changed');
    await user.click(screen.getByRole('button', { name: 'Apply template' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Replace your edits?');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(stub.applyRemixTemplate).not.toHaveBeenCalled();

    setField('Hook', 'Loaded hook');
    await user.click(screen.getByRole('button', { name: 'Apply template' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(stub.applyRemixTemplate).toHaveBeenCalledTimes(1));
  });
});

describe('Remix editor keeps the editor when an action fails (#75)', () => {
  const loaded: RemixedVideo = {
    id: 'remix_1',
    videoId: 'video_1',
    title: 'Loaded title',
    hook: 'Loaded hook',
    script: 'Loaded script',
    cta: 'Loaded cta',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const unreachable = 'Could not reach the server. Check that the backend is running.';

  function editorStub() {
    const stub = new StubApi();
    stub.getRemix.mockResolvedValue({ data: loaded, error: null });
    stub.getVideo.mockResolvedValue({ data: video(), error: null });
    stub.updateRemix.mockResolvedValue({ data: null, error: unreachable });
    stub.applyRemixTemplate.mockResolvedValue({ data: null, error: unreachable });
    stub.addToContentPlan.mockResolvedValue({ data: null, error: unreachable });
    return stub;
  }

  async function openEditor(stub: StubApi) {
    renderAt(stub, '/remix/remix_1', <RemixPage />, '/remix/:id');
    await screen.findByLabelText('Hook');
    return screen.getByRole('button', { name: /save changes/i });
  }

  function field(label: string) {
    return screen.getByLabelText(label, { selector: 'input, textarea' });
  }

  function setField(label: string, value: string) {
    fireEvent.change(field(label), { target: { value } });
  }

  function editAll() {
    setField('Title', 'My title');
    setField('Hook', 'My hook');
    setField('Script', 'My script');
    setField('Call to action', 'My cta');
  }

  function expectMyText() {
    expect(field('Title')).toHaveValue('My title');
    expect(field('Hook')).toHaveValue('My hook');
    expect(field('Script')).toHaveValue('My script');
    expect(field('Call to action')).toHaveValue('My cta');
  }

  it('a failed save keeps the four fields, their text and the source video, and shows the error in an alert', async () => {
    const user = userEvent.setup();
    const stub = editorStub();
    const save = await openEditor(stub);
    editAll();
    await user.click(save);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(unreachable);
    expect(within(alert).getByText(unreachable)).toHaveClass('rounded-xl', 'text-danger');
    expectMyText();
    expect(screen.getByLabelText('Remix template')).toBeInTheDocument();
    expect(screen.getByText('I let AI build my SaaS in 48 hours')).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(screen.queryByText(/^Saved /)).toBeNull();
    expect(save).toBeEnabled();
    expect(save.querySelector('.animate-spin')).toBeNull();
  });

  it('shows "Remix not found." when the remix was deleted and keeps the editor', async () => {
    const user = userEvent.setup();
    const stub = editorStub();
    stub.updateRemix.mockResolvedValue({ data: null, error: 'Remix not found.' });
    const save = await openEditor(stub);
    editAll();
    await user.click(save);
    expect(await screen.findByRole('alert')).toHaveTextContent('Remix not found.');
    expectMyText();
    expect(screen.getByRole('link', { name: /back to videos/i })).toBeInTheDocument();
  });

  it('a retry sends the same changed fields, then shows Saved and clears the error', async () => {
    const user = userEvent.setup();
    const stub = editorStub();
    const save = await openEditor(stub);
    setField('Hook', 'My hook');
    setField('Call to action', 'My cta');
    await user.click(save);
    await screen.findByRole('alert');

    stub.updateRemix.mockResolvedValueOnce({
      data: { ...loaded, hook: 'My hook', cta: 'My cta', updatedAt: new Date().toISOString() },
      error: null,
    });
    await user.click(save);
    await waitFor(() => expect(stub.updateRemix).toHaveBeenCalledTimes(2));
    expect(stub.updateRemix.mock.calls[0]).toEqual(['remix_1', { hook: 'My hook', cta: 'My cta' }]);
    expect(stub.updateRemix.mock.calls[1]).toEqual(stub.updateRemix.mock.calls[0]);
    expect(await screen.findByText(/^Saved /)).toBeInTheDocument();
    expect(save).toBeDisabled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps text typed while the failing save was in flight and sends it next time', async () => {
    const user = userEvent.setup();
    const stub = editorStub();
    let resolve: (v: ServiceResult<RemixedVideo>) => void = () => {};
    stub.updateRemix.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    const save = await openEditor(stub);
    setField('Hook', 'First');
    await user.click(save);
    setField('Hook', 'First and more');
    resolve({ data: null, error: unreachable });
    expect(await screen.findByRole('alert')).toHaveTextContent(unreachable);
    expect(field('Hook')).toHaveValue('First and more');
    await user.click(save);
    await waitFor(() => expect(stub.updateRemix).toHaveBeenCalledTimes(2));
    expect(stub.updateRemix.mock.calls[1]).toEqual(['remix_1', { hook: 'First and more' }]);
  });

  it('a failed apply with no edits keeps the editor and the status line', async () => {
    const user = userEvent.setup();
    const stub = editorStub();
    const save = await openEditor(stub);
    expect(screen.getByText(/^Created /)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apply template' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(unreachable);
    expect(field('Hook')).toHaveValue('Loaded hook');
    expect(screen.getByText(/^Created /)).toBeInTheDocument();
    expect(save).toBeDisabled();
  });

  it('a failed apply after "Replace your edits?" keeps the user\'s text and asks again next time', async () => {
    const user = userEvent.setup();
    const stub = editorStub();
    const save = await openEditor(stub);
    editAll();
    await user.click(screen.getByRole('button', { name: 'Apply template' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Replace your edits?');
    await user.click(within(dialog).getByRole('button', { name: 'Apply template' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(unreachable);
    expect(screen.queryByRole('dialog')).toBeNull();
    expectMyText();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(save).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Apply template' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Replace your edits?');
  });

  it('a failed add to plan keeps the editor and the Add to plan button', async () => {
    const user = userEvent.setup();
    const stub = editorStub();
    await openEditor(stub);
    setField('Hook', 'My hook');
    await user.click(screen.getByRole('button', { name: 'Add to plan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(unreachable);
    expect(field('Hook')).toHaveValue('My hook');
    expect(screen.getByRole('button', { name: 'Add to plan' })).toBeInTheDocument();
    expect(screen.queryByText('In content plan')).toBeNull();
  });

  it('clears the error on the next edit', async () => {
    const user = userEvent.setup();
    const stub = editorStub();
    const save = await openEditor(stub);
    setField('Hook', 'My hook');
    await user.click(save);
    await screen.findByRole('alert');
    setField('Script', 'My script');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('clears the error when a later apply or add to plan succeeds', async () => {
    const user = userEvent.setup();
    const stub = editorStub();
    await openEditor(stub);
    await user.click(screen.getByRole('button', { name: 'Add to plan' }));
    await screen.findByRole('alert');
    stub.applyRemixTemplate.mockResolvedValueOnce({ data: { ...loaded, hook: 'Tpl hook' }, error: null });
    await user.click(screen.getByRole('button', { name: 'Apply template' }));
    await waitFor(() => expect(field('Hook')).toHaveValue('Tpl hook'));
    expect(screen.queryByRole('alert')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Apply template' }));
    await screen.findByRole('alert');
    stub.addToContentPlan.mockResolvedValueOnce({ data: planItem(), error: null });
    await user.click(screen.getByRole('button', { name: 'Add to plan' }));
    expect(await screen.findByText('In content plan')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows only one error at a time, the latest', async () => {
    const user = userEvent.setup();
    const stub = editorStub();
    await openEditor(stub);
    await user.click(screen.getByRole('button', { name: 'Apply template' }));
    await screen.findByRole('alert');
    stub.addToContentPlan.mockResolvedValueOnce({ data: null, error: 'Request failed (418).' });
    await user.click(screen.getByRole('button', { name: 'Add to plan' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Request failed (418).'));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('a failed load still shows only the back link and the full-page error', async () => {
    const stub = new StubApi();
    stub.getRemix.mockResolvedValue({ data: null, error: 'Remix not found.' });
    renderAt(stub, '/remix/does-not-exist', <RemixPage />, '/remix/:id');
    expect(await screen.findByText('Remix not found.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to videos/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('Hook')).toBeNull();
    expect(screen.queryByRole('button', { name: /save changes/i })).toBeNull();
  });
});
