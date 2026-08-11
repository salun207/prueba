import { describe, expect, it } from 'vitest';
import { CARS, getCar } from '../data/cars';
import { UPGRADES, upgradeCost } from '../data/upgrades';
import { makeCar, newSave } from '../save/SaveManager';
import type { SaveGame } from '../save/types';
import { buildCar } from './CarBuild';
import {
  applyXp, CASH_RATE, computeBonuses, runRewards, styleMultiplier, xpForLevel,
} from './Economy';
import { ensureChallenges, evaluateChallenges } from './Challenges';
import * as A from './Actions';
import { fmt } from '../ui/format';
import type { RunStats } from '../sim/ScoreSystem';

// SaveManager usa localStorage; en node no existe, así que lo stubeamos.
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
} as Storage;

function stats(over: Partial<RunStats> = {}): RunStats {
  return {
    score: 20_000, bestMultiplier: 3, longestDrift: 8, driftDistance: 400, crashes: 0,
    cones: 12, transitions: 4, wallRides: 2, nearMisses: 1, topSpeed: 140,
    cleanRun: true, zoneScore: { Puerto: 8000 }, chainedCorners: 3, bestChainedCorners: 5,
    ...over,
  };
}

describe('economía sin tycoon', () => {
  it('no existe ninguna fuente de plata que no sea manejar', async () => {
    const eco = await import('./Economy');
    for (const banned of ['incomePerSecond', 'computeOffline', 'baseIncomePerSecond', 'bayIncome']) {
      expect(banned in eco, `${banned} debería estar borrado`).toBe(false);
    }
    const save = newSave();
    expect('hypeTotal' in save).toBe(false);
    expect('sponsors' in save).toBe(false);
    expect('parts' in save).toBe(false);
  });

  it('la plata escala lineal con el score', () => {
    const b = computeBonuses(newSave());
    const small = runRewards(stats({ score: 10_000 }), b);
    const big = runRewards(stats({ score: 100_000 }), b);
    // Mismo estilo, 10× de score → 10× de plata. Sin retornos decrecientes.
    expect(big.cash / small.cash).toBeCloseTo(10, 1);
  });

  it('manejar mejor paga más con el mismo score', () => {
    const b = computeBonuses(newSave());
    const sloppy = runRewards(
      stats({ bestMultiplier: 1.5, crashes: 4, cleanRun: false, wallRides: 0, transitions: 0, bestChainedCorners: 1 }),
      b,
    );
    const clean = runRewards(
      stats({ bestMultiplier: 8, crashes: 0, cleanRun: true, wallRides: 8, transitions: 12, bestChainedCorners: 10 }),
      b,
    );
    expect(clean.cash).toBeGreaterThan(sloppy.cash * 2);
  });

  it('chocar penaliza y nunca deja el pago en cero', () => {
    const bad = styleMultiplier(stats({ crashes: 20, cleanRun: false, bestMultiplier: 1, wallRides: 0, transitions: 0, bestChainedCorners: 0 }));
    expect(bad.total).toBeGreaterThanOrEqual(0.4);
    expect(bad.total).toBeLessThan(1);
  });

  it('menos asistencias = más plata', () => {
    const mk = (level: 'casual' | 'standard' | 'pro'): number => {
      const s = newSave();
      s.settings.assistLevel = level;
      return runRewards(stats(), computeBonuses(s)).cash;
    };
    expect(mk('pro')).toBeGreaterThan(mk('standard'));
    expect(mk('standard')).toBeGreaterThan(mk('casual'));
  });

  it('el ritmo de progresión es razonable: nada de plata regalada', () => {
    const b = computeBonuses(newSave());
    // Un run decente de principiante
    const rookie = runRewards(stats({ score: 12_000, bestMultiplier: 2.5 }), b).cash;
    // Un run bueno de alguien que ya sabe
    const good = runRewards(
      stats({ score: 150_000, bestMultiplier: 7, wallRides: 6, transitions: 10, bestChainedCorners: 8 }),
      b,
    ).cash;

    const firstUpgrade = upgradeCost(UPGRADES[0], 0);
    const secondCar = getCar('barrow_wedge').price;
    const midCar = getCar('kite_300zt').price;

    // La primera mejora entra con un run
    expect(firstUpgrade).toBeLessThan(rookie * 3);
    // El segundo auto cuesta varios runs de principiante, no uno
    expect(secondCar / rookie).toBeGreaterThan(3);
    expect(secondCar / rookie).toBeLessThan(20);
    // El auto del medio se compra con varios runs buenos
    expect(midCar / good).toBeGreaterThan(1);
    expect(midCar / good).toBeLessThan(15);
  });

  it('sube de nivel sin dejar XP negativa', () => {
    const save = newSave();
    const levels = applyXp(save, xpForLevel(1) * 3);
    expect(levels).toBeGreaterThan(0);
    expect(save.playerXp).toBeGreaterThanOrEqual(0);
  });
});

describe('acciones del garage', () => {
  it('no se puede comprar sin plata', () => {
    const save = newSave();
    save.cash = 0;
    expect(A.buyUpgrade(save, 0, 'engine')).toBe(false);
    expect(A.buyCar(save, 'barrow_wedge')).toBe(false);
  });

  it('comprar descuenta exactamente el precio', () => {
    const save = newSave();
    save.cash = 10_000;
    const price = A.upgradePrice(save, 0, 'engine')!;
    expect(A.buyUpgrade(save, 0, 'engine')).toBe(true);
    expect(save.cash).toBe(10_000 - price);
    expect(save.cars[0].upgrades.engine).toBe(1);
  });

  it('los autos top piden reputación además de plata', () => {
    const save = newSave();
    save.cash = 1e9;
    save.rep = 0;
    expect(A.carUnlock(save, 'phantom_01').ok).toBe(false);
    save.rep = 99_999;
    expect(A.carUnlock(save, 'phantom_01').ok).toBe(true);
  });

  it('nunca te quedás sin autos', () => {
    const save = newSave();
    expect(A.sellCar(save, save.cars[0].instanceId)).toBe(false);
  });

  it('vender devuelve plata y cambia el auto activo', () => {
    const save = newSave();
    save.cash = 1e6;
    expect(A.buyCar(save, 'barrow_wedge')).toBe(true);
    const extra = save.cars[1].instanceId;
    A.selectCar(save, extra);
    const before = save.cash;
    expect(A.sellCar(save, extra)).toBe(true);
    expect(save.cash).toBeGreaterThan(before);
    expect(save.activeCarInstanceId).toBe(save.cars[0].instanceId);
  });
});

describe('desafíos', () => {
  it('siempre hay 3 activos más el diario', () => {
    const save = newSave();
    ensureChallenges(save);
    expect(save.challenges.filter((c) => !c.daily && !c.done)).toHaveLength(3);
    expect(save.challenges.filter((c) => c.daily && !c.done)).toHaveLength(1);
  });

  it('completar paga una sola vez', () => {
    const save = newSave();
    save.challenges = [{
      id: 'x', type: 'score', text: 'test', target: 1000, progress: 0,
      reward: { cash: 500, rep: 1 }, done: false, daily: false, expiresAt: 0,
    }];
    evaluateChallenges(save, stats({ score: 5000 }), 1);
    expect(save.cash).toBe(500);
    evaluateChallenges(save, stats({ score: 5000 }), 1);
    expect(save.cash).toBe(500);
  });
});

describe('build del auto', () => {
  it('las mejoras cambian la física de verdad', () => {
    const save = newSave();
    const b = computeBonuses(save);
    const stock = buildCar(save.cars[0], b);
    const tuned = makeCar('kite_240');
    tuned.upgrades = { engine: 10, steering: 8, weight: 10, tires: 5 };
    const built = buildCar(tuned, b);
    expect(built.mods.torqueScale).toBeGreaterThan(stock.mods.torqueScale * 1.3);
    expect(built.spec.maxSteerAngle).toBeGreaterThan(stock.spec.maxSteerAngle);
    expect(built.spec.mass).toBeLessThan(stock.spec.mass);
  });

  it('el widebody ensancha la vía de verdad', () => {
    const save = newSave();
    const b = computeBonuses(save);
    const stock = buildCar(save.cars[0], b).spec.trackWidth;
    const wide = makeCar('kite_240');
    wide.cosmetics.bodyKit = 2;
    expect(buildCar(wide, b).spec.trackWidth).toBeGreaterThan(stock);
  });

  it('cada auto se siente distinto', () => {
    const b = computeBonuses(newSave());
    const seen = new Set<string>();
    for (const def of CARS) {
      const built = buildCar(makeCar(def.id), b);
      const sig = [
        Math.round(built.spec.mass / 60),
        Math.round(built.spec.tireFalloff * 25),
        Math.round(built.spec.maxSteerAngle * 20),
      ].join('/');
      expect(seen.has(sig), `${def.id} duplica el feel de otro auto`).toBe(false);
      seen.add(sig);
    }
  });
});

describe('migración de saves', () => {
  it('un save v1 con tycoon carga y pierde la capa idle', async () => {
    const v1 = {
      version: 1,
      cash: 999_999_999,
      hypeTotal: 5_000_000,
      parts: 400,
      legacy: 12,
      sponsors: { koen: 9 },
      staff: { mechanic: 4 },
      rooms: { office: 3 },
      bays: 5,
      prestigeCount: 2,
      contracts: [{
        id: 'a', type: 'score', text: 'viejo', target: 100, progress: 0,
        reward: { cash: 10, parts: 3, rep: 1 }, done: false, daily: false, expiresAt: 0,
      }],
      cars: [{
        id: 'kite_240', instanceId: 'x', level: 3, xp: 10,
        upgrades: { engine: 2 }, setup: {}, inBay: 0, isLegendary: false,
        cosmetics: { paintColor: '#fff', paintType: 'gloss', wheelId: 2, neonColor: '#0ff', bodyKit: 0 },
      }],
      activeCarInstanceId: 'x',
    };
    localStorage.setItem('neon-apex-save', JSON.stringify(v1));
    const { SaveManager } = await import('../save/SaveManager');
    const s = new SaveManager().data as SaveGame & Record<string, unknown>;

    expect(s.version).toBe(4);
    expect(s.hypeTotal).toBeUndefined();
    expect(s.sponsors).toBeUndefined();
    expect(s.bays).toBeUndefined();
    // La plata inflada por el idle se recorta
    expect(s.cash).toBeLessThanOrEqual(250_000);
    // Lo que sí es del jugador se conserva
    expect(s.cars[0].level).toBe(3);
    expect(s.cars[0].upgrades.engine).toBe(2);
    expect(s.challenges).toHaveLength(1);
    // v3: aparecen los mapas, y un save viejo arranca en el circuito
    expect(s.selectedMap).toBe('apex');
    expect(s.mapRecords).toEqual({});
    // v4: aparece el modo tráfico, pero un save viejo sigue en el que conocía
    expect(s.gameMode).toBe('drift');
    expect(s.selectedRoute).toBe('autopista');
    expect(s.trafficRecords).toEqual({});
    localStorage.clear();
  });
});

describe('circuitos', () => {
  it('el primero está abierto y los otros piden reputación creciente', async () => {
    const { MAPS, isMapUnlocked } = await import('../data/maps');
    expect(MAPS[0].repRequired).toBe(0);
    for (let i = 1; i < MAPS.length; i++) {
      expect(MAPS[i].repRequired).toBeGreaterThan(MAPS[i - 1].repRequired);
    }
    expect(isMapUnlocked(MAPS[0], 0)).toBe(true);
    expect(isMapUnlocked(MAPS[1], 0)).toBe(false);
    expect(isMapUnlocked(MAPS[1], MAPS[1].repRequired)).toBe(true);
  });

  it('cada circuito es jugable: pista cerrada y largada sobre asfalto', async () => {
    const { MAPS } = await import('../data/maps');
    const { SimWorld } = await import('../sim/World');
    for (const entry of MAPS) {
      const def = entry.build();
      const world = new SimWorld(def);
      expect(def.roads.length, entry.id).toBeGreaterThan(20);
      // La largada tiene que estar sobre pista y sin nada encima
      expect(world.gripAt(def.spawn.x, def.spawn.z), entry.id).toBeGreaterThan(0.9);
      expect(world.nearestWallDistance(def.spawn.x, def.spawn.z), entry.id).toBeGreaterThan(2.5);
      // Y dentro de los límites
      expect(Math.abs(def.spawn.x)).toBeLessThan(def.half);
      expect(Math.abs(def.spawn.z)).toBeLessThan(def.half);
    }
  });

  it('el circuito de la escuela es más ancho que el cañón', async () => {
    const { getMap } = await import('../data/maps');
    const avg = (id: string): number => {
      const def = getMap(id).build();
      return def.roads.reduce((a, r) => a + r.width, 0) / def.roads.length;
    };
    expect(avg('apex')).toBeGreaterThan(avg('kaida') * 1.4);
  });
});

describe('formato de números', () => {
  it('siempre 3 dígitos significativos', () => {
    expect(fmt(1)).toBe('1');
    expect(fmt(999)).toBe('999');
    expect(fmt(1234)).toBe('1.23K');
    expect(fmt(45_600)).toBe('45.6K');
    expect(fmt(1.5e6)).toBe('1.50M');
    expect(fmt(1e12)).toBe('1.00T');
  });

  it('CASH_RATE es la perilla única del balance', () => {
    expect(CASH_RATE).toBeGreaterThan(0);
    expect(runRewards(stats({ score: 1000, bestMultiplier: 1, cleanRun: false, crashes: 0, wallRides: 0, transitions: 0, bestChainedCorners: 0 }), {
      cashBonus: 1, repBonus: 1, torqueBonus: 1, gripBonus: 1,
      extraMultiplier: 0, tierSpeed: 1, crashShield: false, upgradeDiscount: 0,
    }).cash).toBe(Math.floor(1000 * CASH_RATE));
  });
});
