import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { VideosApi } from '@/types';
import { HttpVideosApi } from './HttpVideosApi';
import { MockVideosApi } from './MockVideosApi';

// Set VITE_USE_MOCK=true to build a demo with no backend (see the Pages workflow).
export const USING_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

// Central service registry. The app talks only to `useApi()`, never to a
// concrete implementation. Production uses the real backend; tests inject a
// stub or the mock via the `api` prop.
const ApiContext = createContext<VideosApi | null>(null);

export function ApiProvider({
  children,
  api: injected,
}: {
  children: ReactNode;
  api?: VideosApi;
}) {
  const api = useMemo(
    () => injected ?? (USING_MOCK ? new MockVideosApi() : new HttpVideosApi()),
    [injected]
  );
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): VideosApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside an <ApiProvider>');
  return api;
}
