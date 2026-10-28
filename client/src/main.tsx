import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import '@fontsource-variable/inter';
import { queryClient } from '@/lib/query';
import { ProtectedRoute } from '@/routes/protected-route';
import { AppLayout } from '@/components/layout/app-layout';
import { LoadingScreen } from '@/components/shared/feedback';
import { NotFoundPage } from '@/pages/not-found';
import { allNavigation } from '@/routes/navigation';
import '@/styles/globals.css';
import '@/styles/crud.css';

const LoginPage = lazy(() => import('@/pages/auth/login').then((m) => ({ default: m.LoginPage })));
const OverviewPage = lazy(() =>
  import('@/pages/dashboard/overview').then((m) => ({ default: m.OverviewPage })),
);
const FutureModulePage = lazy(() =>
  import('@/pages/future-module').then((m) => ({ default: m.FutureModulePage })),
);
const ProfilePage = lazy(() => import('@/pages/profile').then((m) => ({ default: m.ProfilePage })));
const ClientsPage = lazy(() => import('@/pages/clients').then((m) => ({ default: m.ClientsPage })));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route index element={<OverviewPage />} />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route path="clients" element={<ClientsPage />} />
                  {allNavigation
                    .filter((item) => !['/', '/profile', '/clients'].includes(item.path))
                    .map((item) => (
                      <Route key={item.path} path={item.path} element={<FutureModulePage />} />
                    ))}
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </MotionConfig>
    </QueryClientProvider>
  </React.StrictMode>,
);
