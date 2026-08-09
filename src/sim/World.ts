import { clamp, pointSegmentDistance } from '../lib/math';

export const enum Surface {
  Asphalt = 0,
  WetAsphalt = 1,
  Concrete = 2,
  Grass = 3,
  Dirt = 4,
  Metal = 5,
}

export const SURFACE_GRIP: Record<number, number> = {
  [Surface.Asphalt]: 1.0,
  [Surface.WetAsphalt]: 0.78,
  [Surface.Concrete]: 0.94,
  [Surface.Grass]: 0.55,
  [Surface.Dirt]: 0.62,
  [Surface.Metal]: 0.88,
};

export const SURFACE_SCORABLE: Record<number, boolean> = {
  [Surface.Asphalt]: true,
  [Surface.WetAsphalt]: true,
  [Surface.Concrete]: true,
  [Surface.Grass]: false,
  [Surface.Dirt]: true,
  [Surface.Metal]: true,
};

export type ObstacleKind =
  | 'building'
  | 'container'
  | 'barrier'
  | 'parked'
  | 'pole'
  | 'planter'
  | 'wall';

export interface Obstacle {
  x: number;
  z: number;
  hw: number; // half width (eje local X)
  hd: number; // half depth (eje local Z)
  rot: number;
  height: number;
  kind: ObstacleKind;
  colorSeed: number;
}

export type DestructibleKind = 'cone' | 'bin' | 'sign' | 'hydrant';

export interface Destructible {
  x: number;
  z: number;
  kind: DestructibleKind;
  radius: number;
  hype: number;
}

export interface RoadSegment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  width: number;
  surface: Surface;
}

export interface ZoneDef {
  name: string;
  mult: number;
  /** Rect axis-aligned. */
  x: number;
  z: number;
  hw: number;
  hd: number;
  color: string;
}

export interface TrafficLane {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

export interface MapDefinition {
  name: string;
  half: number; // semi-lado del mapa en metros
  /** Terreno de fondo, define la textura del suelo fuera de pista. */
  terrain: 'grass' | 'dirt' | 'urban';
  roads: RoadSegment[];
  obstacles: Obstacle[];
  destructibles: Destructible[];
  zones: ZoneDef[];
  lanes: TrafficLane[];
  spawn: { x: number; z: number; yaw: number };
  lights: { x: number; z: number; color: number }[];
}

const CELL = 8; // m — broadphase
const RASTER = 4; // m — superficie y zonas

export interface DestructibleState extends Destructible {
  alive: boolean;
}

/**
 * Mundo de simulación: raster de superficies/zonas, grid de colisión y heat map
 * anti-farming. Headless — no sabe nada de three.js.
 */
export class SimWorld {
  readonly def: MapDefinition;
  readonly half: number;

  private rasterSize: number;
  private surfaceGrid: Uint8Array;
  private zoneGrid: Float32Array;

  private gridSize: number;
  private cells: number[][];

  readonly destructibles: DestructibleState[];
  private destGridSize: number;
  private destCells: number[][];

  /** Heat map anti-farming: celdas de 20 m. */
  private heatSize: number;
  private heat: Float32Array;

  constructor(def: MapDefinition) {
    this.def = def;
    this.half = def.half;

    // ── Raster de superficie y zonas ──
    this.rasterSize = Math.ceil((def.half * 2) / RASTER);
    this.surfaceGrid = new Uint8Array(this.rasterSize * this.rasterSize);
    this.zoneGrid = new Float32Array(this.rasterSize * this.rasterSize);
    this.buildRaster();

    // ── Grid de colisión ──
    this.gridSize = Math.ceil((def.half * 2) / CELL);
    this.cells = Array.from({ length: this.gridSize * this.gridSize }, () => []);
    for (let i = 0; i < def.obstacles.length; i++) this.registerObstacle(i);

    this.destructibles = def.destructibles.map((d) => ({ ...d, alive: true }));
    this.destGridSize = this.gridSize;
    this.destCells = Array.from({ length: this.destGridSize * this.destGridSize }, () => []);
    for (let i = 0; i < this.destructibles.length; i++) {
      const d = this.destructibles[i];
      const c = this.cellIndex(d.x, d.z);
      if (c >= 0) this.destCells[c].push(i);
    }

    this.heatSize = Math.ceil((def.half * 2) / 20);
    this.heat = new Float32Array(this.heatSize * this.heatSize);
  }

  // ─────────────────────────── raster ───────────────────────────

  private buildRaster(): void {
    const n = this.rasterSize;
    const half = this.half;
    for (let iz = 0; iz < n; iz++) {
      const z = -half + (iz + 0.5) * RASTER;
      for (let ix = 0; ix < n; ix++) {
        const x = -half + (ix + 0.5) * RASTER;
        const idx = iz * n + ix;

        // Zona (la última que contiene el punto gana)
        let mult = 1.0;
        let base = Surface.Concrete as Surface;
        for (const zn of this.def.zones) {
          if (Math.abs(x - zn.x) <= zn.hw && Math.abs(z - zn.z) <= zn.hd) {
            mult = zn.mult;
            if (zn.name === 'Obra') base = Surface.Dirt;
            else if (zn.name === 'Plaza') base = Surface.Grass;
            else if (zn.name === 'Puerto') base = Surface.Concrete;
          }
        }

        // Calle: gana sobre el fondo
        let surface = base;
        for (const r of this.def.roads) {
          const d = pointSegmentDistance(x, z, r.ax, r.az, r.bx, r.bz);
          if (d <= r.width * 0.5 + 1) {
            surface = r.surface;
            break;
          }
        }

        this.surfaceGrid[idx] = surface;
        this.zoneGrid[idx] = mult;
      }
    }
  }

  private rasterIndex(x: number, z: number): number {
    const ix = Math.floor((x + this.half) / RASTER);
    const iz = Math.floor((z + this.half) / RASTER);
    if (ix < 0 || iz < 0 || ix >= this.rasterSize || iz >= this.rasterSize) return -1;
    return iz * this.rasterSize + ix;
  }

  surfaceAt(x: number, z: number): Surface {
    const i = this.rasterIndex(x, z);
    return i < 0 ? Surface.Concrete : (this.surfaceGrid[i] as Surface);
  }

  gripAt(x: number, z: number): number {
    return SURFACE_GRIP[this.surfaceAt(x, z)];
  }

  scorableAt(x: number, z: number): boolean {
    return SURFACE_SCORABLE[this.surfaceAt(x, z)];
  }

  zoneMultiplierAt(x: number, z: number): number {
    const i = this.rasterIndex(x, z);
    return i < 0 ? 1 : this.zoneGrid[i];
  }

  zoneNameAt(x: number, z: number): string | null {
    for (let i = this.def.zones.length - 1; i >= 0; i--) {
      const zn = this.def.zones[i];
      if (Math.abs(x - zn.x) <= zn.hw && Math.abs(z - zn.z) <= zn.hd) return zn.name;
    }
    return null;
  }

  // ─────────────────────────── colisión ───────────────────────────

  private cellIndex(x: number, z: number): number {
    const ix = Math.floor((x + this.half) / CELL);
    const iz = Math.floor((z + this.half) / CELL);
    if (ix < 0 || iz < 0 || ix >= this.gridSize || iz >= this.gridSize) return -1;
    return iz * this.gridSize + ix;
  }

  private registerObstacle(index: number): void {
    const o = this.def.obstacles[index];
    const r = Math.hypot(o.hw, o.hd);
    const minIx = Math.max(0, Math.floor((o.x - r + this.half) / CELL));
    const maxIx = Math.min(this.gridSize - 1, Math.floor((o.x + r + this.half) / CELL));
    const minIz = Math.max(0, Math.floor((o.z - r + this.half) / CELL));
    const maxIz = Math.min(this.gridSize - 1, Math.floor((o.z + r + this.half) / CELL));
    for (let iz = minIz; iz <= maxIz; iz++) {
      for (let ix = minIx; ix <= maxIx; ix++) {
        this.cells[iz * this.gridSize + ix].push(index);
      }
    }
  }

  /** Índices de obstáculos en las 9 celdas alrededor del punto. */
  queryObstacles(x: number, z: number, out: number[]): number[] {
    out.length = 0;
    const ix0 = Math.floor((x + this.half) / CELL);
    const iz0 = Math.floor((z + this.half) / CELL);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ix = ix0 + dx;
        const iz = iz0 + dz;
        if (ix < 0 || iz < 0 || ix >= this.gridSize || iz >= this.gridSize) continue;
        const list = this.cells[iz * this.gridSize + ix];
        for (const i of list) if (!out.includes(i)) out.push(i);
      }
    }
    return out;
  }

  queryDestructibles(x: number, z: number, out: number[]): number[] {
    out.length = 0;
    const ix0 = Math.floor((x + this.half) / CELL);
    const iz0 = Math.floor((z + this.half) / CELL);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ix = ix0 + dx;
        const iz = iz0 + dz;
        if (ix < 0 || iz < 0 || ix >= this.destGridSize || iz >= this.destGridSize) continue;
        for (const i of this.destCells[iz * this.destGridSize + ix]) out.push(i);
      }
    }
    return out;
  }

  private scratch: number[] = [];

  /** Distancia del punto a la superficie del obstáculo más cercano (m). */
  nearestWallDistance(x: number, z: number, maxRange = 12): number {
    const list = this.queryObstacles(x, z, this.scratch);
    let best = maxRange;
    for (const i of list) {
      const o = this.def.obstacles[i];
      const d = distancePointToObb(x, z, o);
      if (d < best) best = d;
    }
    return best;
  }

  resetDestructibles(): void {
    for (const d of this.destructibles) d.alive = true;
  }

  // ─────────────────────────── heat (anti-farming) ───────────────────────────

  private heatIndex(x: number, z: number): number {
    const ix = Math.floor((x + this.half) / 20);
    const iz = Math.floor((z + this.half) / 20);
    if (ix < 0 || iz < 0 || ix >= this.heatSize || iz >= this.heatSize) return -1;
    return iz * this.heatSize + ix;
  }

  addHeat(x: number, z: number, amount: number): void {
    const i = this.heatIndex(x, z);
    if (i < 0) return;
    this.heat[i] = Math.min(3, this.heat[i] + amount);
  }

  heatAt(x: number, z: number): number {
    const i = this.heatIndex(x, z);
    return i < 0 ? 0 : this.heat[i];
  }

  decayHeat(dt: number): void {
    const d = 0.15 * dt;
    for (let i = 0; i < this.heat.length; i++) {
      if (this.heat[i] > 0) this.heat[i] = Math.max(0, this.heat[i] - d);
    }
  }

  resetHeat(): void {
    this.heat.fill(0);
  }
}

/** Distancia de un punto a la superficie de un OBB (0 si está adentro). */
export function distancePointToObb(px: number, pz: number, o: Obstacle): number {
  const c = Math.cos(-o.rot);
  const s = Math.sin(-o.rot);
  const dx = px - o.x;
  const dz = pz - o.z;
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const ox = Math.abs(lx) - o.hw;
  const oz = Math.abs(lz) - o.hd;
  if (ox <= 0 && oz <= 0) return 0;
  return Math.hypot(Math.max(ox, 0), Math.max(oz, 0));
}

export { clamp };
