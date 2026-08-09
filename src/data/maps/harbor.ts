import { Rng } from '../../core/Rng';
import { pointSegmentDistance } from '../../lib/math';
import {
  Surface,
  type Destructible,
  type MapDefinition,
  type Obstacle,
  type RoadSegment,
  type TrafficLane,
  type ZoneDef,
} from '../../sim/World';

/**
 * HARBOR DISTRICT — 900 × 900 m.
 *
 * No es una grilla de Manhattan uniforme: la avenida diagonal genera esquinas de
 * 60° y 120°, la rotonda da un combo largo sostenido, el puerto es un laberinto
 * de contenedores y la costanera son curvas rápidas sobre mojado.
 */

const HALF = 450;
const ROAD_W = 14;
const DIAG_W = 18;

// Ejes de la grilla (x y z)
const GRID = [-380, -250, -120, 0, 120, 250, 380];
// Límites de manzana
const BOUNDS = [-450, -380, -250, -120, 0, 120, 250, 380, 450];

const ROUNDABOUT_R = 31;
const ROUNDABOUT_ISLAND = 20;

const PORT = { x: 280, z: -280, hw: 150, hd: 140 };
const SITE = { x: -280, z: 280, hw: 130, hd: 120 };
const PLAZA_A = { x: -185, z: -60, hw: 45, hd: 45 };
const PLAZA_B = { x: 185, z: 185, hw: 40, hd: 40 };
const TUNNEL = { x: -170, z: -120, hw: 90, hd: 11 };

export function buildHarborMap(): MapDefinition {
  const rng = new Rng(20260807);
  const roads: RoadSegment[] = [];
  const obstacles: Obstacle[] = [];
  const destructibles: Destructible[] = [];
  const lanes: TrafficLane[] = [];
  const lights: { x: number; z: number; color: number }[] = [];

  // ─────────────────────────── calles ───────────────────────────

  for (const v of GRID) {
    if (v === 0) {
      // La avenida central se corta en la rotonda
      roads.push(seg(0, -HALF + 20, 0, -ROUNDABOUT_R - 8, ROAD_W, Surface.Asphalt));
      roads.push(seg(0, ROUNDABOUT_R + 8, 0, HALF - 20, ROAD_W, Surface.Asphalt));
      roads.push(seg(-HALF + 20, 0, -ROUNDABOUT_R - 8, 0, ROAD_W, Surface.Asphalt));
      roads.push(seg(ROUNDABOUT_R + 8, 0, HALF - 20, 0, ROAD_W, Surface.Asphalt));
      continue;
    }
    roads.push(seg(v, -HALF + 20, v, HALF - 20, ROAD_W, Surface.Asphalt));
    roads.push(seg(-HALF + 20, v, HALF - 20, v, ROAD_W, Surface.Asphalt));
  }

  // Avenida diagonal a 30° — la mejor calle del mapa
  roads.push(seg(-HALF, -260, -38, -22, DIAG_W, Surface.Asphalt));
  roads.push(seg(38, 22, HALF, 260, DIAG_W, Surface.Asphalt));

  // Rotonda: anillo de 16 segmentos
  const ringPts: [number, number][] = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ringPts.push([Math.sin(a) * ROUNDABOUT_R, Math.cos(a) * ROUNDABOUT_R]);
  }
  for (let i = 0; i < 16; i++) {
    roads.push(
      seg(ringPts[i][0], ringPts[i][1], ringPts[i + 1][0], ringPts[i + 1][1], 18, Surface.Asphalt),
    );
  }

  // Costanera: sur y este, mojada
  roads.push(seg(-HALF + 20, -425, HALF - 20, -425, 16, Surface.WetAsphalt));
  roads.push(seg(425, -HALF + 20, 425, HALF - 20, 16, Surface.WetAsphalt));
  roads.push(seg(HALF - 60, -425, 425, -HALF + 60, 16, Surface.WetAsphalt));

  // Accesos al puerto
  roads.push(seg(PORT.x, PORT.z + PORT.hd, PORT.x, -120, 16, Surface.Concrete));
  roads.push(seg(PORT.x - PORT.hw, PORT.z, 120, PORT.z, 16, Surface.Concrete));

  // ─────────────────────────── zonas ───────────────────────────

  const zones: ZoneDef[] = [
    { name: 'Centro', mult: 1.0, x: 0, z: 0, hw: HALF, hd: HALF, color: '#2b3350' },
    { name: 'Plaza', mult: 0.4, x: PLAZA_A.x, z: PLAZA_A.z, hw: PLAZA_A.hw, hd: PLAZA_A.hd, color: '#2f5f3a' },
    { name: 'Plaza', mult: 0.4, x: PLAZA_B.x, z: PLAZA_B.z, hw: PLAZA_B.hw, hd: PLAZA_B.hd, color: '#2f5f3a' },
    { name: 'Costanera', mult: 1.2, x: 0, z: -428, hw: HALF, hd: 22, color: '#1d4f6b' },
    { name: 'Costanera', mult: 1.2, x: 428, z: 0, hw: 22, hd: HALF, color: '#1d4f6b' },
    { name: 'Obra', mult: 1.1, x: SITE.x, z: SITE.z, hw: SITE.hw, hd: SITE.hd, color: '#6b5330' },
    { name: 'Puerto', mult: 1.4, x: PORT.x, z: PORT.z, hw: PORT.hw, hd: PORT.hd, color: '#4a3d6b' },
    { name: 'Rotonda', mult: 1.15, x: 0, z: 0, hw: 46, hd: 46, color: '#5b3a6b' },
    { name: 'Diagonal', mult: 1.25, x: -230, z: -140, hw: 60, hd: 60, color: '#6b4a2a' },
    { name: 'Diagonal', mult: 1.25, x: 230, z: 140, hw: 60, hd: 60, color: '#6b4a2a' },
    { name: 'Túnel', mult: 1.35, x: TUNNEL.x, z: TUNNEL.z, hw: TUNNEL.hw, hd: TUNNEL.hd, color: '#6b2a3a' },
  ];

  // ─────────────────────────── muros del borde ───────────────────────────

  obstacles.push(wall(0, -HALF - 2, HALF + 4, 4));
  obstacles.push(wall(0, HALF + 2, HALF + 4, 4));
  obstacles.push(wall(-HALF - 2, 0, 4, HALF + 4));
  obstacles.push(wall(HALF + 2, 0, 4, HALF + 4));

  // Isla de la rotonda (octógono con dos cajas cruzadas)
  obstacles.push({
    x: 0, z: 0, hw: ROUNDABOUT_ISLAND, hd: ROUNDABOUT_ISLAND, rot: 0,
    height: 3, kind: 'planter', colorSeed: 0.3,
  });
  obstacles.push({
    x: 0, z: 0, hw: ROUNDABOUT_ISLAND, hd: ROUNDABOUT_ISLAND, rot: Math.PI / 4,
    height: 3, kind: 'planter', colorSeed: 0.3,
  });
  obstacles.push({
    x: 0, z: 0, hw: 4, hd: 4, rot: 0, height: 22, kind: 'building', colorSeed: 0.9,
  });
  lights.push({ x: 0, z: 0, color: 0x22e1ff });

  // ─────────────────────────── edificios por manzana ───────────────────────────

  const isBlocked = (x: number, z: number, r: number): boolean => {
    for (const road of roads) {
      const d = pointSegmentDistance(x, z, road.ax, road.az, road.bx, road.bz);
      if (d < road.width * 0.5 + 4 + r) return true;
    }
    if (Math.hypot(x, z) < ROUNDABOUT_R + 20 + r) return true;
    if (inRect(x, z, PORT, r)) return true;
    if (inRect(x, z, SITE, r)) return true;
    if (inRect(x, z, PLAZA_A, r)) return true;
    if (inRect(x, z, PLAZA_B, r)) return true;
    return false;
  };

  for (let bi = 0; bi < BOUNDS.length - 1; bi++) {
    for (let bj = 0; bj < BOUNDS.length - 1; bj++) {
      const x0 = BOUNDS[bi] + 11;
      const x1 = BOUNDS[bi + 1] - 11;
      const z0 = BOUNDS[bj] + 11;
      const z1 = BOUNDS[bj + 1] - 11;
      const bw = x1 - x0;
      const bd = z1 - z0;
      if (bw < 24 || bd < 24) continue;

      const nx = Math.max(1, Math.round(bw / 52));
      const nz = Math.max(1, Math.round(bd / 52));
      const cw = bw / nx;
      const cd = bd / nz;

      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          const alley = rng.chance(0.16) ? rng.range(4, 8) : 1.6;
          const hw = cw / 2 - alley;
          const hd = cd / 2 - alley;
          if (hw < 6 || hd < 6) continue;
          const cx = x0 + cw * (i + 0.5);
          const cz = z0 + cd * (j + 0.5);
          if (isBlocked(cx, cz, Math.min(hw, hd) * 0.75)) continue;
          // En tercera persona la cámara va a 2.3 m del piso, así que los
          // edificios altos ya no tapan nada: encajonan la calle y dan
          // referencia de velocidad. Vuelven a crecer.
          const distCenter = Math.hypot(cx, cz);
          const landmark = rng.chance(0.08) && hw > 13 && hd > 13;
          const height = landmark
            ? rng.range(48, 78)
            : 11 + rng.range(0, 1) ** 2 * 34 * (1 - distCenter / 1600);
          obstacles.push({
            x: cx, z: cz, hw, hd, rot: 0,
            height: Math.max(10, height),
            kind: 'building',
            colorSeed: rng.next(),
          });
        }
      }
    }
  }

  // ─────────────────────────── puerto: laberinto de contenedores ───────────────

  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 8; col++) {
      if (rng.chance(0.28)) continue;
      const cx = PORT.x - PORT.hw + 30 + col * 34 + rng.range(-3, 3);
      const cz = PORT.z - PORT.hd + 26 + row * 36 + rng.range(-3, 3);
      if (Math.abs(cx - PORT.x) < 11 || Math.abs(cz - PORT.z) < 11) continue;
      const long = rng.chance(0.5);
      obstacles.push({
        x: cx, z: cz,
        hw: long ? 6.1 : 1.3,
        hd: long ? 1.3 : 6.1,
        rot: 0,
        height: rng.chance(0.35) ? 5.2 : 2.6,
        kind: 'container',
        colorSeed: rng.next(),
      });
    }
  }
  for (let i = 0; i < 26; i++) {
    destructibles.push({
      x: PORT.x + rng.range(-PORT.hw + 20, PORT.hw - 20),
      z: PORT.z + rng.range(-PORT.hd + 20, PORT.hd - 20),
      kind: 'cone', radius: 0.7, hype: 50,
    });
  }
  lights.push({ x: PORT.x - 60, z: PORT.z + 40, color: 0xffa332 });
  lights.push({ x: PORT.x + 60, z: PORT.z - 40, color: 0xffa332 });

  // ─────────────────────────── obra en construcción ───────────────────────────

  for (let i = 0; i < 22; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.next()) * 100;
    const x = SITE.x + Math.cos(a) * r;
    const z = SITE.z + Math.sin(a) * r;
    if (isOnRoad(roads, x, z, 6)) continue;
    obstacles.push({
      x, z, hw: rng.range(2, 5), hd: rng.range(2, 5), rot: rng.next() * Math.PI,
      height: rng.range(2, 6), kind: 'barrier', colorSeed: rng.next(),
    });
  }
  for (let i = 0; i < 30; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.next()) * 110;
    destructibles.push({
      x: SITE.x + Math.cos(a) * r, z: SITE.z + Math.sin(a) * r,
      kind: 'cone', radius: 0.7, hype: 50,
    });
  }

  // ─────────────────────────── plazas ───────────────────────────

  for (const plaza of [PLAZA_A, PLAZA_B]) {
    for (let i = 0; i < 10; i++) {
      const x = plaza.x + rng.range(-plaza.hw + 8, plaza.hw - 8);
      const z = plaza.z + rng.range(-plaza.hd + 8, plaza.hd - 8);
      obstacles.push({
        x, z, hw: rng.range(1.5, 3), hd: rng.range(1.5, 3), rot: rng.next(),
        height: rng.range(2, 8), kind: 'planter', colorSeed: rng.next(),
      });
    }
  }

  // ─────────────────────────── props sobre las calles ───────────────────────────

  for (const road of roads) {
    const dx = road.bx - road.ax;
    const dz = road.bz - road.az;
    const len = Math.hypot(dx, dz);
    if (len < 30) continue;
    const ux = dx / len;
    const uz = dz / len;
    const px = -uz;
    const pz = ux;
    const wet = road.surface === Surface.WetAsphalt;

    for (let d = 16; d < len - 16; d += 15) {
      const t = d / len;
      const bx = road.ax + dx * t;
      const bz = road.az + dz * t;
      if (nearIntersection(bx, bz)) continue;

      // Autos estacionados
      if (rng.chance(wet ? 0.18 : 0.42)) {
        const side = rng.chance(0.5) ? 1 : -1;
        const off = road.width * 0.5 - 1.5;
        obstacles.push({
          x: bx + px * off * side, z: bz + pz * off * side,
          hw: 0.95, hd: 2.35, rot: -Math.atan2(ux, uz),
          height: 1.45, kind: 'parked', colorSeed: rng.next(),
        });
      }
      // Postes de luz + luces de neón
      if (rng.chance(0.3)) {
        const side = rng.chance(0.5) ? 1 : -1;
        const off = road.width * 0.5 + 2.2;
        const lx = bx + px * off * side;
        const lz = bz + pz * off * side;
        obstacles.push({
          x: lx, z: lz, hw: 0.35, hd: 0.35, rot: 0,
          height: 8, kind: 'pole', colorSeed: rng.next(),
        });
        if (rng.chance(0.35)) {
          lights.push({
            x: lx, z: lz,
            color: rng.pick([0x22e1ff, 0xff2e88, 0xffa332, 0x39ff88]),
          });
        }
      }
      // Basura urbana destructible
      if (rng.chance(0.35)) {
        const side = rng.chance(0.5) ? 1 : -1;
        const off = road.width * 0.5 - 1.0;
        destructibles.push({
          x: bx + px * off * side, z: bz + pz * off * side,
          kind: rng.chance(0.6) ? 'cone' : 'bin',
          radius: 0.75, hype: 50,
        });
      }
      if (wet && rng.chance(0.5)) {
        const side = bz < 0 ? -1 : 1;
        obstacles.push({
          x: bx + px * (road.width * 0.5 + 1.5) * side,
          z: bz + pz * (road.width * 0.5 + 1.5) * side,
          hw: 3.5, hd: 0.4, rot: -Math.atan2(ux, uz),
          height: 1.1, kind: 'barrier', colorSeed: rng.next(),
        });
      }
    }
  }

  // Conos en las esquinas de la grilla — invitan a driftear
  for (const gx of GRID) {
    for (const gz of GRID) {
      if (Math.hypot(gx, gz) < ROUNDABOUT_R + 14) continue;
      for (let i = 0; i < 5; i++) {
        const a = rng.next() * Math.PI * 2;
        const r = 9 + rng.next() * 7;
        destructibles.push({
          x: gx + Math.cos(a) * r, z: gz + Math.sin(a) * r,
          kind: 'cone', radius: 0.7, hype: 50,
        });
      }
    }
  }

  // Carteles de neón sobre las fachadas grandes
  for (const o of obstacles) {
    if (o.kind !== 'building' || o.height < 26) continue;
    if (rng.chance(0.78)) continue;
    destructibles.push({
      x: o.x + (o.hw + 1.2) * (rng.chance(0.5) ? 1 : -1),
      z: o.z + rng.range(-o.hd * 0.6, o.hd * 0.6),
      kind: 'sign', radius: 1.1, hype: 150,
    });
  }

  // ─────────────────────────── tráfico ───────────────────────────

  for (const v of [-250, -120, 120, 250]) {
    lanes.push({ ax: v + 3.5, az: -HALF + 40, bx: v + 3.5, bz: HALF - 40 });
    lanes.push({ ax: -HALF + 40, az: v - 3.5, bx: HALF - 40, bz: v - 3.5 });
  }

  return {
    name: 'Harbor District',
    half: HALF,
    roads,
    obstacles,
    destructibles,
    zones,
    lanes,
    spawn: { x: 0, z: -200, yaw: 0 },
    lights,
  };
}

// ─────────────────────────── helpers ───────────────────────────

function seg(
  ax: number, az: number, bx: number, bz: number, width: number, surface: Surface,
): RoadSegment {
  return { ax, az, bx, bz, width, surface };
}

function wall(x: number, z: number, hw: number, hd: number): Obstacle {
  return { x, z, hw, hd, rot: 0, height: 6, kind: 'wall', colorSeed: 0.5 };
}

function inRect(
  x: number, z: number, r: { x: number; z: number; hw: number; hd: number }, pad: number,
): boolean {
  return Math.abs(x - r.x) < r.hw + pad && Math.abs(z - r.z) < r.hd + pad;
}

function isOnRoad(roads: RoadSegment[], x: number, z: number, pad: number): boolean {
  for (const r of roads) {
    if (pointSegmentDistance(x, z, r.ax, r.az, r.bx, r.bz) < r.width * 0.5 + pad) return true;
  }
  return false;
}

function nearIntersection(x: number, z: number): boolean {
  for (const g of GRID) {
    if (Math.abs(x - g) < 14 || Math.abs(z - g) < 14) {
      // solo cuenta si está cerca de ambos ejes
      for (const h of GRID) {
        if (Math.abs(x - g) < 14 && Math.abs(z - h) < 14) return true;
        if (Math.abs(z - g) < 14 && Math.abs(x - h) < 14) return true;
      }
    }
  }
  return Math.hypot(x, z) < ROUNDABOUT_R + 16;
}

export { HALF as MAP_HALF, TUNNEL, PORT, SITE };
