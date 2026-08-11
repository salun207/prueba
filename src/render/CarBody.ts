import * as THREE from 'three';
import type { BodyParams } from '../data/cars';

/**
 * Carrocería generada por lofting.
 *
 * En vez de apilar cajas, se define la silueta del auto con estaciones a lo
 * largo (ancho y altura del techo en cada punto) y se cose una superficie entre
 * ellas. Sale capó, parabrisas inclinado, techo, luneta y baúl como una sola
 * cáscara continua, que es lo que hace que se lea como un auto y no como una
 * caja con una caja encima.
 */

interface Station {
  /** 0 = cola, 1 = trompa. */
  t: number;
  /** Semiancho, fracción del ancho total. */
  w: number;
  /** Altura del techo en metros. */
  top: number;
  /** Estrechamiento del techo respecto del hombro. */
  taper: number;
  /** Marca las estaciones de la cabina (donde van los vidrios). */
  cabin: boolean;
}

export type Silhouette =
  | 'coupe' | 'hatch' | 'sedan' | 'muscle' | 'gt' | 'race' | 'hyper'
  | 'van' | 'truck';

/** Siluetas laterales. Cada una cambia de verdad la forma, no solo la escala. */
const SHAPES: Record<Silhouette, Station[]> = {
  coupe: [
    { t: 0.00, w: 0.80, top: 0.70, taper: 0.86, cabin: false },
    { t: 0.07, w: 0.95, top: 0.80, taper: 0.90, cabin: false },
    { t: 0.20, w: 1.00, top: 0.83, taper: 0.92, cabin: false },
    { t: 0.32, w: 1.00, top: 1.00, taper: 0.80, cabin: true },
    { t: 0.44, w: 0.98, top: 1.22, taper: 0.74, cabin: true },
    { t: 0.60, w: 0.97, top: 1.24, taper: 0.74, cabin: true },
    { t: 0.70, w: 0.99, top: 1.02, taper: 0.80, cabin: true },
    { t: 0.84, w: 1.00, top: 0.84, taper: 0.92, cabin: false },
    { t: 0.94, w: 0.96, top: 0.79, taper: 0.90, cabin: false },
    { t: 1.00, w: 0.78, top: 0.72, taper: 0.86, cabin: false },
  ],
  hatch: [
    { t: 0.00, w: 0.84, top: 0.88, taper: 0.88, cabin: false },
    { t: 0.08, w: 0.97, top: 1.10, taper: 0.82, cabin: true },
    { t: 0.24, w: 1.00, top: 1.28, taper: 0.76, cabin: true },
    { t: 0.46, w: 1.00, top: 1.32, taper: 0.76, cabin: true },
    { t: 0.64, w: 0.99, top: 1.24, taper: 0.78, cabin: true },
    { t: 0.74, w: 1.00, top: 0.98, taper: 0.86, cabin: true },
    { t: 0.87, w: 0.99, top: 0.84, taper: 0.92, cabin: false },
    { t: 1.00, w: 0.80, top: 0.76, taper: 0.88, cabin: false },
  ],
  sedan: [
    { t: 0.00, w: 0.82, top: 0.74, taper: 0.88, cabin: false },
    { t: 0.10, w: 0.97, top: 0.86, taper: 0.90, cabin: false },
    { t: 0.24, w: 1.00, top: 0.90, taper: 0.92, cabin: false },
    { t: 0.34, w: 1.00, top: 1.08, taper: 0.82, cabin: true },
    { t: 0.46, w: 0.99, top: 1.30, taper: 0.78, cabin: true },
    { t: 0.62, w: 0.99, top: 1.31, taper: 0.78, cabin: true },
    { t: 0.72, w: 1.00, top: 1.08, taper: 0.84, cabin: true },
    { t: 0.86, w: 1.00, top: 0.88, taper: 0.92, cabin: false },
    { t: 1.00, w: 0.80, top: 0.78, taper: 0.88, cabin: false },
  ],
  muscle: [
    { t: 0.00, w: 0.86, top: 0.78, taper: 0.90, cabin: false },
    { t: 0.08, w: 1.00, top: 0.90, taper: 0.92, cabin: false },
    { t: 0.24, w: 1.00, top: 0.93, taper: 0.94, cabin: false },
    { t: 0.36, w: 1.00, top: 1.10, taper: 0.84, cabin: true },
    { t: 0.48, w: 0.99, top: 1.28, taper: 0.80, cabin: true },
    { t: 0.62, w: 0.99, top: 1.28, taper: 0.80, cabin: true },
    { t: 0.72, w: 1.00, top: 1.06, taper: 0.86, cabin: true },
    { t: 0.88, w: 1.00, top: 0.92, taper: 0.94, cabin: false },
    { t: 1.00, w: 0.88, top: 0.86, taper: 0.92, cabin: false },
  ],
  gt: [
    { t: 0.00, w: 0.78, top: 0.72, taper: 0.86, cabin: false },
    { t: 0.08, w: 0.94, top: 0.82, taper: 0.88, cabin: false },
    { t: 0.22, w: 1.00, top: 0.86, taper: 0.90, cabin: false },
    { t: 0.34, w: 1.00, top: 1.02, taper: 0.80, cabin: true },
    { t: 0.48, w: 0.98, top: 1.20, taper: 0.72, cabin: true },
    { t: 0.62, w: 0.97, top: 1.20, taper: 0.72, cabin: true },
    { t: 0.74, w: 0.99, top: 0.96, taper: 0.80, cabin: true },
    { t: 0.88, w: 1.00, top: 0.78, taper: 0.90, cabin: false },
    { t: 1.00, w: 0.74, top: 0.68, taper: 0.84, cabin: false },
  ],
  race: [
    { t: 0.00, w: 0.90, top: 0.72, taper: 0.92, cabin: false },
    { t: 0.10, w: 1.00, top: 0.80, taper: 0.92, cabin: false },
    { t: 0.26, w: 1.00, top: 0.84, taper: 0.92, cabin: false },
    { t: 0.36, w: 1.00, top: 1.00, taper: 0.78, cabin: true },
    { t: 0.50, w: 0.98, top: 1.16, taper: 0.72, cabin: true },
    { t: 0.64, w: 0.98, top: 1.14, taper: 0.72, cabin: true },
    { t: 0.76, w: 1.00, top: 0.90, taper: 0.80, cabin: true },
    { t: 0.90, w: 1.00, top: 0.72, taper: 0.92, cabin: false },
    { t: 1.00, w: 0.92, top: 0.66, taper: 0.94, cabin: false },
  ],
  // Utilitario: caja larga y alta con una trompa corta. Sin esto un camión
  // sale de estirar un cupé y queda como una gota deforme.
  van: [
    { t: 0.00, w: 0.96, top: 1.30, taper: 0.96, cabin: false },
    { t: 0.04, w: 1.00, top: 1.34, taper: 0.96, cabin: false },
    { t: 0.55, w: 1.00, top: 1.34, taper: 0.96, cabin: false },
    { t: 0.62, w: 1.00, top: 1.32, taper: 0.94, cabin: true },
    { t: 0.80, w: 1.00, top: 1.26, taper: 0.90, cabin: true },
    { t: 0.90, w: 0.99, top: 0.96, taper: 0.94, cabin: false },
    { t: 1.00, w: 0.92, top: 0.86, taper: 0.94, cabin: false },
  ],
  // Camión: caja de carga con cabina más baja adelante y un escalón entre las dos.
  truck: [
    { t: 0.00, w: 0.98, top: 1.42, taper: 0.98, cabin: false },
    { t: 0.03, w: 1.00, top: 1.46, taper: 0.98, cabin: false },
    { t: 0.66, w: 1.00, top: 1.46, taper: 0.98, cabin: false },
    { t: 0.68, w: 0.98, top: 1.18, taper: 0.96, cabin: false },
    { t: 0.74, w: 0.98, top: 1.16, taper: 0.94, cabin: true },
    { t: 0.90, w: 0.98, top: 1.10, taper: 0.90, cabin: true },
    { t: 0.96, w: 0.96, top: 0.84, taper: 0.94, cabin: false },
    { t: 1.00, w: 0.90, top: 0.78, taper: 0.94, cabin: false },
  ],
  hyper: [
    { t: 0.00, w: 0.86, top: 0.74, taper: 0.90, cabin: false },
    { t: 0.10, w: 1.00, top: 0.86, taper: 0.90, cabin: false },
    { t: 0.26, w: 1.00, top: 0.94, taper: 0.84, cabin: false },
    { t: 0.38, w: 0.99, top: 1.06, taper: 0.74, cabin: true },
    { t: 0.52, w: 0.97, top: 1.14, taper: 0.68, cabin: true },
    { t: 0.66, w: 0.97, top: 1.10, taper: 0.68, cabin: true },
    { t: 0.78, w: 0.99, top: 0.86, taper: 0.78, cabin: true },
    { t: 0.90, w: 1.00, top: 0.66, taper: 0.90, cabin: false },
    { t: 1.00, w: 0.80, top: 0.58, taper: 0.88, cabin: false },
  ],
};

const SILL = 0.26;
const SHOULDER_FRAC = 0.55;

/** Sección transversal: hexágono con panza, hombro y techo. */
function ring(hw: number, topW: number, shoulderY: number, topY: number): [number, number][] {
  return [
    [hw * 0.86, SILL],
    [hw, shoulderY],
    [topW, topY],
    [-topW, topY],
    [-hw, shoulderY],
    [-hw * 0.86, SILL],
  ];
}

export interface CarMeshes {
  body: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  /** Y del techo en el centro de la cabina: para ubicar accesorios. */
  roofY: number;
  cabinCenterZ: number;
}

export function buildCarBody(body: BodyParams, silhouette: Silhouette): CarMeshes {
  const stations = SHAPES[silhouette] ?? SHAPES.coupe;
  const L = body.length;
  const W = body.width;
  const scaleY = body.height / 1.26;

  const rings: { z: number; pts: [number, number][]; st: Station }[] = [];
  for (const st of stations) {
    const z = (st.t - 0.5) * L;
    const hw = (W / 2) * st.w;
    const topY = st.top * scaleY;
    const shoulderY = SILL + (topY - SILL) * SHOULDER_FRAC;
    rings.push({ z, pts: ring(hw, hw * st.taper, shoulderY, topY), st });
  }

  const pos: number[] = [];
  const idx: number[] = [];
  const n = rings[0].pts.length;

  const pushVert = (x: number, y: number, z: number): number => {
    pos.push(x, y, z);
    return pos.length / 3 - 1;
  };

  // Anillos
  const ringBase: number[] = [];
  for (const r of rings) {
    ringBase.push(pos.length / 3);
    for (const [x, y] of r.pts) pushVert(x, y, r.z);
  }

  // Costura entre anillos consecutivos, incluida la panza (último → primero)
  for (let i = 0; i < rings.length - 1; i++) {
    const a = ringBase[i];
    const b = ringBase[i + 1];
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n;
      idx.push(a + k, b + k, b + k2);
      idx.push(a + k, b + k2, a + k2);
    }
  }

  // Tapas: abanico desde el centro de cada extremo
  const capEnds: [number, boolean][] = [[0, true], [rings.length - 1, false]];
  for (const [ri, flip] of capEnds) {
    const r = rings[ri];
    const cy = r.pts.reduce((s, p) => s + p[1], 0) / n;
    const c = pushVert(0, cy, r.z);
    const base = ringBase[ri];
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n;
      if (flip) idx.push(c, base + k2, base + k);
      else idx.push(c, base + k, base + k2);
    }
  }

  const bodyGeo = new THREE.BufferGeometry();
  bodyGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bodyGeo.setIndex(idx);
  bodyGeo.computeVertexNormals();

  // ── Vidrios: banda pegada al costado de la cabina más parabrisas y luneta ──
  const gp: number[] = [];
  const gi: number[] = [];
  const cabin = rings.filter((r) => r.st.cabin);
  const push = (x: number, y: number, z: number): number => {
    gp.push(x, y, z);
    return gp.length / 3 - 1;
  };
  const quad = (a: number, b: number, c: number, d: number): void => {
    gi.push(a, b, c, a, c, d);
  };

  for (let i = 0; i < cabin.length - 1; i++) {
    const r0 = cabin[i];
    const r1 = cabin[i + 1];
    for (const side of [1, -1]) {
      const s = side > 0 ? 1 : 4; // índice del hombro
      const t = side > 0 ? 2 : 3; // índice del techo
      const e = 0.012 * side;
      const a = push(r0.pts[s][0] + e, r0.pts[s][1] + 0.02, r0.z);
      const b = push(r0.pts[t][0] + e, r0.pts[t][1] - 0.03, r0.z);
      const c = push(r1.pts[t][0] + e, r1.pts[t][1] - 0.03, r1.z);
      const d = push(r1.pts[s][0] + e, r1.pts[s][1] + 0.02, r1.z);
      if (side > 0) quad(a, b, c, d);
      else quad(d, c, b, a);
    }
  }

  // Parabrisas y luneta: cierran las puntas de la cabina
  for (const [r, front] of [[cabin[cabin.length - 1], true], [cabin[0], false]] as [typeof cabin[0], boolean][]) {
    const dz = front ? 0.02 : -0.02;
    const a = push(r.pts[1][0], r.pts[1][1] + 0.02, r.z + dz);
    const b = push(r.pts[2][0], r.pts[2][1] - 0.03, r.z + dz);
    const c = push(r.pts[3][0], r.pts[3][1] - 0.03, r.z + dz);
    const d = push(r.pts[4][0], r.pts[4][1] + 0.02, r.z + dz);
    if (front) quad(a, b, c, d);
    else quad(d, c, b, a);
  }

  const glassGeo = new THREE.BufferGeometry();
  glassGeo.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
  glassGeo.setIndex(gi);
  glassGeo.computeVertexNormals();

  const roof = cabin.reduce((m, r) => Math.max(m, r.pts[2][1]), 0);
  const cz = cabin.reduce((s, r) => s + r.z, 0) / Math.max(1, cabin.length);

  return { body: bodyGeo, glass: glassGeo, roofY: roof, cabinCenterZ: cz };
}

/** Rueda con llanta de rayos: se ve girar, que es lo que importa. */
export function buildWheel(radius: number, width: number, spokes = 5): {
  tire: THREE.BufferGeometry;
  rim: THREE.BufferGeometry;
} {
  const tire = new THREE.CylinderGeometry(radius, radius, width, 20, 1);
  tire.rotateZ(Math.PI / 2);

  const parts: THREE.BufferGeometry[] = [];
  const hub = new THREE.CylinderGeometry(radius * 0.34, radius * 0.34, width * 1.04, 14);
  hub.rotateZ(Math.PI / 2);
  parts.push(hub);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const spoke = new THREE.BoxGeometry(width * 0.6, radius * 1.34, radius * 0.2);
    spoke.rotateX(Math.PI / 2);
    spoke.rotateX(0);
    spoke.rotateZ(0);
    const m = new THREE.Matrix4().makeRotationX(a);
    spoke.applyMatrix4(m);
    parts.push(spoke);
  }
  const rim = mergeGeometries(parts);
  return { tire, rim };
}

/** Merge simple: three/addons no está disponible, y son pocas piezas. */
export function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const g of list) {
    const base = pos.length / 3;
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    const index = g.getIndex();
    if (index) for (let i = 0; i < index.count; i++) idx.push(base + index.getX(i));
    else for (let i = 0; i < p.count; i++) idx.push(base + i);
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
