import * as THREE from 'three';

/**
 * Todas las texturas se generan en canvas al iniciar. Cero archivos, y por lo
 * tanto cero peso en el bundle: el detalle sale de ruido fBm y de dibujar
 * encima con Canvas 2D, que para superficies (asfalto, hormigón, pasto) da
 * mucho mejor resultado que una foto tileada mal.
 */

// ─────────────────────────── ruido ───────────────────────────

function hash2(x: number, y: number, seed: number): number {
  let h = x * 374761393 + y * 668265263 + seed * 2246822519;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h ^ (h >>> 16)) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Ruido de valor con tiling exacto sobre `period`. */
function valueNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const wrap = (v: number): number => ((v % period) + period) % period;
  const x0 = wrap(xi);
  const y0 = wrap(yi);
  const x1 = wrap(xi + 1);
  const y1 = wrap(yi + 1);
  const sx = smooth(xf);
  const sy = smooth(yf);
  const n00 = hash2(x0, y0, seed);
  const n10 = hash2(x1, y0, seed);
  const n01 = hash2(x0, y1, seed);
  const n11 = hash2(x1, y1, seed);
  return (n00 * (1 - sx) + n10 * sx) * (1 - sy) + (n01 * (1 - sx) + n11 * sx) * sy;
}

function fbm(x: number, y: number, octaves: number, basePeriod: number, seed: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let period = basePeriod;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x * freq, y * freq, period, seed + o * 71) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
    period *= 2;
  }
  return sum / norm;
}

// ─────────────────────────── helpers ───────────────────────────

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return [c, c.getContext('2d')!];
}

function toTexture(canvas: HTMLCanvasElement, repeat = 1): THREE.Texture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  return tex;
}

interface NoiseSpec {
  size: number;
  /** Períodos de ruido, en celdas de la textura. */
  cells: number;
  octaves: number;
  seed: number;
  base: [number, number, number];
  /** Cuánto varía el color con el ruido, por canal. */
  spread: [number, number, number];
  /** Grano fino pixel a pixel. */
  grain: number;
}

function noiseCanvas(spec: NoiseSpec): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const [canvas, ctx] = makeCanvas(spec.size);
  const img = ctx.createImageData(spec.size, spec.size);
  const step = spec.cells / spec.size;
  for (let y = 0; y < spec.size; y++) {
    for (let x = 0; x < spec.size; x++) {
      const n = fbm(x * step, y * step, spec.octaves, spec.cells, spec.seed);
      const g = (hash2(x, y, spec.seed + 999) - 0.5) * spec.grain;
      const i = (y * spec.size + x) * 4;
      img.data[i] = clamp255(spec.base[0] + (n - 0.5) * spec.spread[0] + g);
      img.data[i + 1] = clamp255(spec.base[1] + (n - 0.5) * spec.spread[1] + g);
      img.data[i + 2] = clamp255(spec.base[2] + (n - 0.5) * spec.spread[2] + g);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return [canvas, ctx];
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

const cache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

// ─────────────────────────── superficies ───────────────────────────

/** Asfalto: árido grueso, manchas de reparación y alguna fisura. */
export function asphaltTexture(): THREE.Texture {
  return cached('asphalt', () => {
    const size = 512;
    const [canvas, ctx] = noiseCanvas({
      size, cells: 64, octaves: 4, seed: 11,
      base: [138, 141, 152], spread: [40, 40, 46], grain: 24,
    });

    // Árido: piedritas claras y oscuras
    for (let i = 0; i < 5200; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() * 1.5 + 0.3;
      const light = Math.random() > 0.5;
      ctx.fillStyle = light ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Parches de reparación
    for (let i = 0; i < 5; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.fillStyle = `rgba(${60 + Math.random() * 30},${60 + Math.random() * 30},${64 + Math.random() * 30},0.14)`;
      ctx.beginPath();
      ctx.ellipse(x, y, 30 + Math.random() * 70, 20 + Math.random() * 50, Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fisuras
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    for (let i = 0; i < 14; i++) {
      ctx.lineWidth = Math.random() * 1.4 + 0.4;
      ctx.beginPath();
      let x = Math.random() * size;
      let y = Math.random() * size;
      ctx.moveTo(x, y);
      for (let k = 0; k < 8; k++) {
        x += (Math.random() - 0.5) * 46;
        y += (Math.random() - 0.5) * 46;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    return toTexture(canvas);
  });
}

/** Hormigón: paños con juntas. */
export function concreteTexture(): THREE.Texture {
  return cached('concrete', () => {
    const size = 512;
    const [canvas, ctx] = noiseCanvas({
      size, cells: 32, octaves: 4, seed: 23,
      base: [186, 180, 168], spread: [34, 32, 30], grain: 14,
    });
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 2; i++) {
      const p = (i * size) / 2;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
    }
    return toTexture(canvas);
  });
}

/** Pasto seco de atardecer, con matas. */
export function grassTexture(): THREE.Texture {
  return cached('grass', () => {
    const size = 512;
    const [canvas, ctx] = noiseCanvas({
      size, cells: 24, octaves: 5, seed: 37,
      base: [122, 134, 78], spread: [58, 56, 40], grain: 22,
    });
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(150,164,96,0.5)' : 'rgba(84,94,54,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 4, y - Math.random() * 5);
      ctx.stroke();
    }
    return toTexture(canvas);
  });
}

/** Tierra con piedras. */
export function dirtTexture(): THREE.Texture {
  return cached('dirt', () => {
    const size = 512;
    const [canvas, ctx] = noiseCanvas({
      size, cells: 20, octaves: 5, seed: 53,
      base: [166, 122, 78], spread: [62, 54, 44], grain: 24,
    });
    for (let i = 0; i < 1400; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() * 2.6 + 0.5;
      ctx.fillStyle = `rgba(${110 + Math.random() * 60},${92 + Math.random() * 40},${72 + Math.random() * 30},0.55)`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    return toTexture(canvas);
  });
}

/** Fachada con grilla de ventanas, algunas encendidas. */
export function facadeTexture(): THREE.Texture {
  return cached('facade', () => {
    const size = 512;
    const [canvas, ctx] = noiseCanvas({
      size, cells: 16, octaves: 3, seed: 71,
      base: [196, 186, 168], spread: [24, 24, 22], grain: 10,
    });

    const cols = 8;
    const rows = 8;
    const cw = size / cols;
    const ch = size / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw + cw * 0.22;
        const y = r * ch + ch * 0.2;
        const w = cw * 0.56;
        const h = ch * 0.5;
        const lit = Math.random();
        if (lit > 0.78) {
          const warm = 190 + Math.random() * 60;
          ctx.fillStyle = `rgb(${warm},${warm * 0.82},${warm * 0.55})`;
        } else {
          const dark = 40 + Math.random() * 28;
          ctx.fillStyle = `rgb(${dark},${dark + 4},${dark + 12})`;
        }
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, h);
        // Antepecho
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(x - 1, y + h, w + 2, 3);
      }
      // Losa entre pisos
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fillRect(0, r * ch + ch * 0.86, size, ch * 0.08);
    }
    return toTexture(canvas);
  });
}

/**
 * Calzada completa de autopista, con las líneas pintadas adentro.
 *
 * La U cubre el ancho total de la calzada y la V se repite cada 40 m, así que
 * una sola textura resuelve carriles, banda amarilla y bordes sin necesidad de
 * geometría por raya. Todo se calcula en metros y recién ahí se pasa a píxeles,
 * para que el marcado tenga el ancho real sin importar cuántos carriles haya.
 */
export function highwayTexture(lanes: number, twoWay: boolean, laneWidth = 3.7): THREE.Texture {
  return cached(`highway_${lanes}_${twoWay}_${laneWidth}`, () => {
    const W = 512;
    const H = 1024;
    const SPAN = 40; // metros de camino que cubre la textura a lo largo
    const roadWidth = lanes * laneWidth;
    const pxX = W / roadWidth;
    const pxY = H / SPAN;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // ── Asfalto ──
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const n = fbm((x / W) * 40, (y / H) * 40, 4, 40, 17);
        const g = (hash2(x, y, 4242) - 0.5) * 26;
        const i = (y * W + x) * 4;
        img.data[i] = clamp255(130 + (n - 0.5) * 38 + g);
        img.data[i + 1] = clamp255(133 + (n - 0.5) * 38 + g);
        img.data[i + 2] = clamp255(144 + (n - 0.5) * 42 + g);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Árido
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.16)';
      ctx.beginPath();
      ctx.arc(x, y, Math.random() * 1.4 + 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Huellas de rodada: el asfalto se pule donde pasan las ruedas ──
    for (let l = 0; l < lanes; l++) {
      const centerM = (l + 0.5) * laneWidth;
      for (const off of [-0.78, 0.78]) {
        const cx = (centerM + off) * pxX;
        const halfPx = 0.36 * pxX;
        const grd = ctx.createLinearGradient(cx - halfPx, 0, cx + halfPx, 0);
        grd.addColorStop(0, 'rgba(30,32,38,0)');
        grd.addColorStop(0.5, 'rgba(30,32,38,0.2)');
        grd.addColorStop(1, 'rgba(30,32,38,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(cx - halfPx, 0, halfPx * 2, H);
      }
    }

    // ── Juntas longitudinales entre paños de pavimento ──
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = Math.max(1, 0.06 * pxX);
    for (let l = 1; l < lanes; l++) {
      const x = l * laneWidth * pxX;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    // ── Marcado ──
    const paint = (xM: number, widthM: number, y0: number, h: number, color: string): void => {
      ctx.fillStyle = color;
      ctx.fillRect((xM - widthM / 2) * pxX, y0, Math.max(1.5, widthM * pxX), h);
    };
    /** Línea discontinua: 4 m pintados, 6 m de vacío. Cierra justo en 40 m. */
    const dashed = (xM: number, widthM: number, color: string): void => {
      for (let k = 0; k < 4; k++) {
        paint(xM, widthM, k * 10 * pxY, 4 * pxY, color);
      }
    };

    const white = 'rgba(232,232,226,0.9)';
    const yellow = 'rgba(226,182,58,0.92)';

    // Bordes
    paint(0.4, 0.16, 0, H, white);
    paint(roadWidth - 0.4, 0.16, 0, H, white);

    // Divisorias
    const middle = lanes / 2;
    for (let l = 1; l < lanes; l++) {
      const x = l * laneWidth;
      if (twoWay && l === middle) {
        // Doble amarilla: prohibido cruzar… lo cual es exactamente el punto.
        paint(x - 0.16, 0.13, 0, H, yellow);
        paint(x + 0.16, 0.13, 0, H, yellow);
      } else {
        dashed(x, 0.13, white);
      }
    }

    // ── Desgaste: la pintura nunca está entera ──
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      ctx.fillStyle = `rgba(120,123,133,${Math.random() * 0.5})`;
      ctx.fillRect(x, y, Math.random() * 4 + 1, Math.random() * 3 + 1);
    }

    // ── Manchas de goma y aceite ──
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      ctx.fillStyle = `rgba(20,20,24,${0.05 + Math.random() * 0.1})`;
      ctx.beginPath();
      ctx.ellipse(x, y, Math.random() * 26 + 6, Math.random() * 50 + 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  });
}

/** Rayas de obra para las barreras. */
export function stripeTexture(): THREE.Texture {
  return cached('stripe', () => {
    const size = 128;
    const [canvas, ctx] = makeCanvas(size);
    ctx.fillStyle = '#e8e2d4';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#d2453a';
    for (let i = -size; i < size * 2; i += 32) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 16, 0);
      ctx.lineTo(i + 16 + size, size);
      ctx.lineTo(i + size, size);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = 'rgba(0,0,0,0.09)';
      ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
    return toTexture(canvas);
  });
}

/** Contenedor: chapa corrugada con óxido. */
export function ribbedTexture(): THREE.Texture {
  return cached('ribbed', () => {
    const size = 256;
    const [canvas, ctx] = noiseCanvas({
      size, cells: 16, octaves: 3, seed: 91,
      base: [225, 225, 225], spread: [22, 22, 22], grain: 12,
    });
    for (let x = 0; x < size; x += 16) {
      const grd = ctx.createLinearGradient(x, 0, x + 16, 0);
      grd.addColorStop(0, 'rgba(0,0,0,0.28)');
      grd.addColorStop(0.5, 'rgba(255,255,255,0.16)');
      grd.addColorStop(1, 'rgba(0,0,0,0.28)');
      ctx.fillStyle = grd;
      ctx.fillRect(x, 0, 16, size);
    }
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(${110 + Math.random() * 50},${60 + Math.random() * 30},30,${Math.random() * 0.3})`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * size, Math.random() * size, Math.random() * 14 + 3, Math.random() * 10 + 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return toTexture(canvas);
  });
}

// ─────────────────────────── sprites ───────────────────────────

export function radialTexture(): THREE.Texture {
  return cached('radial', () => {
    const [c, ctx] = makeCanvas(128);
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

export function shadowTexture(): THREE.Texture {
  return cached('shadow', () => {
    const [c, ctx] = makeCanvas(128);
    const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
    g.addColorStop(0, 'rgba(0,0,0,0.75)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  });
}

/** Humo: bocha suave con algo de estructura para que no parezca una bola. */
export function smokeTexture(): THREE.Texture {
  return cached('smoke', () => {
    const size = 128;
    const [c, ctx] = makeCanvas(size);
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x - size / 2) / (size / 2);
        const dy = (y - size / 2) / (size / 2);
        const d = Math.hypot(dx, dy);
        const n = fbm((x / size) * 6, (y / size) * 6, 4, 6, 5);
        const a = Math.max(0, 1 - d) ** 1.7 * (0.55 + n * 0.75);
        const i = (y * size + x) * 4;
        img.data[i] = 255;
        img.data[i + 1] = 255;
        img.data[i + 2] = 255;
        img.data[i + 3] = clamp255(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}
