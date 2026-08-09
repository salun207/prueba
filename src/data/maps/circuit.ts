import { Rng } from '../../core/Rng';
import { pointSegmentDistance } from '../../lib/math';
import {
  Surface,
  type Destructible,
  type MapDefinition,
  type Obstacle,
  type RoadSegment,
  type ZoneDef,
} from '../../sim/World';

/**
 * Circuitos cerrados generados a partir de un radio que varía con el ángulo:
 *
 *   r(θ) = R0 + A1·sin(2θ + φ1) + A2·sin(3θ + φ2)
 *
 * Sale una pista cerrada y suave por construcción, con curvatura variable: hay
 * curvones largos y horquillas cerradas sin tener que dibujar nada a mano. Es
 * exactamente lo que necesita un circuito de drift — la geometría no repite y
 * siempre podés encadenar.
 */

export interface CircuitShape {
  name: string;
  half: number;
  /** Radio base en metros. */
  r0: number;
  a1: number;
  phase1: number;
  a2: number;
  phase2: number;
  /** Ancho de pista. Más ancho = más fácil. */
  width: number;
  /** Ensancha las curvas cerradas para que perdonen. */
  widenTight: number;
  surface: Surface;
  /** Color del terreno alrededor: 'grass' o 'dirt'. */
  terrain: 'grass' | 'dirt';
  samples: number;
  seed: number;
  /** Muros de gomas a los costados (clipping points). */
  barriers: boolean;
}

function radiusAt(s: CircuitShape, a: number): number {
  return s.r0 + s.a1 * Math.sin(2 * a + s.phase1) + s.a2 * Math.sin(3 * a + s.phase2);
}

function point(s: CircuitShape, a: number): [number, number] {
  const r = radiusAt(s, a);
  return [Math.cos(a) * r, Math.sin(a) * r];
}

/** Ancho local: las curvas cerradas se ensanchan para que no castiguen. */
function widthAt(s: CircuitShape, a: number): number {
  const h = 0.02;
  const [x0, z0] = point(s, a - h);
  const [x1, z1] = point(s, a);
  const [x2, z2] = point(s, a + h);
  const d1x = x1 - x0, d1z = z1 - z0;
  const d2x = x2 - x1, d2z = z2 - z1;
  const len = Math.hypot(d1x, d1z) || 1;
  // Cambio de dirección entre segmentos ≈ curvatura
  const turn = Math.abs(Math.atan2(d1x * d2z - d1z * d2x, d1x * d2x + d1z * d2z)) / len;
  return s.width + Math.min(s.widenTight, turn * 480);
}

export function buildCircuit(s: CircuitShape): MapDefinition {
  const rng = new Rng(s.seed);
  const roads: RoadSegment[] = [];
  const obstacles: Obstacle[] = [];
  const destructibles: Destructible[] = [];
  const lights: { x: number; z: number; color: number }[] = [];

  const pts: [number, number][] = [];
  const widths: number[] = [];
  for (let i = 0; i < s.samples; i++) {
    const a = (i / s.samples) * Math.PI * 2;
    pts.push(point(s, a));
    widths.push(widthAt(s, a));
  }

  for (let i = 0; i < s.samples; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % s.samples];
    roads.push({
      ax, az, bx, bz,
      width: (widths[i] + widths[(i + 1) % s.samples]) * 0.5,
      surface: s.surface,
    });
  }

  // ── Muros de gomas: son los clipping points, lo que hace que raspar rinda ──
  if (s.barriers) {
    for (let i = 0; i < s.samples; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[(i + 1) % s.samples];
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len;
      const uz = dz / len;
      const px = -uz;
      const pz = ux;
      const half = widths[i] * 0.5 + 1.6;
      const rot = -Math.atan2(ux, uz);

      for (const side of [1, -1]) {
        obstacles.push({
          x: ax + ux * len * 0.5 + px * half * side,
          z: az + uz * len * 0.5 + pz * half * side,
          hw: 0.55,
          hd: len * 0.55,
          rot,
          height: 0.95,
          kind: 'barrier',
          colorSeed: (i % 2) * 0.9,
        });
      }

      // Conos de apex en el interior de las curvas
      if (i % 5 === 0) {
        destructibles.push({
          x: ax + px * (half - 1.2) * -1,
          z: az + pz * (half - 1.2) * -1,
          kind: 'cone',
          radius: 0.7,
          hype: 50,
        });
      }
      if (i % 9 === 0) {
        lights.push({
          x: ax + px * (half + 3),
          z: az + pz * (half + 3),
          color: 0xffd08a,
        });
      }
    }
  }

  // ── Terreno y decoración fuera de pista ──
  const onTrack = (x: number, z: number, pad: number): boolean => {
    for (let i = 0; i < roads.length; i++) {
      const r = roads[i];
      if (pointSegmentDistance(x, z, r.ax, r.az, r.bx, r.bz) < r.width * 0.5 + pad) return true;
    }
    return false;
  };

  const deco = s.terrain === 'grass' ? 'planter' : 'container';
  for (let i = 0; i < 220; i++) {
    const x = rng.range(-s.half + 20, s.half - 20);
    const z = rng.range(-s.half + 20, s.half - 20);
    if (onTrack(x, z, 14)) continue;
    obstacles.push({
      x, z,
      hw: rng.range(1.5, 5),
      hd: rng.range(1.5, 5),
      rot: rng.next() * Math.PI,
      height: rng.range(2.5, 9),
      kind: deco,
      colorSeed: rng.next(),
    });
  }

  // Muros del borde
  const H = s.half;
  obstacles.push({ x: 0, z: -H - 2, hw: H + 4, hd: 4, rot: 0, height: 5, kind: 'wall', colorSeed: 0.5 });
  obstacles.push({ x: 0, z: H + 2, hw: H + 4, hd: 4, rot: 0, height: 5, kind: 'wall', colorSeed: 0.5 });
  obstacles.push({ x: -H - 2, z: 0, hw: 4, hd: H + 4, rot: 0, height: 5, kind: 'wall', colorSeed: 0.5 });
  obstacles.push({ x: H + 2, z: 0, hw: 4, hd: H + 4, rot: 0, height: 5, kind: 'wall', colorSeed: 0.5 });

  // ── Zonas: las curvas más cerradas pagan más ──
  const zones: ZoneDef[] = [
    { name: 'Pista', mult: 1.0, x: 0, z: 0, hw: H, hd: H, color: '#8b8d90' },
  ];
  for (let i = 0; i < s.samples; i += Math.max(1, Math.floor(s.samples / 4))) {
    const [x, z] = pts[i];
    zones.push({
      name: 'Sector técnico',
      mult: 1.3,
      x, z,
      hw: 55, hd: 55,
      color: '#c08a2a',
    });
  }

  // Largada: en el punto de mayor radio, mirando en el sentido de la pista
  let bestI = 0;
  let bestR = -1;
  for (let i = 0; i < s.samples; i++) {
    const r = Math.hypot(pts[i][0], pts[i][1]);
    if (r > bestR) {
      bestR = r;
      bestI = i;
    }
  }
  const [sx, sz] = pts[bestI];
  const [nx, nz] = pts[(bestI + 1) % s.samples];
  const spawn = { x: sx, z: sz, yaw: Math.atan2(nx - sx, nz - sz) };

  return {
    name: s.name,
    half: s.half,
    terrain: s.terrain,
    roads,
    obstacles,
    destructibles,
    zones,
    lanes: [],
    spawn,
    lights,
  };
}

/**
 * Mapa 1 — pista ancha, curvas generosas y muros de goma cerca para raspar.
 * Está hecha para aprender: es muy difícil salirse y no hay nada que te choque.
 */
export function buildApexSchool(): MapDefinition {
  return buildCircuit({
    name: 'Escuela Apex',
    half: 330,
    r0: 175,
    a1: 48,
    phase1: 0.6,
    a2: 26,
    phase2: 2.1,
    width: 21,
    widenTight: 12,
    surface: Surface.Asphalt,
    terrain: 'grass',
    samples: 84,
    seed: 7731,
    barriers: true,
  });
}

/** Mapa 3 — angosto, con horquillas encadenadas y paredes de roca. */
export function buildKaidaCanyon(): MapDefinition {
  return buildCircuit({
    name: 'Cañón Kaida',
    half: 400,
    r0: 215,
    a1: 62,
    phase1: 1.4,
    a2: 52,
    phase2: 0.3,
    width: 13,
    widenTight: 4,
    surface: Surface.Asphalt,
    terrain: 'dirt',
    samples: 120,
    seed: 40404,
    barriers: true,
  });
}
