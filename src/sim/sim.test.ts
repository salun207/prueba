import { describe, expect, it } from 'vitest';
import { buildHarborMap } from '../data/maps/harbor';
import { CARS, getCar } from '../data/cars';
import { DEG } from '../lib/math';
import { stepCar, type PhysicsContext } from './CarPhysics';
import { sampleTorqueCurve, tireForceNormalized } from './TireModel';
import { ScoreSystem } from './ScoreSystem';
import { createCarState, createInput, type CarState, type InputState } from './types';
import { SimWorld } from './World';
import { resolveCollisions } from './Collision';

const DT = 1 / 120;

function ctx(over: Partial<PhysicsContext> = {}): PhysicsContext {
  return { surfaceGrip: 1, assistLevel: 'standard', torqueScale: 1, gripScale: 1, ...over };
}

function hash(car: CarState): string {
  return [car.posX, car.posZ, car.velX, car.velZ, car.yaw, car.yawRate, car.rpm]
    .map((v) => v.toFixed(6))
    .join('|');
}

/** Guion de inputs determinista: acelerar, girar, handbrake, contravolante. */
function scriptedInput(frame: number, input: InputState): InputState {
  const t = frame * DT;
  input.throttle = t < 3 ? 1 : t < 5 ? 0.35 : 0.8;
  input.brake = 0;
  input.steer = t < 3 ? 0 : t < 3.6 ? 1 : t < 6 ? -0.55 : 0.3;
  input.handbrake = t >= 3 && t < 3.4;
  return input;
}

describe('modelo de neumático', () => {
  it('es monótono hasta el pico y no explota', () => {
    let prev = 0;
    for (let a = 0; a < 0.12; a += 0.005) {
      const f = tireForceNormalized(a, 11.5, 0.34);
      expect(Number.isFinite(f)).toBe(true);
      expect(f).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = f;
    }
  });

  it('es impar y está acotado', () => {
    for (let a = -2; a <= 2; a += 0.05) {
      const f = tireForceNormalized(a, 11.5, 0.34);
      expect(Math.abs(f)).toBeLessThanOrEqual(1.001);
      expect(f).toBeCloseTo(-tireForceNormalized(-a, 11.5, 0.34), 10);
    }
  });

  it('más falloff = menos grip pasado el pico', () => {
    const big = 0.5;
    const soft = tireForceNormalized(big, 11.5, 0.1);
    const hard = tireForceNormalized(big, 11.5, 0.7);
    expect(hard).toBeLessThan(soft);
  });

  it('interpola la curva de torque', () => {
    const curve: [number, number][] = [[1000, 100], [3000, 200]];
    expect(sampleTorqueCurve(curve, 500)).toBe(100);
    expect(sampleTorqueCurve(curve, 2000)).toBeCloseTo(150);
    expect(sampleTorqueCurve(curve, 9000)).toBe(200);
  });
});

describe('física del auto', () => {
  it('es determinista: mismo input, mismo resultado', () => {
    const spec = getCar('kite_300zt').spec;
    const run = (): string => {
      const car = createCarState(0, 0, 0);
      const input = createInput();
      for (let f = 0; f < 900; f++) stepCar(car, spec, scriptedInput(f, input), ctx(), DT);
      return hash(car);
    };
    expect(run()).toBe(run());
  });

  it('acelera de 0 a 60 km/h en un tiempo razonable', () => {
    const spec = getCar('kite_300zt').spec;
    const car = createCarState();
    const input = createInput();
    input.throttle = 1;
    let t = 0;
    while (car.speed * 3.6 < 60 && t < 15) {
      stepCar(car, spec, input, ctx(), DT);
      t += DT;
    }
    expect(t).toBeLessThan(8);
    expect(t).toBeGreaterThan(1);
  });

  it('el auto gira de verdad: no camina derecho mientras rota', () => {
    const spec = getCar('kite_300zt').spec;
    const car = createCarState();
    const input = createInput();
    input.throttle = 0.6;
    for (let f = 0; f < 240; f++) stepCar(car, spec, input, ctx(), DT);
    input.steer = 1; // derecha
    for (let f = 0; f < 240; f++) stepCar(car, spec, input, ctx(), DT);
    // Con yaw=0 mirando a +Z y +Y arriba, la derecha es -X: girando a la
    // derecha el yaw baja y el auto se va hacia -X.
    expect(car.yaw).toBeLessThan(-0.2);
    expect(car.posX).toBeLessThan(-2);
  });

  it('el handbrake suelta el tren trasero', () => {
    const spec = getCar('kite_300zt').spec;
    const base = createCarState();
    const hand = createCarState();
    const i1 = createInput();
    const i2 = createInput();
    i1.throttle = i2.throttle = 0.7;
    for (let f = 0; f < 300; f++) {
      stepCar(base, spec, i1, ctx(), DT);
      stepCar(hand, spec, i2, ctx(), DT);
    }
    i1.steer = i2.steer = 0.8;
    i2.handbrake = true;
    let maxBase = 0;
    let maxHand = 0;
    for (let f = 0; f < 180; f++) {
      stepCar(base, spec, i1, ctx(), DT);
      stepCar(hand, spec, i2, ctx(), DT);
      maxBase = Math.max(maxBase, base.driftAngle);
      maxHand = Math.max(maxHand, hand.driftAngle);
    }
    expect(maxHand).toBeGreaterThan(maxBase * 1.5);
  });

  it('se endereza solo al soltar todo, sin trompear (Pilar 1)', () => {
    const spec = getCar('kite_300zt').spec;
    const car = createCarState();
    const input = createInput();
    input.throttle = 1;
    for (let f = 0; f < 360; f++) stepCar(car, spec, input, ctx(), DT);

    // Iniciación normal de drift: handbrake corto con volante puesto
    input.steer = 0.8;
    input.handbrake = true;
    for (let f = 0; f < 42; f++) stepCar(car, spec, input, ctx(), DT);

    input.steer = 0;
    input.handbrake = false;
    input.throttle = 0;
    let t = 0;
    let maxAngle = 0;
    while (t < 3) {
      stepCar(car, spec, input, ctx(), DT);
      maxAngle = Math.max(maxAngle, car.driftAngle);
      t += DT;
      if (maxAngle > DEG(15) && car.driftAngle < DEG(5)) break;
    }
    expect(maxAngle).toBeGreaterThan(DEG(15));
    expect(car.driftAngle).toBeLessThan(DEG(5));
    expect(t).toBeLessThan(2.0);
  });

  it('el anti-trompo impide pasarse de rosca aguantando el drift', () => {
    const spec = getCar('kite_300zt').spec;
    const car = createCarState();
    const input = createInput();
    input.throttle = 1;
    for (let f = 0; f < 360; f++) stepCar(car, spec, input, ctx(), DT);
    input.steer = 1;
    input.handbrake = true;
    let maxAngle = 0;
    for (let f = 0; f < 90; f++) {
      stepCar(car, spec, input, ctx(), DT);
      maxAngle = Math.max(maxAngle, car.driftAngle);
    }
    // Se derrapa fuerte, pero no se trompea de una
    expect(maxAngle).toBeGreaterThan(DEG(25));
    expect(maxAngle).toBeLessThan(DEG(115));
  });

  it('no inventa energía: derrapando sin acelerador, frena', () => {
    const spec = getCar('kite_300zt').spec;
    const car = createCarState();
    const input = createInput();
    input.throttle = 1;
    for (let f = 0; f < 360; f++) stepCar(car, spec, input, ctx(), DT);
    input.steer = 0.9;
    input.handbrake = true;
    for (let f = 0; f < 60; f++) stepCar(car, spec, input, ctx(), DT);
    const speedAtStart = car.speed;
    input.throttle = 0;
    for (let f = 0; f < 240; f++) stepCar(car, spec, input, ctx(), DT);
    expect(car.speed).toBeLessThan(speedAtStart);
  });

  it('ningún auto produce NaN con inputs extremos (fuzz)', () => {
    let seed = 12345;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (const def of CARS) {
      const car = createCarState();
      const input = createInput();
      for (let f = 0; f < 3000; f++) {
        if (f % 7 === 0) {
          input.throttle = rand();
          input.brake = rand();
          input.steer = rand() * 2 - 1;
          input.handbrake = rand() > 0.6;
        }
        stepCar(car, def.spec, input, ctx({ surfaceGrip: 0.4 + rand() }), DT);
      }
      for (const [k, v] of Object.entries(car)) {
        if (typeof v !== 'number') continue;
        expect(Number.isFinite(v), `${def.id}.${k} = ${v}`).toBe(true);
      }
    }
  });
});

describe('mundo y colisiones', () => {
  const world = new SimWorld(buildHarborMap());

  it('el spawn está sobre asfalto y libre de obstáculos', () => {
    const s = world.def.spawn;
    expect(world.gripAt(s.x, s.z)).toBeGreaterThan(0.9);
    expect(world.nearestWallDistance(s.x, s.z)).toBeGreaterThan(3);
  });

  it('genera una ciudad con densidad razonable', () => {
    expect(world.def.obstacles.length).toBeGreaterThan(300);
    expect(world.def.destructibles.length).toBeGreaterThan(200);
    expect(world.def.roads.length).toBeGreaterThan(30);
  });

  it('el auto no atraviesa un edificio', () => {
    const spec = getCar('kite_300zt').spec;
    const building = world.def.obstacles.find((o) => o.kind === 'building')!;
    const car = createCarState(building.x, building.z - building.hd - 14, 0);
    const input = createInput();
    input.throttle = 1;
    let hits = 0;
    for (let f = 0; f < 900; f++) {
      stepCar(car, spec, input, ctx(), DT);
      resolveCollisions(car, spec, world, [], () => hits++, () => {});
    }
    expect(hits).toBeGreaterThan(0);
    // Nunca queda dentro del edificio
    const insideX = Math.abs(car.posX - building.x) < building.hw;
    const insideZ = Math.abs(car.posZ - building.z) < building.hd;
    expect(insideX && insideZ).toBe(false);
  });
});

describe('score', () => {
  it('no puntúa fuera de la ventana de ángulo', () => {
    const world = new SimWorld(buildHarborMap());
    const score = new ScoreSystem();
    const car = createCarState(world.def.spawn.x, world.def.spawn.z, 0);
    score.reset(car);
    car.speed = 25;
    car.rearSlipVelocity = 5;
    car.driftAngle = DEG(5);
    car.driftAngleSigned = DEG(5);
    for (let f = 0; f < 60; f++) score.update(car, getCar('kite_300zt').spec, world, DT);
    expect(score.pending).toBe(0);
  });

  it('acumula y cobra al terminar el drift', () => {
    const world = new SimWorld(buildHarborMap());
    const score = new ScoreSystem();
    const spec = getCar('kite_300zt').spec;
    const car = createCarState(world.def.spawn.x, world.def.spawn.z, 0);
    score.reset(car);
    car.speed = 25;
    car.rearSlipVelocity = 6;
    car.driftAngle = DEG(50);
    car.driftAngleSigned = DEG(50);
    for (let f = 0; f < 240; f++) {
      car.posZ += car.speed * DT; // avanza: si no, entra en stall
      score.update(car, spec, world, DT);
    }
    expect(score.pending).toBeGreaterThan(0);
    expect(score.multiplier).toBeGreaterThan(1.4);
    expect(score.stats.score).toBe(0);

    score.bank(car);
    expect(score.stats.score).toBeGreaterThan(0);
    expect(score.pending).toBe(0);
    expect(score.multiplier).toBe(1);
  });

  it('el anti-farming castiga quedarse en la misma esquina', () => {
    const world = new SimWorld(buildHarborMap());
    const spec = getCar('kite_300zt').spec;
    const measure = (advance: boolean): number => {
      const score = new ScoreSystem();
      const car = createCarState(world.def.spawn.x, world.def.spawn.z, 0);
      score.reset(car);
      car.speed = 25;
      car.rearSlipVelocity = 6;
      car.driftAngle = DEG(50);
      car.driftAngleSigned = DEG(50);
      for (let f = 0; f < 600; f++) {
        if (advance) car.posZ += car.speed * DT;
        score.update(car, spec, world, DT);
      }
      return score.pending;
    };
    expect(measure(false)).toBeLessThan(measure(true) * 0.6);
  });
});
