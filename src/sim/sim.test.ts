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

describe('autopista (modo tráfico)', () => {
  it('la calzada, la banquina y los guardarraíles quedan en ese orden', async () => {
    const { HighwayWorld, TRAFFIC_PRESETS } = await import('./Highway');
    const w = new HighwayWorld(TRAFFIC_PRESETS.autopista);
    const cx = w.centerX(0);

    expect(w.halfWidth).toBeGreaterThan(0);
    expect(w.railOffset).toBeGreaterThan(w.halfWidth);

    expect(w.onRoad(cx, 0)).toBe(true);
    expect(w.onRoad(cx + w.halfWidth - 0.5, 0)).toBe(true);
    expect(w.onRoad(cx + w.railOffset, 0)).toBe(false);

    // El grip cae al salirse: asfalto → banquina → pasto
    expect(w.gripAt(cx, 0)).toBe(1);
    expect(w.gripAt(cx + w.halfWidth + 1, 0)).toBeLessThan(1);
    expect(w.gripAt(cx + w.halfWidth + 10, 0)).toBeLessThan(w.gripAt(cx + w.halfWidth + 1, 0));
  });

  it('todos los carriles caen dentro de la calzada y no se pisan', async () => {
    const { HighwayWorld, TRAFFIC_PRESETS } = await import('./Highway');
    for (const cfg of Object.values(TRAFFIC_PRESETS)) {
      const w = new HighwayWorld(cfg);
      const lanes: number[] = [];
      for (let i = 0; i < cfg.lanes; i++) lanes.push(i);
      if (cfg.twoWay) for (let i = 1; i <= cfg.lanes; i++) lanes.push(-i);

      const centers = lanes.map((l) => w.laneCenter(0, l) - w.centerX(0)).sort((a, b) => a - b);
      for (const c of centers) {
        expect(Math.abs(c) + cfg.laneWidth / 2).toBeLessThanOrEqual(w.halfWidth + 1e-9);
      }
      for (let i = 1; i < centers.length; i++) {
        expect(centers[i] - centers[i - 1]).toBeCloseTo(cfg.laneWidth, 6);
      }
    }
  });

  it('la mano contraria solo existe si la ruta es de doble mano', async () => {
    const { HighwayWorld, TRAFFIC_PRESETS } = await import('./Highway');
    const two = new HighwayWorld(TRAFFIC_PRESETS.autopista);
    const one = new HighwayWorld(TRAFFIC_PRESETS.ruta_libre);
    expect(two.inOncoming(two.centerX(0) - 3, 0)).toBe(true);
    expect(two.inOncoming(two.centerX(0) + 3, 0)).toBe(false);
    expect(one.inOncoming(one.centerX(0) - 3, 0)).toBe(false);
  });

  it('el tráfico se repuebla siempre por delante del jugador', async () => {
    const { HighwayWorld, TRAFFIC_PRESETS } = await import('./Highway');
    const w = new HighwayWorld(TRAFFIC_PRESETS.autopista);
    w.reset(0);
    expect(w.cars.filter((c) => c.active).length).toBeGreaterThan(0);

    let z = 0;
    for (let f = 0; f < 4000; f++) {
      z += 50 * DT;
      w.update(z, DT);
    }
    const active = w.cars.filter((c) => c.active);
    expect(active.length).toBeGreaterThan(0);
    // Ninguno quedó colgado kilómetros atrás: el reciclado funciona
    for (const c of active) expect(c.z).toBeGreaterThan(z - 200);
    // Y siempre hay alguno adelante para esquivar
    expect(active.some((c) => c.z > z + 50)).toBe(true);
  });

  it('con densidad alta no aparecen autos encimados en el mismo carril', async () => {
    const { HighwayWorld, TRAFFIC_PRESETS } = await import('./Highway');
    for (const cfg of Object.values(TRAFFIC_PRESETS)) {
      const w = new HighwayWorld(cfg);
      w.reset(0);
      let z = 0;
      for (let f = 0; f < 3000; f++) {
        z += 55 * DT;
        w.update(z, DT);

        // Dos autos del mismo carril nunca pueden ocupar el mismo tramo
        const byLane = new Map<number, { z: number; length: number }[]>();
        for (const c of w.cars) {
          if (!c.active) continue;
          const list = byLane.get(c.lane) ?? [];
          list.push({ z: c.z, length: c.length });
          byLane.set(c.lane, list);
        }
        for (const list of byLane.values()) {
          list.sort((a, b) => a.z - b.z);
          for (let i = 1; i < list.length; i++) {
            const gap = list[i].z - list[i - 1].z - (list[i].length + list[i - 1].length) * 0.5;
            expect(gap).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('la densidad alcanza para tener siempre autos que esquivar adelante', async () => {
    const { HighwayWorld, TRAFFIC_PRESETS } = await import('./Highway');
    const w = new HighwayWorld(TRAFFIC_PRESETS.autopista);
    w.reset(0);
    let z = 0;
    let peor = Infinity;
    for (let f = 0; f < 3000; f++) {
      z += 55 * DT;
      w.update(z, DT);
      if (f % 60 !== 0) continue;
      const delante = w.cars.filter((c) => c.active && c.z > z && c.z < z + 250).length;
      peor = Math.min(peor, delante);
    }
    expect(peor).toBeGreaterThanOrEqual(6);
  });

  it('el guardarraíl frena al auto en vez de dejarlo salir', async () => {
    const { HighwayWorld, TRAFFIC_PRESETS, resolveHighway } = await import('./Highway');
    const w = new HighwayWorld(TRAFFIC_PRESETS.autopista);
    for (const c of w.cars) c.active = false;
    const spec = getCar('kite_240').spec;
    const car = createCarState(w.centerX(0) + w.railOffset + 5, 0, 0);
    car.velX = 12;
    let railHits = 0;
    resolveHighway(car, spec, w, {
      onNearMiss: () => {}, onOvertake: () => {},
      onCrash: () => {}, onRail: () => { railHits++; },
    });
    expect(railHits).toBe(1);
    expect(Math.abs(w.lateral(car.posX, car.posZ))).toBeLessThanOrEqual(w.railOffset + 1e-6);
    expect(car.velX).toBeLessThan(0); // rebotó hacia adentro
  });

  it('un contacto sostenido cuenta un solo choque, no uno por frame', async () => {
    const { HighwayWorld, TRAFFIC_PRESETS, resolveHighway } = await import('./Highway');
    const w = new HighwayWorld(TRAFFIC_PRESETS.autopista);
    w.reset(0);
    for (const c of w.cars) c.active = false;

    const target = w.cars[0];
    target.active = true;
    target.lane = 0;
    target.z = 20;
    target.x = w.laneCenter(20, 0);
    target.speed = 20;
    target.dir = 1;
    target.length = 4.6;
    target.width = 1.9;
    target.hitCooldown = 0;

    const spec = getCar('kite_240').spec;
    const car = createCarState(target.x, target.z, 0);
    car.velZ = 40;

    let crashes = 0;
    for (let f = 0; f < 30; f++) {
      resolveHighway(car, spec, w, {
        onNearMiss: () => {}, onOvertake: () => {},
        onCrash: () => { crashes++; }, onRail: () => {},
      });
      w.update(car.posZ, DT);
    }
    expect(crashes).toBe(1);
  });

  it('el score premia velocidad y riesgo, no distancia sola', async () => {
    const { HighwayWorld, TRAFFIC_PRESETS, TrafficScore } = await import('./Highway');
    const w = new HighwayWorld(TRAFFIC_PRESETS.autopista);
    for (const c of w.cars) c.active = false;

    const run = (speed: number, oncoming: boolean): number => {
      const s = new TrafficScore();
      const car = createCarState(w.centerX(0) + (oncoming ? -3 : 3), 0, 0);
      s.reset(car);
      for (let f = 0; f < 600; f++) {
        car.posZ += speed * DT;
        car.posX = w.centerX(car.posZ) + (oncoming ? -3 : 3);
        car.speed = speed;
        s.update(car, w, DT);
      }
      return s.stats.score;
    };

    const slow = run(18, false);   // ~65 km/h
    const fast = run(50, false);   // ~180 km/h
    const risky = run(50, true);
    expect(fast).toBeGreaterThan(slow * 3);
    expect(risky).toBeGreaterThan(fast * 1.8);
  });

  it('pasar al ras sube el combo y se cae solo con el tiempo', async () => {
    const { HighwayWorld, TRAFFIC_PRESETS, TrafficScore } = await import('./Highway');
    const w = new HighwayWorld(TRAFFIC_PRESETS.autopista);
    for (const c of w.cars) c.active = false;
    const s = new TrafficScore();
    const car = createCarState(w.centerX(0) + 3, 0, 0);
    s.reset(car);

    s.nearMiss(0.3);
    s.nearMiss(0.3);
    expect(s.combo).toBeGreaterThan(1);
    expect(s.stats.nearMisses).toBe(2);

    car.speed = 40;
    for (let f = 0; f < 600; f++) {
      car.posZ += 40 * DT;
      s.update(car, w, DT);
    }
    expect(s.combo).toBe(1); // se venció la ventana de 3 s
    expect(s.stats.bestCombo).toBeGreaterThan(1);
  });
});

describe('perfiles de manejo', () => {
  it('el perfil de tráfico va mucho más plantado que el de drift', async () => {
    const { HANDLING } = await import('./Handling');
    const spec = getCar('kite_240').spec;

    /**
     * Mismo latigazo de volante a 160 km/h en los dos perfiles: tope de lock a
     * un lado, tope al otro y soltar. Devuelve el ángulo máximo que se cruzó y
     * el que le queda un segundo después de soltar.
     */
    const flick = (mode: 'drift' | 'traffic'): { peak: number; settled: number } => {
      const car = createCarState(0, 0, 0);
      car.velZ = 45;
      car.speed = 45;
      car.gear = 4;
      car.rpm = 5000;
      const input = createInput();
      const c = ctx({ handling: HANDLING[mode] });
      let peak = 0;
      for (let f = 0; f < 360; f++) {
        input.throttle = 1;
        input.steer = f < 60 ? 1 : f < 120 ? -1 : 0;
        stepCar(car, spec, input, c, DT);
        peak = Math.max(peak, car.driftAngle);
      }
      return { peak, settled: car.driftAngle };
    };

    const drift = flick('drift');
    const traffic = flick('traffic');
    expect(traffic.peak).toBeLessThan(drift.peak);
    expect(traffic.peak).toBeLessThan(DEG(30));
    // Lo que de verdad define "plantado": soltando el volante se endereza solo.
    expect(traffic.settled).toBeLessThan(DEG(4));
  });

  it('en tráfico el auto no se cruza solo yendo derecho a fondo', async () => {
    const { HANDLING } = await import('./Handling');
    const spec = getCar('kite_300zt').spec;
    const car = createCarState(0, 0, 0);
    car.velZ = 30;
    car.speed = 30;
    car.gear = 3;
    car.rpm = 5000;
    const input = createInput();
    input.throttle = 1;
    const c = ctx({ handling: HANDLING.traffic });
    for (let f = 0; f < 1200; f++) stepCar(car, spec, input, c, DT);
    expect(car.driftAngle).toBeLessThan(DEG(2));
    expect(Math.abs(car.posX)).toBeLessThan(1);
  });
});
