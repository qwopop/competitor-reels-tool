import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
