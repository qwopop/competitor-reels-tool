import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ApiProvider } from '@/services';
import { Layout } from '@/components/Layout';
import { DashboardPage } from '@/pages/DashboardPage';
import { VideosPage } from '@/pages/VideosPage';
import { CompetitorsPage } from '@/pages/CompetitorsPage';
import { RemixesPage } from '@/pages/RemixesPage';
import { RemixPage } from '@/pages/RemixPage';
import { ContentPlanPage } from '@/pages/ContentPlanPage';
import { VideosLinkPage } from '@/pages/VideosLinkPage';

export default function App() {
  return (
    <ApiProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="/videos" element={<VideosPage />} />
            <Route path="/competitors" element={<CompetitorsPage />} />
            <Route path="/remixes" element={<RemixesPage />} />
            <Route path="/remix/:id" element={<RemixPage />} />
            <Route path="/content-plan" element={<ContentPlanPage />} />
            <Route path="/go-to-videos" element={<VideosLinkPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ApiProvider>
  );
}
