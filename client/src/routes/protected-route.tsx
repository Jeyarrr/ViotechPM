import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '@/hooks/use-auth';
import { ErrorState, LoadingScreen } from '@/components/shared/feedback';

export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.isPending) return <LoadingScreen />;
  if (auth.isError)
    return <ErrorState message={auth.error.message} retry={() => void auth.refetch()} />;
  if (!auth.data) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <Outlet />;
}
