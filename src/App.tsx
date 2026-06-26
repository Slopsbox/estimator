import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { LandingPage } from './pages/Landing';
import { AppLogo } from './components/AppLogo';
import { ChunkErrorBoundary } from './components/ChunkErrorBoundary';

function lazyWithRetry<T extends React.ComponentType<unknown>>(
  importFn: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await importFn();
    } catch (error) {
      // Chunk-feil etter deploy – reload én gang
      const hasReloaded = sessionStorage.getItem('chunk-reload');
      if (!hasReloaded) {
        sessionStorage.setItem('chunk-reload', '1');
        window.location.reload();
        // Return dummy mens reload skjer
        return { default: (() => null) as unknown as T };
      }
      sessionStorage.removeItem('chunk-reload');
      throw error;
    }
  });
}

const DeltagerJoinPage = lazyWithRetry(() =>
  import('./pages/DeltagerJoin').then((m) => ({ default: m.DeltagerJoinPage })),
);
const VotePage = lazyWithRetry(() =>
  import('./pages/Vote').then((m) => ({ default: m.VotePage })),
);
const DashboardPage = lazyWithRetry(() =>
  import('./pages/Dashboard').then((m) => ({ default: m.DashboardPage })),
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

export function App() {
  return (
    <BrowserRouter>
      <ChunkErrorBoundary>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/join" element={<DeltagerJoinPage />} />
            <Route path="/vote" element={<VotePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
          </Routes>
        </Suspense>
      </ChunkErrorBoundary>
    </BrowserRouter>
  );
}
