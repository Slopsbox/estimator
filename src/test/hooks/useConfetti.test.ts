import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConfetti } from '../../hooks/useConfetti';

describe('useConfetti', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let appendChildSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rafSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cancelRafSpy: any;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    originalCreateElement = document.createElement.bind(document);

    // Mock canvas getContext
    const mockCtx = {
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      fillRect: vi.fn(),
      globalAlpha: 1,
      fillStyle: '',
    };

    // Override createElement kun for 'canvas'
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, ...args: unknown[]) => {
      if (tag === 'canvas') {
        const canvas = originalCreateElement('canvas');
        vi.spyOn(canvas, 'getContext').mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D);
        return canvas;
      }
      return originalCreateElement(tag, ...(args as [ElementCreationOptions?]));
    });

    appendChildSpy = vi.spyOn(document.body, 'appendChild');
    rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42);
    cancelRafSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returnerer triggerConfetti-funksjon', () => {
    const { result } = renderHook(() => useConfetti());
    expect(typeof result.current.triggerConfetti).toBe('function');
  });

  it('oppretter canvas-element ved triggerConfetti', () => {
    const { result } = renderHook(() => useConfetti());
    act(() => {
      result.current.triggerConfetti();
    });
    // Verifiser at minst ett canvas-element ble lagt til body
    const appendedTags = (appendChildSpy.mock.calls as Array<[HTMLElement]>).map(
      (call) => call[0].tagName,
    );
    expect(appendedTags).toContain('CANVAS');
  });

  it('starter animasjon med requestAnimationFrame', () => {
    const { result } = renderHook(() => useConfetti());
    act(() => {
      result.current.triggerConfetti();
    });
    expect(rafSpy).toHaveBeenCalled();
  });

  it('avbryter pågående animasjon ved ny trigger', () => {
    const { result } = renderHook(() => useConfetti());
    act(() => {
      result.current.triggerConfetti();
    });
    act(() => {
      result.current.triggerConfetti();
    });
    expect(cancelRafSpy).toHaveBeenCalledWith(42);
  });
});
