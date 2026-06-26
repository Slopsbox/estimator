import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWakeLock } from '../../hooks/useWakeLock';

describe('useWakeLock', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockWakeLockSentinel: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let requestSpy: any;

  beforeEach(() => {
    // Opprett en mock WakeLockSentinel
    mockWakeLockSentinel = {
      release: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    // Mock navigator.wakeLock
    requestSpy = vi.fn().mockResolvedValue(mockWakeLockSentinel);
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: requestSpy },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('kaller navigator.wakeLock.request ved mount', async () => {
    const { unmount } = renderHook(() => useWakeLock());

    // Vent på at det asynkrone requestWakeLock() resolves
    await vi.waitFor(() => {
      expect(requestSpy).toHaveBeenCalledWith('screen');
    });

    unmount();
  });

  it('kaller release ved unmount', async () => {
    const { unmount } = renderHook(() => useWakeLock());

    // Vent på at wake lock er acquire-t
    await vi.waitFor(() => {
      expect(requestSpy).toHaveBeenCalled();
    });

    unmount();

    // Vent på at release er kalt (asynkront i cleanup)
    await vi.waitFor(() => {
      expect(mockWakeLockSentinel.release).toHaveBeenCalled();
    });
  });

  it('håndterer manglende Wake Lock API uten å krasje', async () => {
    // Fjern wakeLock fra navigator for å simulere unsupported browser
    Object.defineProperty(navigator, 'wakeLock', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    // Skal ikke kaste feil
    expect(() => {
      const { unmount } = renderHook(() => useWakeLock());
      unmount();
    }).not.toThrow();
  });

  it('håndterer feil fra navigator.wakeLock.request uten å krasje', async () => {
    // Simuler at request kaster feil (f.eks. lav batteri)
    requestSpy.mockRejectedValue(new Error('WakeLock request failed'));

    expect(() => {
      const { unmount } = renderHook(() => useWakeLock());
      unmount();
    }).not.toThrow();

    // Vent litt slik at det asynkrone kallet er forsøkt
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('registrerer visibilitychange-lytter og re-acquirer ved tab-bytte tilbake', async () => {
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
    const { unmount } = renderHook(() => useWakeLock());

    await vi.waitFor(() => {
      expect(requestSpy).toHaveBeenCalledTimes(1);
    });

    // Verifiser at visibilitychange-lytter er registrert
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );

    unmount();
  });

  it('fjerner visibilitychange-lytter ved unmount', async () => {
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useWakeLock());

    await vi.waitFor(() => {
      expect(requestSpy).toHaveBeenCalled();
    });

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );
  });
});
