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
const ProjectsPage = lazy(() =>
  import('@/pages/projects').then((m) => ({ default: m.ProjectsPage })),
);
const ProjectDetailsPage = lazy(() =>
  import('@/pages/projects').then((m) => ({ default: m.ProjectDetailsPage })),
);
const TeamPage = lazy(() => import('@/pages/team').then((m) => ({ default: m.TeamPage })));
const MilestonesPage = lazy(() =>
  import('@/pages/milestones').then((m) => ({ default: m.MilestonesPage })),
);
const MilestoneDetailsPage = lazy(() =>
  import('@/pages/milestones').then((m) => ({ default: m.MilestoneDetailsPage })),
);
const TasksPage = lazy(() => import('@/pages/tasks').then((m) => ({ default: m.TasksPage })));
const TransactionsPage = lazy(() =>
  import('@/pages/transactions').then((m) => ({ default: m.TransactionsPage })),
);
const TransactionDetailsPage = lazy(() =>
  import('@/pages/transactions').then((m) => ({ default: m.TransactionDetailsPage })),
);
const ApprovalsPage = lazy(() =>
  import('@/pages/approvals').then((m) => ({ default: m.ApprovalsPage })),
);
const ExpensesPage = lazy(() =>
  import('@/pages/expenses').then((m) => ({ default: m.ExpensesPage })),
);
const ReportsPage = lazy(() => import('@/pages/reports').then((m) => ({ default: m.ReportsPage })));
const AuditLogsPage = lazy(() =>
  import('@/pages/audit-logs').then((m) => ({ default: m.AuditLogsPage })),
);

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
                  <Route path="projects" element={<ProjectsPage />} />
                  <Route path="projects/:id" element={<ProjectDetailsPage />} />
                  <Route path="team" element={<TeamPage />} />
                  <Route path="tasks" element={<TasksPage />} />
                  <Route path="milestones" element={<MilestonesPage />} />
                  <Route path="milestones/:id" element={<MilestoneDetailsPage />} />
                  <Route path="transactions" element={<TransactionsPage />} />
                  <Route path="transactions/:id" element={<TransactionDetailsPage />} />
                  <Route path="approvals" element={<ApprovalsPage />} />
                  <Route path="expenses" element={<ExpensesPage />} />
                  <Route path="analytics" element={<ReportsPage />} />
                  <Route path="audit-logs" element={<AuditLogsPage />} />
                  {allNavigation
                    .filter(
                      (item) =>
                        ![
                          '/',
                          '/profile',
                          '/clients',
                          '/projects',
                          '/team',
                          '/tasks',
                          '/milestones',
                          '/transactions',
                          '/approvals',
                          '/expenses',
                          '/analytics',
                          '/audit-logs',
                        ].includes(item.path),
                    )
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
