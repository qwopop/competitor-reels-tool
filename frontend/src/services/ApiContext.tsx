import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { ReelsApi } from '@/types';
import { HttpReelsApi } from './HttpReelsApi';
import { MockReelsApi } from './MockReelsApi';

// Set VITE_USE_MOCK=true to build a demo with no backend (see the Pages workflow).
export const USING_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

// Central service registry. The app talks only to `useApi()`, never to a
// concrete implementation. Production uses the real backend; tests inject a
// stub or the mock via the `api` prop.
const ApiContext = createContext<ReelsApi | null>(null);

export function ApiProvider({
  children,
  api: injected,
}: {
  children: ReactNode;
  api?: ReelsApi;
}) {
  const api = useMemo(
    () => injected ?? (USING_MOCK ? new MockReelsApi() : new HttpReelsApi()),
    [injected]
  );
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): ReelsApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside an <ApiProvider>');
  return api;
}
