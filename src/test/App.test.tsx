import { render, screen, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { vi, describe, expect, it } from 'vitest';

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

import { App } from '../App';

describe('App', () => {
  it('wrapper alle routes i SessionProvider', () => {
    window.history.pushState({}, '', '/');
    render(<App />);
    expect(providerSpy).toHaveBeenCalled();
    expect(screen.getByText('Landing route')).toBeInTheDocument();
  });

  it.each([
    ['/estimation/join', 'Join route'],
    ['/estimation/vote', 'Vote route'],
    ['/estimation/dashboard', 'Dashboard route'],
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

  it('eksponerer ingen Health Check-ruter i router-konfigurasjonen', async () => {
    const appSource = await import('../App?raw').then((module) => module.default);

    expect(appSource).not.toContain("resolveRoomRoute('health_check'");
    expect(appSource).not.toContain('HealthCheck');
  });
});
