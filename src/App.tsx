import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ApiProvider } from '@/services';
import { Layout } from '@/components/Layout';
import { DashboardPage } from '@/pages/DashboardPage';
import { CompetitorsPage } from '@/pages/CompetitorsPage';
import { RemixPage } from '@/pages/RemixPage';

export default function App() {
  return (
    <ApiProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="/competitors" element={<CompetitorsPage />} />
            <Route path="/remix/:id" element={<RemixPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ApiProvider>
  );
}
