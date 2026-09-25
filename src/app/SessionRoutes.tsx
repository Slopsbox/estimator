import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { SessionProvider } from '../hooks/SessionProvider';
import { useSession } from '../hooks/useSession';
import { resolveRoomRoute } from '../lib/roomRoutes';
import { AppLogo } from '../components/AppLogo';

const ACTIVE_ROOM_PATHS = new Set([
  resolveRoomRoute('estimation', 'participant'),
  resolveRoomRoute('estimation', 'facilitator'),
  resolveRoomRoute('health_check', 'participant'),
  resolveRoomRoute('health_check', 'facilitator'),
]);

function AuthoritativeRoomRoute() {
  const location = useLocation();
  const { activityType, localParticipant, session, restoreStatus, clearLocalSession } = useSession();
  if ((restoreStatus === 'initializing' || restoreStatus === 'reconnecting') && localParticipant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <AppLogo size={40} />
        <p>{restoreStatus === 'initializing' ? 'Gjenoppretter sesjonen…' : 'Kobler til sesjonen igjen…'}</p>
        {restoreStatus === 'reconnecting' ? (
          <button type="button" className="min-h-11 rounded-md px-4 font-semibold" onClick={clearLocalSession}>
            Start på nytt
          </button>
        ) : null}
      </div>
    );
  }
  if (!session || !activityType || !localParticipant || !ACTIVE_ROOM_PATHS.has(location.pathname)) return <Outlet />;
  const destination = localParticipant.role === 'facilitator' ? 'facilitator' : 'participant';
  const expected = resolveRoomRoute(activityType, destination);
  return location.pathname === expected ? <Outlet /> : <Navigate to={expected} replace />;
}

export function SessionRoutes() {
  return (
    <SessionProvider>
      <AuthoritativeRoomRoute />
    </SessionProvider>
  );
}
