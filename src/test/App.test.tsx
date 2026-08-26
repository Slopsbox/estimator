import { render, screen, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, vi, describe, expect, it } from 'vitest';

const providerSpy = vi.fn();
vi.mock('../hooks/SessionProvider', () => ({
  SessionProvider: ({ children }: PropsWithChildren) => {
    providerSpy();
    return children;
  },
}));
vi.mock('../pages/Landing', () => ({ LandingPage: () => <div>Landing route</div> }));
vi.mock('../pages/DeltagerJoin', () => ({ DeltagerJoinPage: () => <div>Join route</div> }));
vi.mock('../pages/Vote', () => ({ VotePage: () => <div>Vote route</div> }));
vi.mock('../pages/Dashboard', () => ({ DashboardPage: () => <div>Dashboard route</div> }));
vi.mock('../pages/FacilitatorActivityChooser', () => ({ FacilitatorActivityChooserPage: () => <div>Chooser route</div> }));
vi.mock('../pages/HealthCheckDashboard', () => ({ HealthCheckDashboardPage: () => <div>Health dashboard route</div> }));
vi.mock('../pages/HealthCheckRespond', () => ({ HealthCheckRespondPage: () => <div>Health respond route</div> }));

import { App } from '../App';

describe('App', () => {
  beforeEach(() => {
    providerSpy.mockClear();
  });

  it('wrapper produksjonsrutene i SessionProvider', async () => {
    window.history.pushState({}, '', '/');
    render(<App />);
    expect(await screen.findByText('Landing route')).toBeInTheDocument();
    await waitFor(() => expect(providerSpy).toHaveBeenCalled());
  });

  it.each([
    ['/estimation/join', 'Join route'],
    ['/estimation/vote', 'Vote route'],
    ['/estimation/dashboard', 'Dashboard route'],
    ['/facilitator', 'Chooser route'],
    ['/health-check/dashboard', 'Health dashboard route'],
    ['/health-check/respond', 'Health respond route'],
  ])('registrerer kanonisk route %s', async (path, content) => {
    window.history.pushState({}, '', path);
    render(<App />);
    expect(await screen.findByText(content)).toBeInTheDocument();
  });

  it.each([
    ['/join', '/estimation/join', 'Join route'],
    ['/vote', '/estimation/vote', 'Vote route'],
    ['/dashboard', '/estimation/dashboard', 'Dashboard route'],
  ])('redirecter legacy %s med replace', async (legacy, canonical, content) => {
    window.history.replaceState({}, '', '/before-legacy');
    window.history.pushState({}, '', legacy);
    const historyLengthBeforeRedirect = window.history.length;
    render(<App />);
    expect(await screen.findByText(content)).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe(canonical));
    expect(window.history.length).toBe(historyLengthBeforeRedirect);
  });

  it('lazy-laster sessionlaget', async () => {
    const appSource = await import('../App?raw').then((module) => module.default);

    expect(appSource).not.toContain("from './hooks/SessionProvider'");
    expect(appSource).toContain("import('./app/SessionRoutes')");
  });

  it('fjerner preview-ruten og eksponerer de autentiserte Health Check-rutene', async () => {
    const appSource = await import('../App?raw').then((module) => module.default);

    expect(appSource).not.toContain('/health-check-preview');
    expect(appSource).toContain("resolveRoomRoute('health_check', 'facilitator')");
    expect(appSource).toContain("resolveRoomRoute('health_check', 'participant')");
  });
});
