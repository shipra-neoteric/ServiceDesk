import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { AppShell } from './AppShell';
import { ErrorBoundary } from './ErrorBoundary';
import { LoginPage } from '../features/auth/LoginPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { JobListPage } from '../features/jobs/JobListPage';
import { JobDetailPage } from '../features/jobs/JobDetailPage';
import { MyJobsPage } from '../features/jobs/MyJobsPage';
import { AttentionQueuePage } from '../features/processCoordinator/AttentionQueuePage';
import { MastersPage } from '../features/masters/MastersPage';
import { UsersPage } from '../features/users/UsersPage';
import { ReportsPage } from '../features/reports/ReportsPage';
import { PermissionGate } from '../ui/PermissionGate';
import { EmptyState } from '../ui/EmptyState';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-content-muted dark:text-content-dark-muted">Loading ServiceDesk…</div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function AppRouter() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="p-6 text-sm text-content-muted">Loading…</div>}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/jobs" element={<JobListPage />} />
            <Route path="/jobs/:id" element={<JobDetailPage />} />
            <Route path="/my-jobs" element={<MyJobsPage />} />
            <Route path="/attention" element={<AttentionQueuePage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route
              path="/masters"
              element={
                <PermissionGate permissions={['master.view']} fallback={<EmptyState title="Permission denied" reason="You do not have access to Masters." />}>
                  <MastersPage />
                </PermissionGate>
              }
            />
            <Route
              path="/users"
              element={
                <PermissionGate permissions={['user.view']} fallback={<EmptyState title="Permission denied" reason="You do not have access to Users." />}>
                  <UsersPage />
                </PermissionGate>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
