import { clamp } from '../lib/math';
import { Rng } from '../core/Rng';
import { satObb, type Obb } from './Collision';
import type { CarSpec, CarState } from './types';

/**
 * Mundo del modo TRÁFICO: una autopista infinita.
 *
 * A diferencia del modo drift, acá no hay raster ni grilla de colisión: el
 * camino se describe con una función analítica de la distancia, y lo único
 * sólido son los autos y los guardarraíles. Eso lo hace exacto, barato y
 * verdaderamente infinito — no hay mapa que se termine.
 */

export interface HighwayConfig {
  /** Carriles por sentido. */
  lanes: number;
  laneWidth: number;
  /** Si hay mano contraria (el carril de enfrente paga doble). */
  twoWay: boolean;
  /** Autos por kilómetro y por carril. */
  density: number;
  /** Velocidad base del tráfico, km/h. */
  trafficKmh: number;
  seed: number;
}

export const TRAFFIC_PRESETS: Record<string, HighwayConfig> = {
  autopista: { lanes: 3, laneWidth: 3.7, twoWay: true, density: 18, trafficKmh: 80, seed: 5150 },
  hora_pico: { lanes: 4, laneWidth: 3.6, twoWay: true, density: 30, trafficKmh: 62, seed: 8020 },
  ruta_libre: { lanes: 2, laneWidth: 3.9, twoWay: false, density: 13, trafficKmh: 95, seed: 3131 },
};

export interface TrafficCar {
  id: number;
  /** Carril con signo: negativo = mano contraria. */
  lane: number;
  z: number;
  x: number;
  speed: number;
  /** +1 va en tu sentido, -1 viene de frente. */
  dir: number;
  length: number;
  width: number;
  kind: number;
  colorSeed: number;
  /** Ya se contó como sobrepaso. */
  passed: boolean;
  /** Velocidad que querría llevar si no tuviera a nadie adelante. */
  targetSpeed: number;
  /** Ya se contó el roce cercano. */
  nearMissed: boolean;
  /** Evita que un contacto sostenido dispare un choque por frame. */
  hitCooldown: number;
  active: boolean;
}

const AHEAD = 560;
const BEHIND = 140;
/** Separación mínima entre dos autos que aparecen en el mismo carril. */
const MIN_LANE_GAP = 26;
/** Distancia de seguridad: dentro de esto, el de atrás se acopla al de adelante. */
const HEADWAY = 16;

export class HighwayWorld {
  readonly cfg: HighwayConfig;
  readonly cars: TrafficCar[] = [];
  private rng: Rng;
  private nextId = 0;
  private spawnCursor = 0;
  /** Z de la última aparición en cada carril, para no encimar autos. */
  private laneCursor = new Map<number, number>();

  constructor(cfg: HighwayConfig) {
    this.cfg = cfg;
    this.rng = new Rng(cfg.seed);
  }

  /**
   * Centro de la calzada. Dos senos de períodos distintos: curvas largas y
   * suaves que nunca se repiten igual, sin necesidad de dibujar el trazado.
   */
  centerX(z: number): number {
    return Math.sin(z / 620) * 74 + Math.sin(z / 233 + 1.7) * 21;
  }

  /** Pendiente lateral del camino: sirve para orientar la geometría. */
  heading(z: number): number {
    const d = (this.centerX(z + 1) - this.centerX(z - 1)) / 2;
    return Math.atan(d);
  }

  /** Semiancho de la calzada (sin banquina). */
  get halfWidth(): number {
    const total = this.cfg.lanes * (this.cfg.twoWay ? 2 : 1);
    return (total * this.cfg.laneWidth) / 2;
  }

  /**
   * Centro del carril `i`. i >= 0 = tu mano, i < 0 = mano contraria.
   * En doble mano los carriles salen simétricos respecto del eje: 0 y −1 son
   * los dos que dan a la línea amarilla.
   */
  laneCenter(z: number, lane: number): number {
    const w = this.cfg.laneWidth;
    const base = this.centerX(z);
    if (!this.cfg.twoWay) return base - this.halfWidth + w * (lane + 0.5);
    return base + w * (lane + 0.5);
  }

  /** Distancia lateral al centro de la calzada, con signo. */
  lateral(x: number, z: number): number {
    return x - this.centerX(z);
  }

  onRoad(x: number, z: number): boolean {
    return Math.abs(this.lateral(x, z)) <= this.halfWidth + 0.4;
  }

  /**
   * ¿Está circulando por la mano contraria? Paga el doble.
   *
   * El margen es medio auto: pisar la línea amarilla con una rueda no es ir de
   * contramano, y con un umbral de centímetros el cartel del HUD parpadeaba
   * todo el tiempo yendo derecho.
   */
  inOncoming(x: number, z: number): boolean {
    return this.cfg.twoWay && this.lateral(x, z) < -1.1 && this.onRoad(x, z);
  }

  gripAt(x: number, z: number): number {
    const off = Math.abs(this.lateral(x, z));
    if (off <= this.halfWidth) return 1;
    // Banquina de ripio: agarra menos y frena
    if (off <= this.halfWidth + 2.6) return 0.72;
    return 0.55;
  }

  /** Los guardarraíles están un poco afuera de la banquina. */
  get railOffset(): number {
    return this.halfWidth + 3.2;
  }

  // ─────────────────────────── tráfico ───────────────────────────

  /** Todos los carriles con signo, tu mano primero. */
  private laneList(): number[] {
    const lanes: number[] = [];
    for (let i = 0; i < this.cfg.lanes; i++) lanes.push(i);
    if (this.cfg.twoWay) for (let i = 1; i <= this.cfg.lanes; i++) lanes.push(-i);
    return lanes;
  }

  /**
   * Mete un auto en `z`, en un carril que tenga lugar.
   *
   * Con densidad alta el hueco medio entre apariciones es más chico que un auto,
   * así que elegir el carril al azar mete autos DENTRO de otros. Se lleva la
   * cuenta de dónde apareció el último de cada carril y solo se usan los que
   * tienen espacio; si no hay ninguno, no aparece nadie y listo.
   */
  private spawnOne(z: number): void {
    const c = this.cfg;
    const free = this.laneList().filter((l) => z - (this.laneCursor.get(l) ?? -1e9) >= MIN_LANE_GAP);
    if (free.length === 0) return;

    const lane = this.rng.pick(free);
    this.laneCursor.set(lane, z);
    const dir = lane >= 0 ? 1 : -1;
    const kind = this.rng.int(0, 3);
    // Camiones: más largos, más lentos y siempre en los carriles de la derecha
    const truck = kind === 3;
    const speedKmh =
      c.trafficKmh * this.rng.range(0.82, 1.12) * (truck ? 0.78 : 1) + (lane === 0 ? -8 : 0);

    let car = this.cars.find((t) => !t.active);
    if (!car) {
      car = {
        id: this.nextId++,
        lane, z, x: 0, speed: 0, dir, length: 4.6, width: 1.9,
        kind, colorSeed: 0, targetSpeed: 0,
        passed: false, nearMissed: false, hitCooldown: 0, active: true,
      };
      this.cars.push(car);
    }
    car.lane = lane;
    car.dir = dir;
    car.z = z;
    car.speed = (speedKmh / 3.6) * dir;
    car.targetSpeed = car.speed;
    car.kind = kind;
    car.length = truck ? this.rng.range(8.5, 12) : this.rng.range(4.2, 5.2);
    car.width = truck ? 2.5 : this.rng.range(1.75, 2.0);
    car.colorSeed = this.rng.next();
    car.passed = false;
    car.nearMissed = false;
    car.hitCooldown = 0;
    car.active = true;
    car.x = this.laneCenter(z, lane);
  }

  reset(playerZ: number): void {
    this.rng = new Rng(this.cfg.seed);
    for (const c of this.cars) c.active = false;
    this.laneCursor.clear();
    this.spawnCursor = playerZ + 60;
    // Poblamos el tramo visible de entrada
    while (this.spawnCursor < playerZ + AHEAD) {
      this.spawnOne(this.spawnCursor);
      this.spawnCursor += this.spawnGap();
    }
  }

  /**
   * Hueco hasta el próximo auto. `density` son autos por kilómetro Y POR
   * CARRIL, así que el ritmo de aparición se multiplica por la cantidad de
   * carriles: si no, una autopista de seis carriles queda tan vacía como una
   * ruta de dos y no hay nada que esquivar.
   */
  private spawnGap(): number {
    const perKm = Math.max(1, this.cfg.density) * this.totalLanes;
    const mean = 1000 / perKm;
    return mean * this.rng.range(0.45, 1.75);
  }

  /**
   * Seguimiento: nadie atraviesa al de adelante de su carril.
   *
   * Cada auto sale con una velocidad propia, así que uno rápido alcanza al
   * lento que tiene delante. Sin esto, con densidad alta se ven autos pasando
   * uno a través del otro. La regla es la mínima que funciona: dentro de la
   * distancia de seguridad, la velocidad se mezcla hacia la del de adelante
   * hasta igualarla al tocarse. De regalo aparecen los pelotones, que es como
   * se ve el tráfico de verdad.
   */
  private follow(): void {
    for (const c of this.cars) {
      if (!c.active) continue;
      let gapAhead = Infinity;
      let leadSpeed = 0;
      for (const o of this.cars) {
        if (o === c || !o.active || o.lane !== c.lane) continue;
        // Distancia al de adelante medida en el sentido de marcha
        const ahead = (o.z - c.z) * c.dir;
        if (ahead <= 0 || ahead > 80) continue;
        const gap = ahead - (c.length + o.length) * 0.5;
        if (gap < gapAhead) {
          gapAhead = gap;
          leadSpeed = o.speed;
        }
      }
      if (gapAhead >= HEADWAY) {
        c.speed = c.targetSpeed;
        continue;
      }
      const t = clamp(gapAhead / HEADWAY, 0, 1);
      c.speed = leadSpeed + (c.targetSpeed - leadSpeed) * t;
      // Si igual se metió encima, se lo empuja atrás: es preferible un salto
      // de unos centímetros a dos autos ocupando el mismo lugar.
      if (gapAhead < 0) c.z -= gapAhead * c.dir;
    }
  }

  update(playerZ: number, dt: number): void {
    this.follow();
    for (const c of this.cars) {
      if (!c.active) continue;
      c.z += c.speed * dt;
      c.x = this.laneCenter(c.z, c.lane);
      if (c.hitCooldown > 0) c.hitCooldown -= dt;
      if (c.dir > 0 ? c.z < playerZ - BEHIND : c.z < playerZ - BEHIND) c.active = false;
      if (c.z > playerZ + AHEAD + 120) c.active = false;
    }
    while (this.spawnCursor < playerZ + AHEAD) {
      this.spawnOne(this.spawnCursor);
      this.spawnCursor += this.spawnGap();
    }
    if (this.spawnCursor < playerZ) {
      this.spawnCursor = playerZ + 60;
      this.laneCursor.clear();
    }
  }

  obbOf(c: TrafficCar, out: Obb): Obb {
    out.x = c.x;
    out.z = c.z;
    out.hw = c.width * 0.5;
    out.hd = c.length * 0.5;
    // Mismo convenio que carObb: rot = −yaw.
    out.rot = -this.heading(c.z);
    return out;
  }

  /** Carriles totales de la calzada, contando las dos manos. */
  get totalLanes(): number {
    return this.cfg.lanes * (this.cfg.twoWay ? 2 : 1);
  }
}

// ─────────────────────────── colisión y eventos ───────────────────────────

export interface TrafficEvents {
  onNearMiss: (car: TrafficCar, gap: number) => void;
  onOvertake: (car: TrafficCar) => void;
  onCrash: (impulse: number, head: boolean) => void;
  onRail: (impulse: number) => void;
}

const tmpA: Obb = { x: 0, z: 0, hw: 1, hd: 2, rot: 0 };
const tmpB: Obb = { x: 0, z: 0, hw: 1, hd: 2, rot: 0 };
const normal = { x: 0, z: 0 };

export function resolveHighway(
  car: CarState,
  spec: CarSpec,
  world: HighwayWorld,
  ev: TrafficEvents,
): void {
  tmpA.x = car.posX;
  tmpA.z = car.posZ;
  tmpA.hw = spec.bodyWidth * 0.5;
  tmpA.hd = spec.bodyLength * 0.5;
  tmpA.rot = -car.yaw;

  // ── Guardarraíles ──
  const off = world.lateral(car.posX, car.posZ);
  const limit = world.railOffset;
  if (Math.abs(off) > limit) {
    const side = Math.sign(off);
    car.posX = world.centerX(car.posZ) + limit * side;
    const vLat = car.velX;
    if (vLat * side > 0) {
      car.velX = -vLat * 0.25;
      car.velZ *= 0.94;
      car.yawRate *= 0.5;
      ev.onRail(Math.abs(vLat));
    }
  }

  // ── Autos ──
  for (const t of world.cars) {
    if (!t.active) continue;
    const dz = t.z - car.posZ;
    if (dz > 90 || dz < -40) continue;

    world.obbOf(t, tmpB);
    const depth = satObb(tmpA, tmpB, normal);
    if (depth > 0) {
      // Separar primero: si el auto queda solapado, el contacto se repite cada
      // paso de física y un roce se vuelve una explosión.
      car.posX += normal.x * (depth + 0.02);
      car.posZ += normal.z * (depth + 0.02);
      tmpA.x = car.posX;
      tmpA.z = car.posZ;

      const relX = car.velX;
      const relZ = car.velZ - t.speed;
      const rel = Math.hypot(relX, relZ);
      const along = relX * normal.x + relZ * normal.z;
      if (along < 0) {
        // Rebote inelástico contra un cuerpo mucho más pesado que el jugador.
        car.velX -= along * normal.x * 1.35;
        car.velZ -= along * normal.z * 1.35;
      }
      car.velZ = t.speed + (car.velZ - t.speed) * 0.55;
      car.yawRate *= 0.4;

      if (t.hitCooldown <= 0) {
        t.hitCooldown = 0.5;
        ev.onCrash(rel, t.dir < 0);
      }
      continue;
    }

    const gap = Math.abs(car.posX - t.x) - (spec.bodyWidth + t.width) * 0.5;
    const alongside = Math.abs(dz) < (spec.bodyLength + t.length) * 0.5 + 0.5;

    if (!t.nearMissed && alongside && gap < 1.3) {
      t.nearMissed = true;
      ev.onNearMiss(t, gap);
    }
    // Sobrepaso: quedó atrás y va en tu mano
    if (!t.passed && dz < -(spec.bodyLength + t.length) * 0.5) {
      t.passed = true;
      ev.onOvertake(t);
    }
  }
}

// ─────────────────────────── score del modo tráfico ───────────────────────────

export interface TrafficStats {
  score: number;
  distance: number;
  overtakes: number;
  nearMisses: number;
  bestCombo: number;
  topSpeed: number;
  oncomingTime: number;
  crashed: boolean;
}

export function emptyTrafficStats(): TrafficStats {
  return {
    score: 0, distance: 0, overtakes: 0, nearMisses: 0,
    bestCombo: 1, topSpeed: 0, oncomingTime: 0, crashed: false,
  };
}

/**
 * El score premia velocidad y riesgo, no distancia sola: ir a 90 en el carril
 * vacío no paga casi nada, cruzar a la mano contraria a 180 paga muchísimo.
 */
export class TrafficScore {
  stats = emptyTrafficStats();
  combo = 1;
  comboTimer = 0;
  private lastZ = 0;
  private maxZ = 0;

  reset(car: CarState): void {
    this.stats = emptyTrafficStats();
    this.combo = 1;
    this.comboTimer = 0;
    this.lastZ = car.posZ;
    this.maxZ = car.posZ;
  }

  update(car: CarState, world: HighwayWorld, dt: number): void {
    const advanced = Math.max(0, car.posZ - this.lastZ);
    this.lastZ = car.posZ;
    this.maxZ = Math.max(this.maxZ, car.posZ);
    this.stats.distance += advanced;

    const kmh = car.speed * 3.6;
    this.stats.topSpeed = Math.max(this.stats.topSpeed, kmh);

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 1;
    }

    const oncoming = world.inOncoming(car.posX, car.posZ);
    if (oncoming) this.stats.oncomingTime += dt;

    // Puntos por metro, escalados por velocidad y por riesgo
    const speedFactor = clamp((kmh - 55) / 90, 0, 2.2);
    const risk = oncoming ? 2.2 : 1;
    this.stats.score += advanced * speedFactor * risk * this.combo * 1.4;
  }

  nearMiss(gap: number): number {
    this.combo = Math.min(10, this.combo + 0.5);
    this.comboTimer = 3;
    this.stats.nearMisses++;
    this.stats.bestCombo = Math.max(this.stats.bestCombo, this.combo);
    const points = Math.round(140 * (1 + (1.3 - gap)) * this.combo);
    this.stats.score += points;
    return points;
  }

  overtake(): number {
    const points = Math.round(35 * this.combo);
    this.stats.overtakes++;
    this.stats.score += points;
    return points;
  }

  /** Roce sin consecuencias fatales: te llevás el combo puesto y nada más. */
  bump(): void {
    this.combo = 1;
    this.comboTimer = 0;
  }

  crash(): void {
    this.stats.crashed = true;
    this.combo = 1;
  }

  /** Z más adelantado que alcanzó el jugador. Sirve para detectar retrocesos. */
  get furthestZ(): number {
    return this.maxZ;
  }
}
