import { render, screen } from '@testing-library/react';
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

import { App } from '../App';

describe('App', () => {
  it('wrapper alle routes i SessionProvider', () => {
    window.history.pushState({}, '', '/');
    render(<App />);
    expect(providerSpy).toHaveBeenCalled();
    expect(screen.getByText('Landing route')).toBeInTheDocument();
  });
});
