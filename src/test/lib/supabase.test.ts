import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, getSessionMock, refreshSessionMock, rpcMock, signInAnonymouslyMock, setAuthMock } = vi.hoisted(() => {
  const getSessionMock = vi.fn();
  const refreshSessionMock = vi.fn();
  const rpcMock = vi.fn();
  const signInAnonymouslyMock = vi.fn();
  const setAuthMock = vi.fn();
  return {
    createClientMock: vi.fn(() => ({
      auth: { getSession: getSessionMock, refreshSession: refreshSessionMock, signInAnonymously: signInAnonymouslyMock },
      realtime: { setAuth: setAuthMock },
      rpc: rpcMock,
    })),
    getSessionMock,
    refreshSessionMock,
    rpcMock,
    signInAnonymouslyMock,
    setAuthMock,
  };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

import { ensureAnonymousIdentity, getAccessToken, rpcWithAuthRecovery } from '../../lib/supabase';

const user = { id: 'user-1' };

describe('ensureAnonymousIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthMock.mockResolvedValue(undefined);
    refreshSessionMock.mockReset();
    rpcMock.mockReset();
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

  it('returns the current access token after ensuring identity', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { user, access_token: 'access-token' } },
      error: null,
    });

    await expect(getAccessToken()).resolves.toBe('access-token');
    expect(getSessionMock).toHaveBeenCalledOnce();
  });

});

describe('rpcWithAuthRecovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fornyer utløpt JWT og gjentar RPC-en én gang', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST303' } })
      .mockResolvedValueOnce({ data: { status: 'ok' }, error: null });
    refreshSessionMock.mockResolvedValue({
      data: { session: { access_token: 'fresh-token' } },
      error: null,
    });

    await expect(rpcWithAuthRecovery('next_round', { p_session_id: 'session-1' }))
      .resolves.toMatchObject({ data: { status: 'ok' }, error: null });
    expect(refreshSessionMock).toHaveBeenCalledOnce();
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it('gjentar ikke andre RPC-feil', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: '42501' } });

    await rpcWithAuthRecovery('next_round', { p_session_id: 'session-1' });

    expect(refreshSessionMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledOnce();
  });

  it('gjentar ikke RPC-en når tokenfornying feiler', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: 'PGRST303' } });
    refreshSessionMock.mockResolvedValue({ data: { session: null }, error: { message: 'expired' } });

    await rpcWithAuthRecovery('restore_session', { p_session_id: 'session-1' });

    expect(refreshSessionMock).toHaveBeenCalledOnce();
    expect(rpcMock).toHaveBeenCalledOnce();
  });
});
