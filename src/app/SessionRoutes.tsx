import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { SessionProvider } from '../hooks/SessionProvider';
import { useSession } from '../hooks/useSession';
import { readHealthCheckResultRoom } from '../domains/health-check/storage/healthCheckStorage';
import { hasRecentTurnstileVerification } from '../lib/turnstileAttestation';

const protectedEntryPaths = new Set([
  '/facilitator',
  '/estimation/join',
  '/health-check/join',
  '/estimation/dashboard',
  '/health-check/dashboard',
]);

export function SessionRoutes() {
  return (
    <SessionProvider>
      <EntryGate />
    </SessionProvider>
  );
}

function EntryGate() {
  const location = useLocation();
  const { session, activityType, localParticipant, restoreStatus } = useSession();
  if (location.pathname === '/' && session && activityType && localParticipant && restoreStatus === 'ready') {
    return <Navigate to={activityType === 'health_check'
      ? `/health-check/${localParticipant.role === 'facilitator' ? 'dashboard' : 'respond'}`
      : `/estimation/${localParticipant.role === 'facilitator' ? 'dashboard' : 'vote'}`} replace />;
  }
  if (!protectedEntryPaths.has(location.pathname)) return <Outlet />;
  if (restoreStatus === 'initializing' || restoreStatus === 'reconnecting') return <Outlet />;
  if (location.pathname === '/facilitator') {
    return session || hasRecentTurnstileVerification()
      ? <Outlet />
      : <Navigate to="/" replace state={{ returnTo: location.pathname }} />;
  }
  const targetActivity = location.pathname.startsWith('/health-check') ? 'health_check' : 'estimation';
  if ((session && activityType === targetActivity) || hasRecentTurnstileVerification()) return <Outlet />;
  if (location.pathname === '/health-check/dashboard' && readHealthCheckResultRoom()) return <Outlet />;
  return <Navigate to="/" replace state={{ returnTo: location.pathname }} />;
}
