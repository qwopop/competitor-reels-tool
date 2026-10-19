import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type {
  ReelsApi,
  Reel,
  Competitor,
  ContentPlanItem,
  RemixedReel,
  ServiceResult,
} from '@/types';
import { ApiProvider } from '@/services/ApiContext';
import { DashboardPage } from '@/pages/DashboardPage';
import { ReelsPage } from '@/pages/ReelsPage';
import { CompetitorsPage } from '@/pages/CompetitorsPage';
import { RemixesPage } from '@/pages/RemixesPage';
import { ContentPlanPage } from '@/pages/ContentPlanPage';
import { RemixPage } from '@/pages/RemixPage';

// A stub service whose returns we control per test. Pages depend only on ReelsApi.
class StubApi implements Partial<ReelsApi> {
  listReels = vi.fn(async (): Promise<ServiceResult<Reel[]>> => ({ data: [], error: null }));
  listCompetitors = vi.fn(async (): Promise<ServiceResult<Competitor[]>> => ({ data: [], error: null }));
  addCompetitor = vi.fn(async (): Promise<ServiceResult<Competitor>> => ({ data: null, error: 'Invalid' }));
  fetchReelsForCompetitor = vi.fn(async (): Promise<ServiceResult<Reel[]>> => ({ data: [], error: null }));
  removeCompetitor = vi.fn(async (): Promise<ServiceResult<void>> => ({ data: null, error: null }));
  remixReel = vi.fn(async (): Promise<ServiceResult<RemixedReel>> => ({ data: null, error: 'nope' }));
  getReel = vi.fn(async (): Promise<ServiceResult<Reel>> => ({ data: null, error: 'nope' }));
  getRemix = vi.fn(async (): Promise<ServiceResult<RemixedReel>> => ({ data: null, error: 'nope' }));
  updateRemix = vi.fn(async (): Promise<ServiceResult<RemixedReel>> => ({ data: null, error: 'nope' }));
  listRemixes = vi.fn(async (): Promise<ServiceResult<RemixedReel[]>> => ({ data: [], error: null }));
  getRemixForReel = vi.fn(async (): Promise<ServiceResult<RemixedReel>> => ({ data: null, error: 'none' }));
  applyRemixTemplate = vi.fn(async (): Promise<ServiceResult<RemixedReel>> => ({ data: null, error: 'nope' }));
  listContentPlan = vi.fn(async (): Promise<ServiceResult<ContentPlanItem[]>> => ({ data: [], error: null }));
  addToContentPlan = vi.fn(async (): Promise<ServiceResult<ContentPlanItem>> => ({ data: null, error: 'nope' }));
  updateContentPlanStatus = vi.fn(async (): Promise<ServiceResult<ContentPlanItem>> => ({ data: null, error: 'nope' }));
  removeFromContentPlan = vi.fn(async (): Promise<ServiceResult<void>> => ({ data: undefined, error: null }));
}

function reel(overrides: Partial<Reel> = {}): Reel {
  return {
    id: 'reel_1',
    competitorId: 'comp_1',
    competitorUsername: 'vibecoder',
    shortcode: 'ABC123',
    permalink: 'https://instagram.com/vibecoder/',
    caption: 'I let AI build my SaaS in 48 hours',
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
    reelId: 'reel_1',
    status: 'not_started',
    competitorUsername: 'vibecoder',
    caption: 'I let AI build my SaaS in 48 hours',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    permalink: 'https://instagram.com/vibecoder/',
    postedAt: new Date(Date.now() - 86_400_000).toISOString(),
    addedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderAt(stub: StubApi, path: string, element: React.ReactElement, route: string) {
  return render(
    <ApiProvider api={stub as unknown as ReelsApi}>
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
    expect(screen.getByLabelText(/instagram profile link/i)).toBeInTheDocument();
    await waitFor(() => expect(stub.listCompetitors).toHaveBeenCalled());
  });

  it('adds a competitor and fetches its Reels in one step', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.addCompetitor.mockResolvedValue({
      data: { id: 'comp_1', username: 'vibecoder', instagramUrl: '', displayName: 'Vibecoder', avatarUrl: '', addedAt: '' },
      error: null,
    });
    stub.fetchReelsForCompetitor.mockResolvedValue({ data: [reel(), reel({ id: 'reel_2' })], error: null });
    renderAt(stub, '/', <DashboardPage />, '/');

    await user.type(screen.getByLabelText(/instagram profile link/i), '@vibecoder');
    await user.click(screen.getByRole('button', { name: /track & fetch/i }));

    expect(stub.addCompetitor).toHaveBeenCalledWith('@vibecoder');
    await waitFor(() => expect(stub.fetchReelsForCompetitor).toHaveBeenCalledWith('comp_1'));
    expect(await screen.findByText('Pulled 2 Reels from @vibecoder.')).toBeInTheDocument();
  });

  it('shows the validation error and does not fetch when the link is invalid', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.addCompetitor.mockResolvedValue({ data: null, error: 'That is not a valid Instagram URL' });
    renderAt(stub, '/', <DashboardPage />, '/');

    await user.type(screen.getByLabelText(/instagram profile link/i), 'https://twitter.com/x');
    await user.click(screen.getByRole('button', { name: /track & fetch/i }));

    expect(await screen.findByText(/not a valid instagram url/i)).toBeInTheDocument();
    expect(stub.fetchReelsForCompetitor).not.toHaveBeenCalled();
  });

  it('shows totals, the top Reel and the most-viewed competitor', async () => {
    const stub = new StubApi();
    stub.listCompetitors.mockResolvedValue({
      data: [{ id: 'comp_1', username: 'vibecoder', instagramUrl: '', displayName: 'Vibecoder', avatarUrl: '', addedAt: '' }],
      error: null,
    });
    stub.listReels.mockResolvedValue({
      data: [reel({ viewCount: 500 }), reel({ id: 'reel_2', caption: 'Top one', viewCount: 9000 })],
      error: null,
    });
    stub.listContentPlan.mockResolvedValue({ data: [planItem({ status: 'filmed' })], error: null });
    renderAt(stub, '/', <DashboardPage />, '/');

    const totals = await screen.findByRole('region', { name: /totals/i });
    expect(within(totals).getByText('Reels').previousSibling).toHaveTextContent('2');
    expect((await screen.findAllByText('Top one')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/@vibecoder/).length).toBeGreaterThan(0);
  });
});

describe('ReelsPage', () => {
  it('shows the empty state when there are no reels', async () => {
    const stub = new StubApi();
    renderAt(stub, '/reels', <ReelsPage />, '/reels');
    expect(await screen.findByText(/no reels yet/i)).toBeInTheDocument();
  });

  it('renders reels with a Remix button for each', async () => {
    const stub = new StubApi();
    stub.listReels.mockResolvedValue({
      data: [reel(), reel({ id: 'reel_2', caption: 'Second reel' })],
      error: null,
    });
    renderAt(stub, '/reels', <ReelsPage />, '/reels');
    expect(await screen.findByText(/I let AI build my SaaS/)).toBeInTheDocument();
    expect(screen.getByText('Second reel')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^remix$/i })).toHaveLength(2);
  });

  it('filters by caption search and sorts by views', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listReels.mockResolvedValue({
      data: [
        reel({ id: 'a', caption: 'Prompt tips', viewCount: 10 }),
        reel({ id: 'b', caption: 'SaaS build', viewCount: 900 }),
      ],
      error: null,
    });
    renderAt(stub, '/reels', <ReelsPage />, '/reels');
    await screen.findByText('Prompt tips');

    await user.type(screen.getByLabelText(/search captions/i), 'saas');
    expect(screen.queryByText('Prompt tips')).toBeNull();
    expect(screen.getByText('SaaS build')).toBeInTheDocument();
  });

  it('switches to the list layout', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listReels.mockResolvedValue({ data: [reel()], error: null });
    renderAt(stub, '/reels', <ReelsPage />, '/reels');
    await screen.findByText(/I let AI build my SaaS/);
    await user.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('adds a Reel to the plan and shows a success message', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listReels.mockResolvedValue({ data: [reel()], error: null });
    stub.addToContentPlan.mockResolvedValue({ data: planItem(), error: null });
    renderAt(stub, '/reels', <ReelsPage />, '/reels');

    await user.click(await screen.findByRole('button', { name: /add to plan/i }));

    expect(stub.addToContentPlan).toHaveBeenCalledWith('reel_1');
    expect(await screen.findByText('Added to your Content Plan.')).toBeInTheDocument();
    expect(screen.getByText(/in content plan/i)).toBeInTheDocument();
  });

  it('says so when the Reel is already in the plan', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listReels.mockResolvedValue({ data: [reel()], error: null });
    stub.listContentPlan.mockResolvedValue({ data: [planItem({ status: 'ready' })], error: null });
    renderAt(stub, '/reels', <ReelsPage />, '/reels');
    expect(await screen.findByText(/in content plan/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add to plan/i })).toBeNull();
  });

  it('opens a preview of an existing remix', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listReels.mockResolvedValue({ data: [reel()], error: null });
    stub.listRemixes.mockResolvedValue({
      data: [{ id: 'remix_1', reelId: 'reel_1', title: 'Remix: SaaS', hook: 'Hook text', script: 's', cta: 'c', createdAt: '', updatedAt: '' }],
      error: null,
    });
    renderAt(stub, '/reels', <ReelsPage />, '/reels');
    await user.click(await screen.findByRole('button', { name: 'Preview' }));
    expect(await screen.findByRole('complementary', { name: /remix preview/i })).toHaveTextContent('Hook text');
  });
});

describe('CompetitorsPage', () => {
  it('adds a competitor from the modal', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.addCompetitor.mockResolvedValue({
      data: { id: 'comp_1', username: 'vibecoder', instagramUrl: '', displayName: 'Vibecoder', avatarUrl: '', addedAt: '' },
      error: null,
    });
    renderAt(stub, '/competitors', <CompetitorsPage />, '/competitors');

    await user.click(await screen.findByRole('button', { name: /add competitor/i }));
    const dialog = screen.getByRole('dialog', { name: /add a competitor/i });
    await user.type(within(dialog).getByPlaceholderText(/instagram\.com\/vibecoder/i), 'https://instagram.com/vibecoder');
    await user.click(within(dialog).getByRole('button', { name: /add competitor/i }));

    await waitFor(() => expect(stub.addCompetitor).toHaveBeenCalledWith('https://instagram.com/vibecoder'));
  });

  it('shows a validation error inside the modal', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.addCompetitor.mockResolvedValue({ data: null, error: 'That is not a valid Instagram URL' });
    renderAt(stub, '/competitors', <CompetitorsPage />, '/competitors');

    await user.click(await screen.findByRole('button', { name: /add competitor/i }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), 'https://twitter.com/x');
    await user.click(within(dialog).getByRole('button', { name: /add competitor/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/not a valid instagram url/i);
  });

  it('asks for confirmation before removing a competitor', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listCompetitors.mockResolvedValue({
      data: [{ id: 'comp_1', username: 'vibecoder', instagramUrl: '', displayName: 'Vibecoder', avatarUrl: '', addedAt: new Date().toISOString() }],
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
  it('"Back to reels" on the remix page goes to /reels', async () => {
    const stub = new StubApi();
    stub.getRemix.mockResolvedValue({
      data: { id: 'remix_1', reelId: 'reel_1', title: 'Remix: x', hook: 'h', script: 's', cta: 'c', createdAt: '', updatedAt: '' },
      error: null,
    });
    stub.getReel.mockResolvedValue({ data: reel(), error: null });
    renderAt(stub, '/remix/remix_1', <RemixPage />, '/remix/:id');
    const link = await screen.findByRole('link', { name: /back to reels/i });
    expect(link).toHaveAttribute('href', '/reels');
  });

  it('Escape closes the remix preview and focus goes back to Preview', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listReels.mockResolvedValue({ data: [reel()], error: null });
    stub.listRemixes.mockResolvedValue({
      data: [{ id: 'remix_1', reelId: 'reel_1', title: 'Remix: SaaS', hook: 'Hook text', script: 's', cta: 'c', createdAt: '', updatedAt: '' }],
      error: null,
    });
    renderAt(stub, '/reels', <ReelsPage />, '/reels');
    await user.click(await screen.findByRole('button', { name: 'Preview' }));
    expect(await screen.findByRole('complementary', { name: /remix preview/i })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('complementary', { name: /remix preview/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Preview' })).toHaveFocus();
  });

  it('offers Clear filters when nothing matches and restores every Reel', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listReels.mockResolvedValue({
      data: [reel({ id: 'a', caption: 'Prompt tips' }), reel({ id: 'b', caption: 'SaaS build' })],
      error: null,
    });
    renderAt(stub, '/reels', <ReelsPage />, '/reels');
    await screen.findByText('Prompt tips');

    await user.type(screen.getByLabelText(/search captions/i), 'zzzzzz');
    expect(screen.getByText('No Reels match these filters.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(screen.getByText('Prompt tips')).toBeInTheDocument();
    expect(screen.getByText('SaaS build')).toBeInTheDocument();
    expect(screen.getByLabelText(/search captions/i)).toHaveValue('');
  });

  it('says "1 competitor" for a single competitor on the dashboard', async () => {
    const stub = new StubApi();
    stub.listCompetitors.mockResolvedValue({
      data: [{ id: 'comp_1', username: 'vibecoder', instagramUrl: '', displayName: 'Vibecoder', avatarUrl: '', addedAt: '' }],
      error: null,
    });
    stub.listReels.mockResolvedValue({ data: [reel()], error: null });
    renderAt(stub, '/', <DashboardPage />, '/');
    expect(await screen.findByText(/Tracking 1 competitor · 1 Reel/)).toBeInTheDocument();
    expect(screen.queryByText(/1 competitors/)).toBeNull();
  });

  it('explains plainly when a planned Reel has been removed from the library', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listContentPlan.mockResolvedValue({ data: [planItem()], error: null });
    stub.remixReel.mockResolvedValue({ data: null, error: 'Reel not found.' });
    renderAt(stub, '/content-plan', <ContentPlanPage />, '/content-plan');

    await user.click(await screen.findByRole('button', { name: 'Create breakdown' }));

    expect(await screen.findByText(/no longer in your library/i)).toBeInTheDocument();
    expect(screen.queryByText('Reel not found.')).toBeNull();
  });

  it('limits the remix editor fields to what the database stores', async () => {
    const stub = new StubApi();
    stub.getRemix.mockResolvedValue({
      data: { id: 'remix_1', reelId: 'reel_1', title: 't', hook: 'h', script: 's', cta: 'c', createdAt: '', updatedAt: '' },
      error: null,
    });
    stub.getReel.mockResolvedValue({ data: reel(), error: null });
    renderAt(stub, '/remix/remix_1', <RemixPage />, '/remix/:id');
    expect(await screen.findByLabelText('Title')).toHaveAttribute('maxlength', '500');
    expect(screen.getByLabelText('Hook')).toHaveAttribute('maxlength', '1000');
    expect(screen.getByLabelText('Script')).toHaveAttribute('maxlength', '2000');
    expect(screen.getByLabelText('Call to action')).toHaveAttribute('maxlength', '500');
  });
});
