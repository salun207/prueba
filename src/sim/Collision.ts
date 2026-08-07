import type { CarSpec, CarState } from './types';
import type { Obstacle } from './World';
import { SimWorld, distancePointToObb } from './World';

export interface Obb {
  x: number;
  z: number;
  hw: number;
  hd: number;
  rot: number;
}

export interface ImpactInfo {
  severity: 'scrape' | 'hit' | 'crash';
  impulse: number;
  x: number;
  z: number;
  nx: number;
  nz: number;
  kind: string;
}

export const SCRAPE_THRESHOLD = 3.0;
export const CRASH_THRESHOLD = 9.0;
const RESTITUTION = 0.25;

const axesA = new Float64Array(4);
const axesB = new Float64Array(4);

/**
 * SAT entre dos OBB. Devuelve la profundidad de penetración y escribe la normal
 * (unitaria, apuntando de B hacia A) en `outNormal`. Devuelve 0 si no hay solape.
 */
export function satObb(a: Obb, b: Obb, outNormal: { x: number; z: number }): number {
  const ca = Math.cos(a.rot);
  const sa = Math.sin(a.rot);
  const cb = Math.cos(b.rot);
  const sb = Math.sin(b.rot);

  axesA[0] = ca;
  axesA[1] = sa; // eje X local de A
  axesA[2] = -sa;
  axesA[3] = ca; // eje Z local de A
  axesB[0] = cb;
  axesB[1] = sb;
  axesB[2] = -sb;
  axesB[3] = cb;

  const dx = a.x - b.x;
  const dz = a.z - b.z;

  let minDepth = Infinity;
  let nx = 0;
  let nz = 0;

  for (let i = 0; i < 4; i++) {
    const ax = i < 2 ? axesA[i * 2] : axesB[(i - 2) * 2];
    const az = i < 2 ? axesA[i * 2 + 1] : axesB[(i - 2) * 2 + 1];

    const ra =
      a.hw * Math.abs(ax * axesA[0] + az * axesA[1]) +
      a.hd * Math.abs(ax * axesA[2] + az * axesA[3]);
    const rb =
      b.hw * Math.abs(ax * axesB[0] + az * axesB[1]) +
      b.hd * Math.abs(ax * axesB[2] + az * axesB[3]);

    const proj = dx * ax + dz * az;
    const depth = ra + rb - Math.abs(proj);
    if (depth <= 0) return 0;
    if (depth < minDepth) {
      minDepth = depth;
      const sign = proj < 0 ? -1 : 1;
      nx = ax * sign;
      nz = az * sign;
    }
  }

  outNormal.x = nx;
  outNormal.z = nz;
  return minDepth;
}

const normal = { x: 0, z: 0 };
const scratch: number[] = [];
const scratchD: number[] = [];

export function carObb(car: CarState, spec: CarSpec, out: Obb): Obb {
  out.x = car.posX;
  out.z = car.posZ;
  out.hw = spec.bodyWidth * 0.5;
  out.hd = spec.bodyLength * 0.5;
  out.rot = -car.yaw;
  return out;
}

const tmpObb: Obb = { x: 0, z: 0, hw: 1, hd: 2, rot: 0 };

/**
 * Resuelve el auto contra los obstáculos estáticos y el tráfico. Llama a
 * `onImpact` una vez por contacto significativo.
 */
export function resolveCollisions(
  car: CarState,
  spec: CarSpec,
  world: SimWorld,
  traffic: Obb[],
  onImpact: (info: ImpactInfo) => void,
  onDestroy: (index: number) => void,
): void {
  const box = carObb(car, spec, tmpObb);

  for (let iter = 0; iter < 3; iter++) {
    let resolved = false;
    const list = world.queryObstacles(car.posX, car.posZ, scratch);

    for (const i of list) {
      const o = world.def.obstacles[i];
      const depth = satObb(box, o, normal);
      if (depth <= 0) continue;
      applyResponse(car, box, depth, normal.x, normal.z, o.kind, onImpact);
      resolved = true;
    }

    for (const t of traffic) {
      const depth = satObb(box, t, normal);
      if (depth <= 0) continue;
      applyResponse(car, box, depth, normal.x, normal.z, 'parked', onImpact);
      resolved = true;
    }

    if (!resolved) break;
  }

  // Destructibles: no frenan al auto, solo se los lleva puestos.
  const dl = world.queryDestructibles(car.posX, car.posZ, scratchD);
  for (const i of dl) {
    const d = world.destructibles[i];
    if (!d.alive) continue;
    if (distancePointToObb(d.x, d.z, obbAsObstacle(box)) <= d.radius) {
      d.alive = false;
      car.velX *= 0.96;
      car.velZ *= 0.96;
      onDestroy(i);
    }
  }
}

const obstacleView: Obstacle = {
  x: 0,
  z: 0,
  hw: 1,
  hd: 2,
  rot: 0,
  height: 1,
  kind: 'wall',
  colorSeed: 0,
};

function obbAsObstacle(b: Obb): Obstacle {
  obstacleView.x = b.x;
  obstacleView.z = b.z;
  obstacleView.hw = b.hw;
  obstacleView.hd = b.hd;
  obstacleView.rot = b.rot;
  return obstacleView;
}

function applyResponse(
  car: CarState,
  box: Obb,
  depth: number,
  nx: number,
  nz: number,
  kind: string,
  onImpact: (info: ImpactInfo) => void,
): void {
  // Separación posicional
  car.posX += nx * depth;
  car.posZ += nz * depth;
  box.x = car.posX;
  box.z = car.posZ;

  const vNormal = car.velX * nx + car.velZ * nz;
  if (vNormal >= 0) return;

  const impulse = -vNormal;
  car.velX -= nx * vNormal * (1 + RESTITUTION);
  car.velZ -= nz * vNormal * (1 + RESTITUTION);
  car.velX *= 0.92;
  car.velZ *= 0.92;
  car.yawRate *= 0.55;

  const severity: ImpactInfo['severity'] =
    impulse < SCRAPE_THRESHOLD ? 'scrape' : impulse < CRASH_THRESHOLD ? 'hit' : 'crash';

  onImpact({ severity, impulse, x: car.posX, z: car.posZ, nx, nz, kind });
}
