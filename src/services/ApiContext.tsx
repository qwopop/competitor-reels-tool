import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { ReelsApi } from '@/types';
import { MockReelsApi } from './MockReelsApi';

// Central service registry. The app talks only to `useApi()`, never to a
// concrete implementation, so swapping the mock for a real backend is a
// one-line change here (or inject one via the `api` prop in tests).
const ApiContext = createContext<ReelsApi | null>(null);

export function ApiProvider({
  children,
  api: injected,
}: {
  children: ReactNode;
  api?: ReelsApi;
}) {
  const api = useMemo(() => injected ?? new MockReelsApi(), [injected]);
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): ReelsApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside an <ApiProvider>');
  return api;
}
