import { Outlet } from 'react-router-dom';
import { SessionProvider } from '../hooks/SessionProvider';

export function SessionRoutes() {
  return (
    <SessionProvider>
      <Outlet />
    </SessionProvider>
  );
}
