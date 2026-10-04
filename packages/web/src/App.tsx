import type { RouteObject } from 'react-router';
import { createBrowserRouter, Link, Navigate, Outlet, useParams } from 'react-router';
import { EditorPage } from './editor/EditorPage.js';
import { OverviewPage } from './overview/OverviewPage.js';
import { Shell } from './shell/Shell.js';
import { Empty } from './ui.js';

const Layout = () => (
  <Shell>
    <Outlet />
  </Shell>
);

const NotFoundPage = () => (
  <Empty
    title="Page not found"
    text="There is nothing at this address."
    action={
      <Link to="/" className="btn sec">
        Back to DM automations
      </Link>
    }
  />
);

const EditorTabRedirect = () => {
  const params = useParams();
  return <Navigate to={`/automations/${params.id ?? ''}`} replace />;
};

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { path: '/', element: <OverviewPage /> },
      { path: '/automations/:id', element: <EditorPage tab="editor" /> },
      { path: '/automations/:id/runs', element: <EditorPage tab="runs" /> },
      { path: '/automations/:id/analytics', element: <EditorPage tab="analytics" /> },
      { path: '/automations/:id/versions/:versionId', element: <EditorPage tab="editor" /> },
      { path: '/automations/:id/*', element: <EditorTabRedirect /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
