import { useEffect, useRef } from 'react';

type Point = [number, number];

// Pixel geometry, palette, layer order and timing from the approved
// public/health-check-pixel-office-prototype.html (192 × 192).
function createDrawing(ctx: CanvasRenderingContext2D) {
  function rect(x: number, y: number, w: number, h: number, color: string) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  }

  function polygon(points: Point[], color: string) {
    ctx.fillStyle = color;
    const top = Math.floor(Math.min(...points.map(p => p[1])));
    const bottom = Math.ceil(Math.max(...points.map(p => p[1])));
    for (let y = top; y < bottom; y++) {
      const intersections: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if ((a[1] <= y + .5 && b[1] > y + .5) || (b[1] <= y + .5 && a[1] > y + .5)) {
          intersections.push(a[0] + (y + .5 - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
        }
      }
      intersections.sort((a, b) => a - b);
      for (let i = 0; i + 1 < intersections.length; i += 2) {
        const left = Math.round(intersections[i]), right = Math.round(intersections[i + 1]);
        ctx.fillRect(left, y, Math.max(1, right - left), 1);
      }
    }
  }

  function oval(x: number, y: number, rx: number, ry: number, color: string) {
    const points = Array.from({ length: 24 }, (_, i): Point => {
      const a = i * Math.PI / 12;
      return [x + Math.cos(a) * rx, y + Math.sin(a) * ry];
    });
    polygon(points, color);
  }

  function line(x0: number, y0: number, x1: number, y1: number, color: string, thickness = 1) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) rect(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, thickness, thickness, color);
  }

  const noise = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

  function ground(t: number) {
    rect(0, 0, 192, 192, '#191d37');
    oval(96, 151, 79, 24, '#22203a');
    oval(96, 151, 69, 21, '#34263e');
    oval(96, 150, 58, 17, '#4b2d43');
    oval(96, 147, 45, 12, '#673647');
    for (let i = 0; i < 210; i++) {
      const x = 17 + noise(i + 1) * 158, y = 130 + noise(i + 501) * 45;
      if (((x - 96) / 79) ** 2 + ((y - 151) / 24) ** 2 < 1) {
        rect(x, y, 2 + Math.floor(noise(i + 31) * 5), 1, ['#25223b', '#44293f', '#593143', '#35263d'][i % 4]);
      }
    }
    ctx.globalAlpha = .3 + Math.sin(t * 2.3) * .055;
    oval(96, 144, 39, 12, '#c56a36');
    ctx.globalAlpha = 1;
    oval(96, 144, 29, 8, '#291c2e');
    for (let i = 0; i < 34; i++) {
      const x = 73 + noise(i + 66) * 46, y = 135 + noise(i + 89) * 15;
      rect(x, y, 2, 1, i % 3 ? '#923b33' : '#f8953c');
    }
  }

  function log(x: number, y: number, angle: number, length: number, width: number, seed: number) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const p = (u: number, v: number): Point => [x + c * u - s * v, y + s * u + c * v];
    const shape = (points: Point[], color: string) => polygon(points.map(([u, v]) => p(u, v)), color);
    shape([[-3,-width/2],[length-3,-width/2-2],[length+3,-width/2+3],[length+4,width/2-1],[length-1,width/2+4],[0,width/2+3],[-4,width/2-2]], '#211d2f');
    shape([[0,-width/2+1],[length-3,-width/2],[length+1,-width/2+3],[length,width/2],[0,width/2]], '#6b3434');
    shape([[1,-width/2+2],[length-4,-width/2+1],[length-1,-1],[0,1]], '#b95b38');
    shape([[3,-width/2+2],[length-6,-width/2+2],[length-8,-width/2+5],[3,-width/2+5]], '#e48c4b');
    for (let i = 0; i < 14; i++) {
      const u = 3 + noise(i + seed) * (length - 8), v = -width/2 + 3 + noise(i + seed + 29) * (width - 5);
      const a = p(u,v), b = p(Math.min(length - 3, u + 3 + noise(i + 41) * 8), v + 1);
      line(...a, ...b, ['#773638','#e28343','#934431'][i % 3]);
    }
    // Cut end: faceted outline, nested growth rings, and a radial crack.
    const end: Point[] = [[-4,-4],[-1,-width/2],[5,-width/2+2],[8,-4],[8,4],[4,width/2],[-2,width/2-2],[-5,3]];
    shape(end, '#382331');
    shape(end.map(([u,v]) => [u*.76+1,v*.76]), '#a14b35');
    shape(end.map(([u,v]) => [u*.52+1,v*.52]), '#603035');
    shape(end.map(([u,v]) => [u*.27+1,v*.27]), '#bd6039');
    const a = p(1,1), b = p(-2,width/2-2);
    line(...a,...b,'#3a2532',2);
  }

  function smoke(t: number) {
    for (let ribbon = 0; ribbon < 2; ribbon++) {
      const points: Point[] = [];
      for (let i = 0; i <= 45; i++) {
        const h = i / 45;
        const x = 94 + ribbon * 10 + Math.sin(h * 12 - t * 1.25 + ribbon * 3) * (3 + h * 5) + h * 7;
        points.push([x, 102 - h * 77]);
      }
      const edge = points.map(([x,y], i): Point => [x + 3 + Math.sin(i / 8), y]).reverse();
      ctx.globalAlpha = ribbon ? .24 : .4;
      polygon([...points,...edge], '#494368');
    }
    ctx.globalAlpha = 1;
  }

  function fire(t: number) {
    const sway = Math.sin(t * 4) * 3 + Math.sin(t * 7) * 1.5;
    const lift = Math.sin(t * 5) * 3;
    // Three separate tongues, layered into red/orange/yellow/ivory silhouettes.
    const outline: Point[] = [
      [96,142],[82,140],[74,134],[71,126],[72,118],[68,108],[70,98],
      [76,107],[78,115],[81,108],[80,98],[85,86],[84,77],
      [88,68],[99+sway,57+lift],[96+sway,68],[100,77],[97,86],
      [105,95],[107,105],[106,114],[111,108],[113,97+lift],
      [120,110],[119,119],[124,126],[121,134],[111,140]
    ];
    polygon(outline, '#bd3836');
    polygon(outline.map(([x,y]) => [96 + (x-96)*.89, 141 + (y-141)*.96]), '#f35b35');
    polygon([[96,139],[84,136],[78,130],[77,123],[82,114],[84,107],[85,98],[91,85],
      [90,77],[96+sway,67+lift],[93,84],[96,94],[101,102],[99,113],
      [105,122],[113,116],[115,108],[116,123],[119,129],[110,136]], '#ff9a38');
    polygon([[96,138],[87,135],[82,130],[83,121],[88,112],[90,100],[94+sway*.4,87+lift],
      [94,106],[101,116],[103,126],[108,128],[110,121],[111,132],[104,137]], '#ffce50');
    polygon([[96,136],[89,133],[88,127],[92,119],[95+Math.sin(t*6)*2,112],
      [98,121],[103,128],[101,134]], '#fff1a1');
    polygon([[96,134],[93,132],[93,128],[96,123],[99,129],[98,133]], '#fff8cf');
    // Small separated flamelets and rising embers follow different cycles.
    for (let i = 0; i < 11; i++) {
      const phase = (t * (.18 + (i % 3)*.06) + i * .173) % 1;
      const x = 96 + Math.sin(i * 9.1) * (10 + phase * 22) + Math.sin(t * 2+i) * 3;
      const y = 120 - phase * (58 + i*3);
      ctx.globalAlpha = Math.min(1, (1-phase)*2);
      rect(x,y, i%3 ? 1 : 2, i%3 ? 2 : 3, i%2 ? '#ffc651' : '#f76a3b');
      if (i%3 === 0) rect(x-1,y+1,4,1,'#f99b42');
    }
    ctx.globalAlpha = 1;
  }

  return function draw(t: number) {
    ground(t);
    smoke(t);
    log(64,127,-.43,35,17,10);
    log(132,125,Math.PI+.39,34,18,80);
    log(53,141,-.05,42,19,140);
    log(143,140,Math.PI+.06,42,19,210);
    fire(t);
    log(75,158,-.86,29,20,280);
    log(117,158,Math.PI+.87,29,20,350);
    rect(94,144,4,2,'#ffc260');
    rect(93,148,6,1,'#d4773c');
  };
}

export function HealthCheckCampfire() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    const draw = createDrawing(ctx);
    let time = 0;
    let lastTime: number | null = null;
    let frameId: number | null = null;

    function tick(now: number) {
      frameId = null;
      if (document.hidden) return;
      if (lastTime === null) lastTime = now;
      if (now - lastTime >= 80) {
        time += Math.min((now - lastTime) / 1000, .16);
        lastTime = now;
        draw(time);
      }
      frameId = requestAnimationFrame(tick);
    }

    function stopMotion() {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
      lastTime = null;
    }

    function syncMotion() {
      stopMotion();
      if (!document.hidden) frameId = requestAnimationFrame(tick);
    }

    document.addEventListener('visibilitychange', syncMotion);
    draw(0);
    syncMotion();

    return () => {
      stopMotion();
      document.removeEventListener('visibilitychange', syncMotion);
    };
  }, []);

  return (
    <figure className="m-0 overflow-hidden rounded-2xl bg-[#191d37]" aria-label="Et pixelbål på mørk bakgrunn">
      <canvas
        ref={canvasRef}
        width={192}
        height={192}
        role="img"
        aria-label="Et bål med seks vedkubber, blafrende flammer, røyk og små glør som stiger."
        className="block aspect-square h-auto w-full"
        style={{ imageRendering: 'pixelated' }}
      >
        Et varmt bål med vedkubber og flammer på mørk bakgrunn.
      </canvas>
    </figure>
  );
}
