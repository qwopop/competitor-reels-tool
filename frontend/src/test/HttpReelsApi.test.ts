import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpReelsApi } from '@/services/HttpReelsApi';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('HttpReelsApi', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists competitors from GET /api/competitors', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, [{ id: 'comp_1' }]));
    const res = await new HttpReelsApi().listCompetitors();
    expect(fetchMock).toHaveBeenCalledWith('/api/competitors', {
      method: 'GET',
      headers: undefined,
      body: undefined,
    });
    expect(res).toEqual({ data: [{ id: 'comp_1' }], error: null });
  });

  it('posts the Instagram URL as JSON when adding a competitor', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 'comp_1' }));
    await new HttpReelsApi().addCompetitor('https://instagram.com/vibecoder');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/competitors');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ instagramUrl: 'https://instagram.com/vibecoder' });
  });

  it('surfaces the backend detail message as the error', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { detail: 'Please paste a valid Instagram profile URL' })
    );
    const res = await new HttpReelsApi().addCompetitor('https://twitter.com/x');
    expect(res.data).toBeNull();
    expect(res.error).toMatch(/valid Instagram/);
  });

  it('handles 204 responses with no body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(204, undefined));
    const res = await new HttpReelsApi().removeCompetitor('comp_1');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/competitors/comp_1');
    expect(res).toEqual({ data: null, error: null });
  });

  it('reports a friendly error when the backend is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const res = await new HttpReelsApi().listReels();
    expect(res.data).toBeNull();
    expect(res.error).toMatch(/Could not reach the server/);
  });

  it('sends PATCH with only the changed fields', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'remix_1' }));
    await new HttpReelsApi().updateRemix('remix_1', { hook: 'New hook' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/remixes/remix_1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ hook: 'New hook' });
  });
});
