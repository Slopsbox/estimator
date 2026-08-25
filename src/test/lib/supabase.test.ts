import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, getSessionMock, signInAnonymouslyMock, setAuthMock } = vi.hoisted(() => {
  const getSessionMock = vi.fn();
  const signInAnonymouslyMock = vi.fn();
  const setAuthMock = vi.fn();
  return {
    createClientMock: vi.fn(() => ({
      auth: { getSession: getSessionMock, signInAnonymously: signInAnonymouslyMock },
      realtime: { setAuth: setAuthMock },
    })),
    getSessionMock,
    signInAnonymouslyMock,
    setAuthMock,
  };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

import { ensureAnonymousIdentity } from '../../lib/supabase';

const user = { id: 'user-1' };

describe('ensureAnonymousIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthMock.mockResolvedValue(undefined);
  });

  it('gjenbruker eksisterende auth-session', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { user, access_token: 'existing-token' } },
      error: null,
    });

    await expect(ensureAnonymousIdentity()).resolves.toEqual(user);
    expect(signInAnonymouslyMock).not.toHaveBeenCalled();
    expect(setAuthMock).toHaveBeenCalledWith('existing-token');
  });

  it('logger inn anonymt når session mangler', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    signInAnonymouslyMock.mockResolvedValue({
      data: { user, session: { user, access_token: 'new-token' } },
      error: null,
    });

    await expect(ensureAnonymousIdentity()).resolves.toEqual(user);
    expect(signInAnonymouslyMock).toHaveBeenCalledTimes(1);
    expect(setAuthMock).toHaveBeenCalledWith('new-token');
  });

  it('dedupliserer parallelle kall', async () => {
    let resolveSession!: (value: unknown) => void;
    getSessionMock.mockReturnValue(new Promise((resolve) => { resolveSession = resolve; }));

    const first = ensureAnonymousIdentity();
    const second = ensureAnonymousIdentity();
    expect(getSessionMock).toHaveBeenCalledTimes(1);

    resolveSession({ data: { session: { user, access_token: 'shared-token' } }, error: null });

    await expect(Promise.all([first, second])).resolves.toEqual([user, user]);
  });

  it('kaster generisk feil når auth feiler', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: new Error('sensitive detail') });

    await expect(ensureAnonymousIdentity()).rejects.toThrow('Kunne ikke opprette sikker identitet. Prøv igjen.');
  });

  it('skjuler realtime auth-feildetaljer', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { user, access_token: 'existing-token' } },
      error: null,
    });
    setAuthMock.mockRejectedValue(new Error('token detail'));

    await expect(ensureAnonymousIdentity()).rejects.toThrow('Kunne ikke opprette sikker identitet. Prøv igjen.');
  });
});
