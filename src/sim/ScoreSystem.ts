import { clamp, degrees, DEG } from '../lib/math';
import { bus } from '../core/EventBus';
import type { CarSpec, CarState } from './types';
import type { SimWorld } from './World';

export const TIERS: { at: number; mult: number; label: string }[] = [
  { at: 0.0, mult: 1.0, label: '' },
  { at: 1.5, mult: 1.5, label: 'NICE' },
  { at: 3.0, mult: 2.0, label: 'GOOD' },
  { at: 5.0, mult: 3.0, label: 'GREAT' },
  { at: 8.0, mult: 4.5, label: 'AMAZING' },
  { at: 12.0, mult: 6.5, label: 'INSANE' },
  { at: 18.0, mult: 9.0, label: 'LEGENDARY' },
  { at: 26.0, mult: 12.0, label: 'APEX' },
];

export const SCORE_BASE_RATE = 120;
export const CHAIN_GRACE = 1.6;

export interface RunStats {
  score: number;
  bestMultiplier: number;
  longestDrift: number;
  driftDistance: number;
  crashes: number;
  cones: number;
  transitions: number;
  wallRides: number;
  nearMisses: number;
  topSpeed: number;
  cleanRun: boolean;
  zoneScore: Record<string, number>;
  chainedCorners: number;
  bestChainedCorners: number;
}

function emptyStats(): RunStats {
  return {
    score: 0,
    bestMultiplier: 1,
    longestDrift: 0,
    driftDistance: 0,
    crashes: 0,
    cones: 0,
    transitions: 0,
    wallRides: 0,
    nearMisses: 0,
    topSpeed: 0,
    cleanRun: true,
    zoneScore: {},
    chainedCorners: 0,
    bestChainedCorners: 0,
  };
}

export class ScoreSystem {
  pending = 0;
  multiplier = 1;
  tierIndex = 0;
  driftDuration = 0;
  graceTimer = 0;
  active = false;
  stats: RunStats = emptyStats();

  /** Bonus adicional al multiplicador por perks/legacy. */
  extraMultiplier = 0;
  /** Escala del tiempo necesario para subir de tier (perk Adrenalina). */
  tierSpeed = 1;

  private lastSign = 0;
  private maxAngleThisDrift = 0;
  private wallRideTimer = 0;
  private fullLockTimer = 0;
  private speedDemonTimer = 0;
  private longDriftAwarded = false;
  private rotationAccum = 0;
  private donutCount = 0;
  private threadCooldown = 0;
  private progressTimer = 0;
  private progressX = 0;
  private progressZ = 0;
  private stalled = false;
  private prevYaw = 0;

  reset(car: CarState): void {
    this.pending = 0;
    this.multiplier = 1 + this.extraMultiplier;
    this.tierIndex = 0;
    this.driftDuration = 0;
    this.graceTimer = 0;
    this.active = false;
    this.stats = emptyStats();
    this.lastSign = 0;
    this.maxAngleThisDrift = 0;
    this.wallRideTimer = 0;
    this.fullLockTimer = 0;
    this.speedDemonTimer = 0;
    this.longDriftAwarded = false;
    this.rotationAccum = 0;
    this.donutCount = 0;
    this.threadCooldown = 0;
    this.progressTimer = 0;
    this.progressX = car.posX;
    this.progressZ = car.posZ;
    this.stalled = false;
    this.prevYaw = car.yaw;
  }

  private isValidDrift(car: CarState, world: SimWorld): boolean {
    return (
      car.driftAngle > DEG(10) &&
      car.driftAngle < DEG(110) &&
      car.speed > 6.5 &&
      car.rearSlipVelocity > 1.4 &&
      world.scorableAt(car.posX, car.posZ)
    );
  }

  private tierFor(duration: number): number {
    const d = duration * this.tierSpeed;
    let idx = 0;
    for (let i = 0; i < TIERS.length; i++) if (d >= TIERS[i].at) idx = i;
    return idx;
  }

  private multiplierFor(duration: number): number {
    const d = duration * this.tierSpeed;
    let idx = 0;
    for (let i = 0; i < TIERS.length; i++) if (d >= TIERS[i].at) idx = i;
    if (idx >= TIERS.length - 1) return TIERS[idx].mult + this.extraMultiplier;
    const a = TIERS[idx];
    const b = TIERS[idx + 1];
    const t = (d - a.at) / (b.at - a.at);
    return a.mult + (b.mult - a.mult) * t + this.extraMultiplier;
  }

  update(car: CarState, spec: CarSpec, world: SimWorld, dt: number): void {
    this.stats.topSpeed = Math.max(this.stats.topSpeed, car.speed * 3.6);
    if (this.threadCooldown > 0) this.threadCooldown -= dt;

    const valid = this.isValidDrift(car, world);

    if (valid) {
      if (!this.active) this.startDrift(car);
      this.active = true;
      this.graceTimer = 0;
      this.driftDuration += this.stalled ? 0 : dt;
      this.stats.longestDrift = Math.max(this.stats.longestDrift, this.driftDuration);
      this.stats.driftDistance += car.speed * dt;
      this.maxAngleThisDrift = Math.max(this.maxAngleThisDrift, car.driftAngle);

      this.updateProgress(car, dt);
      this.accumulate(car, world, dt);
      this.checkBonuses(car, spec, world, dt);

      const newTier = this.tierFor(this.driftDuration);
      if (newTier > this.tierIndex) {
        this.tierIndex = newTier;
        bus.emit('drift:tier', {
          tier: newTier,
          label: TIERS[newTier].label,
          mult: TIERS[newTier].mult,
        });
      }
      this.multiplier = this.multiplierFor(this.driftDuration);
      this.stats.bestMultiplier = Math.max(this.stats.bestMultiplier, this.multiplier);
    } else if (this.active || this.graceTimer > 0) {
      // Ventana de gracia: 1.2 s para encadenar la próxima curva.
      if (this.active) {
        this.active = false;
        this.graceTimer = CHAIN_GRACE;
      }
      this.graceTimer -= dt;
      this.wallRideTimer = 0;
      this.fullLockTimer = 0;
      if (this.graceTimer <= 0) this.bank(car);
    }

    world.decayHeat(dt);
    this.prevYaw = car.yaw;
  }

  private startDrift(car: CarState): void {
    const sign = Math.sign(car.driftAngleSigned);
    // Transición: cambio de lado dentro de la gracia, con ángulo real en ambos.
    if (
      this.graceTimer > 0 &&
      this.lastSign !== 0 &&
      sign !== 0 &&
      sign !== this.lastSign &&
      this.maxAngleThisDrift > DEG(25) &&
      car.driftAngle > DEG(20)
    ) {
      this.pending += 500;
      this.multiplier += 0.25;
      this.extraMultiplier += 0.25;
      this.stats.transitions++;
      this.stats.chainedCorners++;
      this.stats.bestChainedCorners = Math.max(
        this.stats.bestChainedCorners,
        this.stats.chainedCorners,
      );
      bus.emit('bonus', { label: 'TRANSITION', points: 500, x: car.posX, z: car.posZ });
    } else if (this.graceTimer > 0) {
      this.stats.chainedCorners++;
      this.stats.bestChainedCorners = Math.max(
        this.stats.bestChainedCorners,
        this.stats.chainedCorners,
      );
    } else {
      this.stats.chainedCorners = 1;
      this.rotationAccum = 0;
      this.donutCount = 0;
      this.longDriftAwarded = false;
    }
    this.lastSign = sign;
    this.maxAngleThisDrift = car.driftAngle;
    bus.emit('drift:start', { angle: car.driftAngle });
  }

  private updateProgress(car: CarState, dt: number): void {
    this.progressTimer += dt;
    if (this.progressTimer >= 2) {
      const moved = Math.hypot(car.posX - this.progressX, car.posZ - this.progressZ);
      this.stalled = moved < 12;
      this.progressTimer = 0;
      this.progressX = car.posX;
      this.progressZ = car.posZ;
    }
  }

  private accumulate(car: CarState, world: SimWorld, dt: number): void {
    const speedKmh = car.speed * 3.6;
    const fSpeed = clamp(speedKmh / 100, 0.3, 2.2);

    const a = degrees(car.driftAngle);
    const fAngle = a < 10 || a > 105 ? 0 : Math.pow(Math.sin((Math.PI * (a - 10)) / 95), 0.6);

    const d = world.nearestWallDistance(car.posX, car.posZ);
    const fProx = d < 2.5 ? 1 + 0.9 * (1 - d / 2.5) : 1.0;

    const fZone = world.zoneMultiplierAt(car.posX, car.posZ);

    // Anti-farming: la misma esquina rinde cada vez menos.
    const heat = world.heatAt(car.posX, car.posZ);
    const fHeat = 1 / (1 + heat * 0.6);
    world.addHeat(car.posX, car.posZ, dt * 0.5);

    const gained = SCORE_BASE_RATE * fSpeed * fAngle * fProx * this.multiplier * fZone * fHeat * dt;
    this.pending += gained;

    const zone = world.zoneNameAt(car.posX, car.posZ);
    if (zone) this.stats.zoneScore[zone] = (this.stats.zoneScore[zone] ?? 0) + gained;
  }

  private checkBonuses(car: CarState, spec: CarSpec, world: SimWorld, dt: number): void {
    // WALL RIDE
    const wallDist = world.nearestWallDistance(car.posX, car.posZ, 4) - spec.bodyWidth * 0.5;
    if (wallDist < 0.8) {
      this.wallRideTimer += dt;
      if (this.wallRideTimer > 0.5) {
        this.pending += 300 * dt;
        if (Math.floor(this.wallRideTimer) !== Math.floor(this.wallRideTimer - dt)) {
          this.stats.wallRides++;
          bus.emit('bonus', { label: 'WALL RIDE', points: 300, x: car.posX, z: car.posZ });
        }
      }
    } else {
      this.wallRideTimer = 0;
    }

    // FULL LOCK
    if (car.driftAngle > DEG(70)) {
      this.fullLockTimer += dt;
      if (this.fullLockTimer > 1.5) {
        this.fullLockTimer = 0;
        this.pending += 400;
        bus.emit('bonus', { label: 'FULL LOCK', points: 400, x: car.posX, z: car.posZ });
      }
    } else {
      this.fullLockTimer = 0;
    }

    // SPEED DEMON
    if (car.speed * 3.6 > 140) {
      this.speedDemonTimer += dt;
      if (this.speedDemonTimer > 1) {
        this.speedDemonTimer = 0;
        this.pending += 600;
        bus.emit('bonus', { label: 'SPEED DEMON', points: 600, x: car.posX, z: car.posZ });
      }
    } else {
      this.speedDemonTimer = 0;
    }

    // LONG DRIFT
    if (!this.longDriftAwarded && this.driftDuration > 15) {
      this.longDriftAwarded = true;
      this.pending += 1000;
      bus.emit('bonus', { label: 'LONG DRIFT', points: 1000, x: car.posX, z: car.posZ });
    }

    // DONUT: rotación acumulada de 360°
    let dyaw = car.yaw - this.prevYaw;
    if (dyaw > Math.PI) dyaw -= Math.PI * 2;
    if (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.rotationAccum += dyaw;
    if (Math.abs(this.rotationAccum) > Math.PI * 2) {
      this.rotationAccum = 0;
      this.donutCount++;
      const pts = this.donutCount <= 3 ? 300 : 60;
      this.pending += pts;
      bus.emit('bonus', { label: 'DONUT', points: pts, x: car.posX, z: car.posZ });
    }

    // THREADING: pasar apretado entre dos obstáculos, uno a cada lado.
    if (this.threadCooldown <= 0 && car.speed > 12) {
      const cos = Math.cos(car.yaw);
      const sin = Math.sin(car.yaw);
      const lx = car.posX + cos * 2.2;
      const lz = car.posZ - sin * 2.2;
      const rx = car.posX - cos * 2.2;
      const rz = car.posZ + sin * 2.2;
      const dl = world.nearestWallDistance(lx, lz, 4);
      const dr = world.nearestWallDistance(rx, rz, 4);
      if (dl < 1.6 && dr < 1.6) {
        this.threadCooldown = 2;
        this.pending += 800;
        bus.emit('bonus', { label: 'THREADING', points: 800, x: car.posX, z: car.posZ });
      }
    }
  }

  /** Cobra los puntos pendientes. */
  bank(car: CarState): void {
    if (this.pending > 0) {
      const points = Math.floor(this.pending);
      this.stats.score += points;
      bus.emit('drift:bank', { points, mult: this.multiplier, x: car.posX, z: car.posZ });
    }
    this.pending = 0;
    this.multiplier = 1 + this.extraMultiplier;
    this.tierIndex = 0;
    this.driftDuration = 0;
    this.graceTimer = 0;
    this.active = false;
    this.lastSign = 0;
    this.stats.chainedCorners = 0;
    this.stalled = false;
  }

  /** Un choque: raspón resta, golpe cobra parcial, crash pierde todo. */
  onImpact(car: CarState, severity: 'scrape' | 'hit' | 'crash', shielded: boolean): void {
    if (severity === 'scrape') {
      this.multiplier = Math.max(1, this.multiplier * 0.85);
      return;
    }
    if (shielded) return;
    this.stats.crashes++;
    this.stats.cleanRun = false;
    if (severity === 'hit') {
      const points = Math.floor(this.pending * 0.4);
      if (points > 0) {
        this.stats.score += points;
        bus.emit('drift:bank', { points, mult: this.multiplier, x: car.posX, z: car.posZ });
      }
    } else {
      bus.emit('drift:lost', { points: Math.floor(this.pending) });
    }
    this.pending = 0;
    this.multiplier = 1 + this.extraMultiplier;
    this.tierIndex = 0;
    this.driftDuration = 0;
    this.graceTimer = 0;
    this.active = false;
    this.stats.chainedCorners = 0;
  }

  onConeDestroyed(car: CarState, hype: number): void {
    this.stats.cones++;
    this.pending += hype;
    bus.emit('bonus', { label: 'CONE', points: hype, x: car.posX, z: car.posZ });
  }

  onNearMiss(car: CarState): void {
    this.stats.nearMisses++;
    this.pending += 200;
    bus.emit('bonus', { label: 'NEAR MISS', points: 200, x: car.posX, z: car.posZ });
  }
}
