import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ROUTER_BASENAME } from './lib/config';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { Loading } from './components/Loading';

// Code-split every route except home: the home route's measured payload
// (BUILD ORDER step 4) should not carry Recharts and the other pages' code,
// which only PartnerPage/SectionPage/HubPage/MethodologyPage need.
const HubPage = lazy(() => import('./pages/HubPage').then((m) => ({ default: m.HubPage })));
const PartnerPage = lazy(() => import('./pages/PartnerPage').then((m) => ({ default: m.PartnerPage })));
const SectionPage = lazy(() => import('./pages/SectionPage').then((m) => ({ default: m.SectionPage })));
const MethodologyPage = lazy(() =>
  import('./pages/MethodologyPage').then((m) => ({ default: m.MethodologyPage })),
);
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));

export function App(): JSX.Element {
  return (
    <BrowserRouter basename={ROUTER_BASENAME}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route
            path="hub"
            element={
              <Suspense fallback={<Loading />}>
                <HubPage />
              </Suspense>
            }
          />
          <Route
            path="partner/:code"
            element={
              <Suspense fallback={<Loading />}>
                <PartnerPage />
              </Suspense>
            }
          />
          <Route
            path="section/:id"
            element={
              <Suspense fallback={<Loading />}>
                <SectionPage />
              </Suspense>
            }
          />
          <Route
            path="methodology"
            element={
              <Suspense fallback={<Loading />}>
                <MethodologyPage />
              </Suspense>
            }
          />
          <Route
            path="*"
            element={
              <Suspense fallback={<Loading />}>
                <NotFoundPage />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
