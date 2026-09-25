import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LandingPage } from './pages/Landing';
import { AppLogo } from './components/AppLogo';
import { ChunkErrorBoundary } from './components/ChunkErrorBoundary';
import { readSessionPointer } from './lib/localStorage';
import { resolveRoomRoute } from './lib/roomRoutes';

const DeltagerJoinPage = lazy(() =>
  import('./pages/DeltagerJoin').then((m) => ({ default: m.DeltagerJoinPage })),
);
const VotePage = lazy(() =>
  import('./pages/Vote').then((m) => ({ default: m.VotePage })),
);
const DashboardPage = lazy(() =>
  import('./pages/Dashboard').then((m) => ({ default: m.DashboardPage })),
);
const FacilitatorActivityChooserPage = lazy(() =>
  import('./pages/FacilitatorActivityChooser').then((m) => ({ default: m.FacilitatorActivityChooserPage })),
);
const HealthCheckDashboardPage = lazy(() =>
  import('./pages/HealthCheckDashboard').then((m) => ({ default: m.HealthCheckDashboardPage })),
);
const HealthCheckRespondPage = lazy(() =>
  import('./pages/HealthCheckRespond').then((m) => ({ default: m.HealthCheckRespondPage })),
);
const SessionRoutes = lazy(() =>
  import('./app/SessionRoutes').then((m) => ({ default: m.SessionRoutes })),
);

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-neutral-100)' }}>
      <div className="text-center space-y-3">
        <div className="animate-pulse-slow">
          <AppLogo size={40} />
        </div>
        <p className="text-sm font-medium" style={{ color: 'var(--color-neutral-500)' }}>
          Laster...
        </p>
      </div>
    </div>
  );
}

function LandingEntry() {
  const pointer = readSessionPointer();
  return pointer
    ? <Navigate to={resolveRoomRoute(pointer.activityType, pointer.role)} replace />
    : <LandingPage />;
}

export function App() {
  return (
    <BrowserRouter>
      <ChunkErrorBoundary>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/" element={<LandingEntry />} />
            <Route element={<SessionRoutes />}>
              <Route path="/facilitator" element={<FacilitatorActivityChooserPage />} />
              <Route path={resolveRoomRoute('estimation', 'join')} element={<DeltagerJoinPage />} />
              <Route path={resolveRoomRoute('health_check', 'join')} element={<DeltagerJoinPage />} />
              <Route path={resolveRoomRoute('estimation', 'participant')} element={<VotePage />} />
              <Route path={resolveRoomRoute('estimation', 'facilitator')} element={<DashboardPage />} />
              <Route path={resolveRoomRoute('health_check', 'facilitator')} element={<HealthCheckDashboardPage />} />
              <Route path={resolveRoomRoute('health_check', 'participant')} element={<HealthCheckRespondPage />} />
              <Route path="/join" element={<Navigate to={resolveRoomRoute('estimation', 'join')} replace />} />
              <Route path="/vote" element={<Navigate to={resolveRoomRoute('estimation', 'participant')} replace />} />
              <Route path="/dashboard" element={<Navigate to={resolveRoomRoute('estimation', 'facilitator')} replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ChunkErrorBoundary>
    </BrowserRouter>
  );
}
