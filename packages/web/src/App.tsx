import { createBrowserRouter, Outlet } from 'react-router';
import { EditorPage } from './editor/EditorPage.js';
import { OverviewPage } from './overview/OverviewPage.js';
import { Shell } from './shell/Shell.js';

const Layout = () => (
  <Shell>
    <Outlet />
  </Shell>
);

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <OverviewPage /> },
      { path: '/automations/:id', element: <EditorPage tab="editor" /> },
      { path: '/automations/:id/runs', element: <EditorPage tab="runs" /> },
      { path: '/automations/:id/analytics', element: <EditorPage tab="analytics" /> },
      { path: '/automations/:id/versions/:versionId', element: <EditorPage tab="editor" /> },
    ],
  },
]);
