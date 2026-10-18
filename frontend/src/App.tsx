import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ApiProvider } from '@/services';
import { Layout } from '@/components/Layout';
import { DashboardPage } from '@/pages/DashboardPage';
import { ReelsPage } from '@/pages/ReelsPage';
import { CompetitorsPage } from '@/pages/CompetitorsPage';
import { RemixesPage } from '@/pages/RemixesPage';
import { RemixPage } from '@/pages/RemixPage';
import { ContentPlanPage } from '@/pages/ContentPlanPage';

export default function App() {
  return (
    <ApiProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="/reels" element={<ReelsPage />} />
            <Route path="/competitors" element={<CompetitorsPage />} />
            <Route path="/remixes" element={<RemixesPage />} />
            <Route path="/remix/:id" element={<RemixPage />} />
            <Route path="/content-plan" element={<ContentPlanPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ApiProvider>
  );
}
