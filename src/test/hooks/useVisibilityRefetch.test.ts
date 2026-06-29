import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVisibilityRefetch } from '../../hooks/useVisibilityRefetch';

// ============================================================
// useVisibilityRefetch – tester
// ============================================================

describe('useVisibilityRefetch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('kaller callback når visibilityState blir "visible"', () => {
    const callback = vi.fn();

    renderHook(() => useVisibilityRefetch(callback));

    // Simuler at tab blir synlig
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(callback).toHaveBeenCalledOnce();
  });

  it('kaller IKKE callback når visibilityState er "hidden"', () => {
    const callback = vi.fn();

    renderHook(() => useVisibilityRefetch(callback));

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('kaller callback ved online-event', () => {
    const callback = vi.fn();

    renderHook(() => useVisibilityRefetch(callback));

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(callback).toHaveBeenCalledOnce();
  });

  it('fjerner event-lyttere ved unmount', () => {
    const callback = vi.fn();

    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const winAddSpy = vi.spyOn(window, 'addEventListener');
    const winRemoveSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useVisibilityRefetch(callback));

    expect(addSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(winAddSpy).toHaveBeenCalledWith('online', callback);

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(winRemoveSpy).toHaveBeenCalledWith('online', callback);
  });

  it('kaller callback flere ganger ved gjentatte synliggjøringer', () => {
    const callback = vi.fn();

    renderHook(() => useVisibilityRefetch(callback));

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(callback).toHaveBeenCalledTimes(2);
  });
});

export {};
