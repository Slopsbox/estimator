import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLongPress } from '../../hooks/useLongPress';

describe('useLongPress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // rAF: lagre callback men IKKE kjør den synkront – vi kontrollerer fremdriften
    // via fake setTimeout alene. Rekursiv rAF → stack overflow hvis vi kjører den.
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 0);
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starter med isPressed=false, progress=0, wasLongPress=false', () => {
    const { result } = renderHook(() =>
      useLongPress({ onLongPress: vi.fn() }),
    );
    expect(result.current.isPressed).toBe(false);
    expect(result.current.progress).toBe(0);
    expect(result.current.wasLongPress).toBe(false);
  });

  it('setter isPressed=true ved onMouseDown', () => {
    const { result } = renderHook(() =>
      useLongPress({ onLongPress: vi.fn() }),
    );
    act(() => {
      result.current.handlers.onMouseDown({} as React.MouseEvent);
    });
    expect(result.current.isPressed).toBe(true);
  });

  it('setter isPressed=false og kaller onLongPress etter full duration', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() =>
      useLongPress({ duration: 3000, onLongPress }),
    );
    act(() => {
      result.current.handlers.onMouseDown({} as React.MouseEvent);
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(result.current.isPressed).toBe(false);
    expect(result.current.wasLongPress).toBe(true);
  });

  it('kaller IKKE onLongPress ved tidlig slipp (onMouseUp)', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() =>
      useLongPress({ duration: 3000, onLongPress }),
    );
    act(() => {
      result.current.handlers.onMouseDown({} as React.MouseEvent);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      result.current.handlers.onMouseUp();
    });
    act(() => {
      vi.advanceTimersByTime(2000); // resten av timeren
    });
    expect(onLongPress).not.toHaveBeenCalled();
    expect(result.current.isPressed).toBe(false);
    expect(result.current.wasLongPress).toBe(false);
  });

  it('avbryter ved onMouseLeave', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() =>
      useLongPress({ duration: 3000, onLongPress }),
    );
    act(() => {
      result.current.handlers.onMouseDown({} as React.MouseEvent);
    });
    act(() => {
      result.current.handlers.onMouseLeave();
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onLongPress).not.toHaveBeenCalled();
    expect(result.current.isPressed).toBe(false);
  });

  it('avbryter ved onTouchCancel', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() =>
      useLongPress({ duration: 3000, onLongPress }),
    );
    act(() => {
      result.current.handlers.onTouchStart({} as React.TouchEvent);
    });
    act(() => {
      result.current.handlers.onTouchCancel();
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('avbryter ved onTouchEnd', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() =>
      useLongPress({ duration: 3000, onLongPress }),
    );
    act(() => {
      result.current.handlers.onTouchStart({} as React.TouchEvent);
    });
    act(() => {
      result.current.handlers.onTouchEnd();
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('nullstiller wasLongPress ved nytt start-event', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() =>
      useLongPress({ duration: 3000, onLongPress }),
    );
    // Fullfør et long press
    act(() => {
      result.current.handlers.onMouseDown({} as React.MouseEvent);
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.wasLongPress).toBe(true);

    // Start et nytt hold
    act(() => {
      result.current.handlers.onMouseDown({} as React.MouseEvent);
    });
    expect(result.current.wasLongPress).toBe(false);
    // Rydd opp
    act(() => {
      result.current.handlers.onMouseUp();
    });
  });

  it('bruker custom duration', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() =>
      useLongPress({ duration: 1500, onLongPress }),
    );
    act(() => {
      result.current.handlers.onMouseDown({} as React.MouseEvent);
    });
    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(onLongPress).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('reseterer progress til 0 etter tidlig avbrutt hold', () => {
    const { result } = renderHook(() =>
      useLongPress({ onLongPress: vi.fn() }),
    );
    act(() => {
      result.current.handlers.onMouseDown({} as React.MouseEvent);
    });
    act(() => {
      result.current.handlers.onMouseUp();
    });
    expect(result.current.progress).toBe(0);
  });
});
