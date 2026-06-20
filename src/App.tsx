import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { LandingPage } from './pages/Landing';
import { AppLogo } from './components/AppLogo';

const DeltagerJoinPage = lazy(() => import('./pages/DeltagerJoin').then((m) => ({ default: m.DeltagerJoinPage })));
const VotePage = lazy(() => import('./pages/Vote').then((m) => ({ default: m.VotePage })));
const DashboardPage = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.DashboardPage })));

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
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/join" element={<DeltagerJoinPage />} />
          <Route path="/vote" element={<VotePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
