import { Rng } from '../core/Rng';
import type { Obb } from './Collision';
import type { CarState } from './types';
import type { TrafficLane } from './World';

export interface TrafficCar extends Obb {
  laneIndex: number;
  t: number; // 0..1 sobre la lane
  speed: number;
  dirX: number;
  dirZ: number;
  length: number;
  colorSeed: number;
  nearMissArmed: boolean;
}

const DENSITY: Record<string, number> = { off: 0, low: 0.35, medium: 0.7, high: 1.1 };

/** Tráfico simple sobre segmentos rectos. Barato, y es la mejor fuente de tensión del mapa. */
export class Traffic {
  cars: TrafficCar[] = [];
  private lanes: TrafficLane[];
  private rng = new Rng(9127);

  constructor(lanes: TrafficLane[], density: keyof typeof DENSITY | string = 'low') {
    this.lanes = lanes;
    const perLane = DENSITY[density] ?? 0.35;
    for (let i = 0; i < lanes.length; i++) {
      const lane = lanes[i];
      const len = Math.hypot(lane.bx - lane.ax, lane.bz - lane.az);
      const count = Math.max(0, Math.round((len / 140) * perLane * 2));
      for (let k = 0; k < count; k++) {
        this.cars.push(this.spawn(i, this.rng.next()));
      }
    }
  }

  private spawn(laneIndex: number, t: number): TrafficCar {
    const lane = this.lanes[laneIndex];
    const dx = lane.bx - lane.ax;
    const dz = lane.bz - lane.az;
    const len = Math.hypot(dx, dz) || 1;
    const dirX = dx / len;
    const dirZ = dz / len;
    const length = this.rng.range(4.2, 5.4);
    return {
      laneIndex,
      t,
      speed: this.rng.range(8, 14),
      dirX,
      dirZ,
      length,
      x: lane.ax + dx * t,
      z: lane.az + dz * t,
      hw: 0.95,
      hd: length * 0.5,
      rot: -Math.atan2(dirX, dirZ),
      colorSeed: this.rng.next(),
      nearMissArmed: true,
    };
  }

  update(car: CarState, dt: number, onNearMiss: () => void): void {
    for (const t of this.cars) {
      const lane = this.lanes[t.laneIndex];
      const dx = lane.bx - lane.ax;
      const dz = lane.bz - lane.az;
      const len = Math.hypot(dx, dz) || 1;

      // Frena si el jugador está adelante en su carril.
      const relX = car.posX - t.x;
      const relZ = car.posZ - t.z;
      const ahead = relX * t.dirX + relZ * t.dirZ;
      const side = Math.abs(relX * t.dirZ - relZ * t.dirX);
      const braking = ahead > 0 && ahead < 14 && side < 4;
      const target = braking ? 1.5 : t.speed;
      const current = t.speed;
      const applied = braking ? Math.max(1.5, current - 12 * dt) : current;

      t.t += ((applied * dt) / len) * (target > 0 ? 1 : 0);
      if (t.t > 1) t.t -= 1;
      t.x = lane.ax + dx * t.t;
      t.z = lane.az + dz * t.t;

      // NEAR MISS
      const d = Math.hypot(relX, relZ);
      if (t.nearMissArmed && d < 3.2 && car.speed > 16.6) {
        t.nearMissArmed = false;
        onNearMiss();
      } else if (d > 8) {
        t.nearMissArmed = true;
      }
    }
  }
}
