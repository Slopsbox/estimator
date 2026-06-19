import { useCallback, useEffect, useRef } from 'react';

const CONFETTI_COLORS = [
  '#2d8a5e',
  '#F6821F',
  '#f0c040',
  '#9f4fe8',
  '#e84040',
  '#4070e0',
  '#f48fb1',
];

const PIECE_COUNT = 70;
const DURATION_MS = 3200;

interface ConfettiPiece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
  width: number;
  height: number;
  opacity: number;
}

/**
 * Canvas-basert konfetti-animasjon.
 * Returnerer triggerConfetti() – kall den for å starte animasjonen.
 * Canvas-elementet opprettes og fjernes automatisk.
 */
export function useConfetti() {
  const animFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const triggerConfetti = useCallback(() => {
    // Avslutt evt. pågående animasjon
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
    }
    if (canvasRef.current) {
      canvasRef.current.remove();
    }

    // Opprett canvas-overlay
    const canvas = document.createElement('canvas');
    canvas.style.cssText = [
      'position:fixed',
      'inset:0',
      'width:100%',
      'height:100%',
      'pointer-events:none',
      'z-index:9999',
    ].join(';');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    canvasRef.current = canvas;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Initialiser konfetti-biter
    const pieces: ConfettiPiece[] = Array.from({ length: PIECE_COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 100,
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 4,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.15,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      width: 8 + Math.random() * 8,
      height: 4 + Math.random() * 4,
      opacity: 1,
    }));

    const startTime = performance.now();

    function draw(now: number) {
      if (!ctx || !canvas) return;

      const elapsed = now - startTime;
      const progress = Math.min(elapsed / DURATION_MS, 1);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const piece of pieces) {
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.vy += 0.05; // tyngdekraft
        piece.rotation += piece.rotationSpeed;

        // Fade ut siste 30% av animasjonen
        piece.opacity = progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 1;

        ctx.save();
        ctx.globalAlpha = piece.opacity;
        ctx.translate(piece.x, piece.y);
        ctx.rotate(piece.rotation);
        ctx.fillStyle = piece.color;
        ctx.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
        ctx.restore();
      }

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(draw);
      } else {
        canvas.remove();
        canvasRef.current = null;
        animFrameRef.current = null;
      }
    }

    animFrameRef.current = requestAnimationFrame(draw);
  }, []);

  // Cleanup ved unmount: kanseller animasjon og fjern canvas
  useEffect(() => {
    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (canvasRef.current) {
        canvasRef.current.remove();
        canvasRef.current = null;
      }
    };
  }, []);

  return { triggerConfetti };
}
