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

// A stub service whose returns we control per-test. This keeps component tests
// deterministic and fast, and proves the UI only depends on the ReelsApi
// interface.
class StubApi implements Partial<ReelsApi> {
  listReels = vi.fn(async (): Promise<ServiceResult<Reel[]>> => ({
    data: [],
    error: null,
  }));
  listCompetitors = vi.fn(async (): Promise<ServiceResult<Competitor[]>> => ({
    data: [],
    error: null,
  }));
  addCompetitor = vi.fn(async (): Promise<ServiceResult<Competitor>> => ({
    data: null,
    error: 'Invalid',
  }));
  fetchReelsForCompetitor = vi.fn(async (): Promise<ServiceResult<Reel[]>> => ({
    data: [],
    error: null,
  }));
  removeCompetitor = vi.fn(async (): Promise<ServiceResult<void>> => ({
    data: undefined,
    error: null,
  }));
  remixReel = vi.fn(async (): Promise<ServiceResult<RemixedReel>> => ({
    data: null,
    error: 'nope',
  }));
  getReel = vi.fn(async (): Promise<ServiceResult<Reel>> => ({
    data: null,
    error: 'nope',
  }));
  getRemix = vi.fn(async (): Promise<ServiceResult<RemixedReel>> => ({
    data: null,
    error: 'nope',
  }));
  updateRemix = vi.fn(async (): Promise<ServiceResult<RemixedReel>> => ({
    data: null,
    error: 'nope',
  }));
  listContentPlan = vi.fn(async (): Promise<ServiceResult<ContentPlanItem[]>> => ({
    data: [],
    error: null,
  }));
  addToContentPlan = vi.fn(async (): Promise<ServiceResult<ContentPlanItem>> => ({
    data: null,
    error: 'nope',
  }));
  updateContentPlanStatus = vi.fn(async (): Promise<ServiceResult<ContentPlanItem>> => ({
    data: null,
    error: 'nope',
  }));
  removeFromContentPlan = vi.fn(async (): Promise<ServiceResult<void>> => ({
    data: undefined,
    error: null,
  }));
}

import { ApiProvider } from '@/services/ApiContext';
import { DashboardPage } from '@/pages/DashboardPage';
import { CompetitorsPage } from '@/pages/CompetitorsPage';
import { ContentPlanPage } from '@/pages/ContentPlanPage';

function reel(overrides: Partial<Reel> = {}): Reel {
  return {
    id: 'reel_1',
    competitorId: 'comp_1',
    competitorUsername: 'vibecoder',
    shortcode: 'ABC123',
    permalink: 'https://instagram.com/reel/ABC123/',
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

function renderWithRouter(stub: StubApi, initial = '/') {
  return render(
    <ApiProvider api={stub as unknown as ReelsApi}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route index element={<DashboardPage />} />
          <Route path="/competitors" element={<CompetitorsPage />} />
          <Route path="/content-plan" element={<ContentPlanPage />} />
        </Routes>
      </MemoryRouter>
    </ApiProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DashboardPage', () => {
  it('shows the empty state when there are no reels', async () => {
    const stub = new StubApi();
    stub.listReels.mockResolvedValue({ data: [], error: null });
    renderWithRouter(stub);

    await waitFor(() =>
      expect(screen.getByText(/no reels yet/i)).toBeInTheDocument()
    );
  });

  it('renders reels and a Remix button for each', async () => {
    const stub = new StubApi();
    stub.listReels.mockResolvedValue({
      data: [reel(), reel({ id: 'reel_2', caption: 'Second reel' })],
      error: null,
    });
    renderWithRouter(stub);

    await waitFor(() =>
      expect(screen.getByText(/I let AI build my SaaS/)).toBeInTheDocument()
    );
    expect(screen.getByText('Second reel')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /remix/i })).toHaveLength(2);
  });

  it('triggers remixReel and shows a remixing state', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listReels.mockResolvedValue({ data: [reel()], error: null });
    // Hold the remix promise so we can observe the loading state.
    let resolveRemix!: (v: ServiceResult<RemixedReel>) => void;
    stub.remixReel.mockImplementation(
      () =>
        new Promise<ServiceResult<RemixedReel>>((resolve) => {
          resolveRemix = resolve;
        })
    );

    renderWithRouter(stub);
    await waitFor(() =>
      expect(screen.getByText(/I let AI build my SaaS/)).toBeInTheDocument()
    );

    const remixButton = screen.getByRole('button', { name: /remix/i });
    await user.click(remixButton);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /remixing/i })).toBeDisabled()
    );
    expect(stub.remixReel).toHaveBeenCalledWith('reel_1');

    resolveRemix({
      data: {
        id: 'remix_1',
        reelId: 'reel_1',
        title: 'Remix: x',
        hook: 'h',
        script: 's',
        cta: 'c',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      error: null,
    });
  });

  it('surfaces an error from listReels', async () => {
    const stub = new StubApi();
    stub.listReels.mockResolvedValue({ data: null, error: 'Boom' });
    renderWithRouter(stub);

    await waitFor(() =>
      expect(screen.getByText(/boom/i)).toBeInTheDocument()
    );
  });
});

describe('CompetitorsPage', () => {
  it('shows the empty state when there are no competitors', async () => {
    const stub = new StubApi();
    stub.listCompetitors.mockResolvedValue({ data: [], error: null });
    renderWithRouter(stub, '/competitors');

    await waitFor(() =>
      expect(screen.getByText(/no competitors yet/i)).toBeInTheDocument()
    );
  });

  it('adds a competitor from a pasted URL', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listCompetitors.mockResolvedValue({ data: [], error: null });
    stub.addCompetitor.mockResolvedValue({
      data: {
        id: 'comp_1',
        username: 'vibecoder',
        instagramUrl: 'https://instagram.com/vibecoder',
        displayName: 'Vibecoder',
        avatarUrl: 'https://example.com/a.jpg',
        addedAt: new Date().toISOString(),
      },
      error: null,
    });
    // After adding, listCompetitors returns the new list.
    stub.listCompetitors
      .mockResolvedValueOnce({ data: [], error: null }) // initial load
      .mockResolvedValueOnce({
        data: [
          {
            id: 'comp_1',
            username: 'vibecoder',
            instagramUrl: 'https://instagram.com/vibecoder',
            displayName: 'Vibecoder',
            avatarUrl: 'https://example.com/a.jpg',
            addedAt: new Date().toISOString(),
          },
        ],
        error: null,
      });
    renderWithRouter(stub, '/competitors');

    const input = await screen.findByPlaceholderText(/instagram\.com\/vibecoder/i);
    await user.type(input, 'https://instagram.com/vibecoder');
    await user.click(screen.getByRole('button', { name: /add competitor/i }));

    await waitFor(() => expect(stub.addCompetitor).toHaveBeenCalled());
    expect(stub.addCompetitor).toHaveBeenCalledWith(
      'https://instagram.com/vibecoder'
    );
  });

  it('fetches reels when the Fetch button is clicked', async () => {
    const user = userEvent.setup();
    const competitor: Competitor = {
      id: 'comp_1',
      username: 'vibecoder',
      instagramUrl: 'https://instagram.com/vibecoder',
      displayName: 'Vibecoder',
      avatarUrl: 'https://example.com/a.jpg',
      addedAt: new Date().toISOString(),
    };
    const stub = new StubApi();
    stub.listCompetitors.mockResolvedValue({ data: [competitor], error: null });
    stub.listReels.mockResolvedValue({
      data: [reel()],
      error: null,
    });
    stub.fetchReelsForCompetitor.mockResolvedValue({
      data: [reel()],
      error: null,
    });

    renderWithRouter(stub, '/competitors');

    const fetchBtn = await screen.findByRole('button', { name: /fetch reels/i });
    await user.click(fetchBtn);

    await waitFor(() =>
      expect(stub.fetchReelsForCompetitor).toHaveBeenCalledWith('comp_1')
    );
    // Success confirmation appears.
    await waitFor(() =>
      expect(screen.getByText(/pulled 20 reels/i)).toBeInTheDocument()
    );
  });

  it('surfaces an add error in the banner', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listCompetitors.mockResolvedValue({ data: [], error: null });
    stub.addCompetitor.mockResolvedValue({
      data: null,
      error: 'That is not a valid Instagram URL.',
    });
    renderWithRouter(stub, '/competitors');

    const input = await screen.findByPlaceholderText(/instagram\.com\/vibecoder/i);
    await user.type(input, 'garbage');
    await user.click(screen.getByRole('button', { name: /add competitor/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/that is not a valid instagram url/i)
      ).toBeInTheDocument()
    );
  });
});

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

describe('Content plan', () => {
  it('adds a Reel to the plan from the Reels grid', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listReels.mockResolvedValue({ data: [reel()], error: null });
    stub.addToContentPlan.mockResolvedValue({
      data: planItem(),
      error: null,
    });
    renderWithRouter(stub);

    await user.click(await screen.findByRole('button', { name: /add to plan/i }));

    expect(stub.addToContentPlan).toHaveBeenCalledWith('reel_1');
    await waitFor(() =>
      expect(screen.getByText(/in content plan/i)).toBeInTheDocument()
    );
  });

  it('shows Reels already in the plan as in the plan', async () => {
    const stub = new StubApi();
    stub.listReels.mockResolvedValue({ data: [reel()], error: null });
    stub.listContentPlan.mockResolvedValue({
      data: [planItem({ status: 'ready' })],
      error: null,
    });
    renderWithRouter(stub);

    expect(await screen.findByText(/in content plan/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add to plan/i })).toBeNull();
  });

  it('changes an item status from the plan page', async () => {
    const user = userEvent.setup();
    const stub = new StubApi();
    stub.listContentPlan.mockResolvedValue({ data: [planItem()], error: null });
    stub.updateContentPlanStatus.mockResolvedValue({
      data: planItem({ status: 'ready' }),
      error: null,
    });
    render(
      <ApiProvider api={stub as unknown as ReelsApi}>
        <MemoryRouter initialEntries={['/content-plan']}>
          <Routes>
            <Route path="/content-plan" element={<ContentPlanPage />} />
          </Routes>
        </MemoryRouter>
      </ApiProvider>
    );

    const group = await screen.findByRole('group', { name: /status for/i });
    await user.click(within(group).getByRole('button', { name: /ready to film/i }));

    expect(stub.updateContentPlanStatus).toHaveBeenCalledWith('plan_1', 'ready');
    await waitFor(() =>
      expect(
        within(group).getByRole('button', { name: /ready to film/i })
      ).toHaveAttribute('aria-pressed', 'true')
    );
  });

  it('shows the empty state when nothing is planned', async () => {
    const stub = new StubApi();
    render(
      <ApiProvider api={stub as unknown as ReelsApi}>
        <MemoryRouter initialEntries={['/content-plan']}>
          <Routes>
            <Route path="/content-plan" element={<ContentPlanPage />} />
          </Routes>
        </MemoryRouter>
      </ApiProvider>
    );
    expect(await screen.findByText(/nothing planned yet/i)).toBeInTheDocument();
  });
})
