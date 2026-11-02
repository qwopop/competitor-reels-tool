import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { ApiProvider } from '@/services';
import { Layout } from '@/components/Layout';
import { DashboardPage } from '@/pages/DashboardPage';
import { VideosPage } from '@/pages/VideosPage';
import { CompetitorsPage } from '@/pages/CompetitorsPage';
import { RemixesPage } from '@/pages/RemixesPage';
import { RemixPage } from '@/pages/RemixPage';
import { ContentPlanPage } from '@/pages/ContentPlanPage';
import { VideosLinkPage } from '@/pages/VideosLinkPage';

// A data router, so pages can use useBlocker (the remix editor warns before
// leaving with unsaved changes).
const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: '/videos', element: <VideosPage /> },
      { path: '/competitors', element: <CompetitorsPage /> },
      { path: '/remixes', element: <RemixesPage /> },
      { path: '/remix/:id', element: <RemixPage /> },
      { path: '/content-plan', element: <ContentPlanPage /> },
      { path: '/go-to-videos', element: <VideosLinkPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export default function App() {
  return (
    <ApiProvider>
      <RouterProvider router={router} />
    </ApiProvider>
  );
}
