import * as THREE from 'three';

/** Todas las texturas se generan en canvas al iniciar. Cero archivos. */

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return [c, c.getContext('2d')!];
}

let radialCache: THREE.Texture | null = null;
export function radialTexture(): THREE.Texture {
  if (radialCache) return radialCache;
  const [c, ctx] = canvas(128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  radialCache = tex;
  return tex;
}

let shadowCache: THREE.Texture | null = null;
export function shadowTexture(): THREE.Texture {
  if (shadowCache) return shadowCache;
  const [c, ctx] = canvas(128);
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.75)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  shadowCache = tex;
  return tex;
}

let smokeCache: THREE.Texture | null = null;
export function smokeTexture(): THREE.Texture {
  if (smokeCache) return smokeCache;
  const [c, ctx] = canvas(64);
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  smokeCache = tex;
  return tex;
}

let asphaltCache: THREE.Texture | null = null;
export function asphaltTexture(): THREE.Texture {
  if (asphaltCache) return asphaltCache;
  const size = 256;
  const [c, ctx] = canvas(size);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const n = 138 + Math.floor((Math.random() - 0.5) * 26);
    img.data[i * 4] = n;
    img.data[i * 4 + 1] = n + 2;
    img.data[i * 4 + 2] = n + 8;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  asphaltCache = tex;
  return tex;
}
