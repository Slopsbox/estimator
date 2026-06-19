import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { DashboardPage } from './pages/Dashboard';
import { DeltagerJoinPage } from './pages/DeltagerJoin';
import { LandingPage } from './pages/Landing';
import { VotePage } from './pages/Vote';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/join" element={<DeltagerJoinPage />} />
        <Route path="/vote" element={<VotePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
      </Routes>
    </BrowserRouter>
  );
}
