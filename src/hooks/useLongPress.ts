import { useCallback, useEffect, useRef, useState } from 'react';

interface UseLongPressOptions {
  /** Millisekunder å holde inne før long press trigges. Default: 3000 */
  duration?: number;
  onLongPress: () => void;
}

interface UseLongPressReturn {
  /** True mens brukeren holder inne */
  isPressed: boolean;
  /** 0–1: andel av duration som er tilbakelagt */
  progress: number;
  /** True etter at et fullført long press nettopp ble avsluttet – tilbakestilles ved neste start */
  wasLongPress: boolean;
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
    onTouchCancel: () => void;
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
  };
}

/**
 * Registrerer et "hold inne"-gestur og animerer fremdriften.
 *
 * Skiller mellom kort klikk (select) og lang press (info):
 * - `wasLongPress` settes til true etter at long press er fullført.
 * - onClick-handleren bør sjekke `wasLongPress` og avbryte
 *   normal velg-logikk når dette er true.
 * - `wasLongPress` nullstilles ved neste start-event.
 *
 * Animasjons-loop implementeres via tickRef-mønster for å unngå
 * react-hooks/immutability-feil (useCallback kan ikke referere til
 * sin egen verdi i dep-array eller callback-kropp).
 */
export function useLongPress({
  duration = 3000,
  onLongPress,
}: UseLongPressOptions): UseLongPressReturn {
  const [isPressed, setIsPressed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [wasLongPress, setWasLongPress] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const startTimeRef = useRef<number>(0);
  const animFrameRef = useRef<number | undefined>(undefined);

  // Stabile refs for å unngå stale closures uten å bryte hooks-regler
  const durationRef = useRef(duration);
  const onLongPressRef = useRef(onLongPress);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    onLongPressRef.current = onLongPress;
  }, [onLongPress]);

  // tickRef bryter sirkelen: rAF-loopen kaller tickRef.current i stedet for
  // å referere til en useCallback-verdi som er deklarert etter den selv.
  const tickRef = useRef<() => void>(() => {});

  useEffect(() => {
    tickRef.current = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const p = Math.min(elapsed / durationRef.current, 1);
      setProgress(p);
      if (p < 1) {
        animFrameRef.current = requestAnimationFrame(tickRef.current);
      }
    };
  }); // kaller etter hver render for å ha fersk closure uten linterfeil

  const start = useCallback(() => {
    setWasLongPress(false);
    setIsPressed(true);
    setProgress(0);
    startTimeRef.current = Date.now();
    animFrameRef.current = requestAnimationFrame(tickRef.current);
    timerRef.current = setTimeout(() => {
      setIsPressed(false);
      setProgress(0);
      setWasLongPress(true);
      if (animFrameRef.current !== undefined) {
        cancelAnimationFrame(animFrameRef.current);
      }
      onLongPressRef.current();
    }, durationRef.current);
  }, []); // stabil: alt leses fra refs

  const cancel = useCallback(() => {
    setIsPressed(false);
    setProgress(0);
    if (timerRef.current !== undefined) clearTimeout(timerRef.current);
    if (animFrameRef.current !== undefined) cancelAnimationFrame(animFrameRef.current);
  }, []);

  return {
    isPressed,
    progress,
    wasLongPress,
    handlers: {
      onTouchStart: (e: React.TouchEvent) => {
        void e;
        start();
      },
      onTouchEnd: cancel,
      onTouchCancel: cancel,
      onMouseDown: (e: React.MouseEvent) => {
        void e;
        start();
      },
      onMouseUp: cancel,
      onMouseLeave: cancel,
    },
  };
}
