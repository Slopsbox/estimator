import { StrictMode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthCheckCampfire } from '../../../../domains/health-check/components/HealthCheckCampfire';
import prototype from '../../../../../public/health-check-pixel-office-prototype.html?raw';

type DrawingContext = Pick<CanvasRenderingContext2D, 'fillStyle' | 'globalAlpha' | 'imageSmoothingEnabled' | 'fillRect'>;
type PixelCommand = readonly [number, number, number, number, DrawingContext['fillStyle'], number];

function createDrawingContext() {
  const commands: PixelCommand[] = [];
  const context: DrawingContext = {
    fillStyle: '#000000',
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    fillRect(x, y, width, height) {
      commands.push([x, y, width, height, this.fillStyle, this.globalAlpha]);
    },
  };
  return { context, commands };
}

// The approved prototype is the independent oracle for every pixel operation,
// including layer order, colours and opacity at each animation time.
const drawPrototype = new Function('ctx', 'time', `${prototype.slice(
  prototype.indexOf('    function rect('),
  prototype.indexOf('    function tick('),
)}\ndraw(time);`) as (context: DrawingContext, time: number) => void;

describe('HealthCheckCampfire', () => {
  let drawing: ReturnType<typeof createDrawingContext>;
  let hidden: boolean;
  let nextFrameId: number;
  let frames: Map<number, FrameRequestCallback>;

  function runFrame(now: number) {
    act(() => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(now));
    });
  }

  function setHidden(value: boolean) {
    hidden = value;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
  }

  beforeEach(() => {
    hidden = false;
    nextFrameId = 0;
    frames = new Map();
    drawing = createDrawingContext();
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      drawing.context as CanvasRenderingContext2D,
    );
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      const id = nextFrameId++;
      frames.set(id, callback);
      return id;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frames.delete(id)));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('viser et tilgjengelig 192×192 pixelbål med prototypens ramme', () => {
    render(<HealthCheckCampfire />);
    const canvas = screen.getByRole('img', {
      name: 'Et bål med seks vedkubber, blafrende flammer, røyk og små glør som stiger.',
    });
    expect(canvas).toHaveAttribute('width', '192');
    expect(canvas).toHaveAttribute('height', '192');
    expect(canvas).toHaveClass('block', 'w-full', 'h-auto', 'aspect-square');
    expect(canvas).toHaveStyle({ imageRendering: 'pixelated' });
    expect(canvas.parentElement).toHaveClass('m-0', 'overflow-hidden', 'rounded-2xl', 'bg-[#191d37]');
    expect(canvas).toHaveTextContent('Et varmt bål med vedkubber og flammer på mørk bakgrunn.');
    expect(drawing.context.imageSmoothingEnabled).toBe(false);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('tegner eksakt samme grafikk som prototypen ved start og gjennom animasjonen', () => {
    render(<HealthCheckCampfire />);
    const reference = createDrawingContext();
    drawPrototype(reference.context, 0);
    expect(drawing.commands).toEqual(reference.commands);

    drawing.commands.length = 0;
    runFrame(0);
    runFrame(79);
    expect(drawing.commands).toHaveLength(0);

    let time = 0;
    for (const now of [80, 160, 240, 1040]) {
      drawing.commands.length = 0;
      reference.commands.length = 0;
      time += now === 1040 ? 0.16 : 0.08;
      runFrame(now);
      drawPrototype(reference.context, time);
      expect(drawing.commands).toEqual(reference.commands);
      expect(frames.size).toBe(1);
    }
  });

  it('stopper skjult og fortsetter uten tidshopp eller doble løkker når synlig', () => {
    render(<HealthCheckCampfire />);
    runFrame(0);
    runFrame(80);
    drawing.commands.length = 0;
    setHidden(true);
    expect(frames.size).toBe(0);
    runFrame(5000);
    expect(drawing.commands).toHaveLength(0);

    setHidden(false);
    setHidden(false);
    expect(frames.size).toBe(1);
    runFrame(10000);
    expect(drawing.commands).toHaveLength(0);
    runFrame(10080);
    const reference = createDrawingContext();
    drawPrototype(reference.context, 0.16);
    expect(drawing.commands).toEqual(reference.commands);
    expect(frames.size).toBe(1);
  });

  it('venter på synlig fane ved montering og stopper også før visibility-eventet', () => {
    hidden = true;
    render(<HealthCheckCampfire />);
    expect(frames.size).toBe(0);
    setHidden(false);
    expect(frames.size).toBe(1);
    drawing.commands.length = 0;
    hidden = true;
    runFrame(80);
    expect(frames.size).toBe(0);
    expect(drawing.commands).toHaveLength(0);
  });

  it('rydder siste frame og visibility-listener ved unmount, også for frame-ID 0', () => {
    const removeListener = vi.spyOn(document, 'removeEventListener');
    const { unmount } = render(<HealthCheckCampfire />);
    expect(frames.has(0)).toBe(true);
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(0);
    expect(frames.size).toBe(0);
    expect(removeListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    setHidden(false);
    expect(frames.size).toBe(0);
  });

  it('beholder bare én løkke i Strict Mode og ved rerender', () => {
    const { rerender, unmount } = render(<StrictMode><HealthCheckCampfire /></StrictMode>);
    expect(frames.size).toBe(1);
    rerender(<StrictMode><HealthCheckCampfire /></StrictMode>);
    runFrame(0);
    runFrame(80);
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    setHidden(false);
    expect(frames.size).toBe(0);
  });

  it('håndterer null context uten animasjon eller visibility-listener', () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    const addListener = vi.spyOn(document, 'addEventListener');
    const { unmount } = render(<HealthCheckCampfire />);
    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(addListener).not.toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(() => unmount()).not.toThrow();
  });
});
