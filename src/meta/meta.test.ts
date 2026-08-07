import { describe, expect, it } from 'vitest';
import { ROOMS, roomCost, bayCost } from '../data/rooms';
import { SPONSORS, sponsorCost } from '../data/sponsors';
import { STAFF, staffCost } from '../data/staff';
import { UPGRADES, upgradeCost } from '../data/upgrades';
import { getCar } from '../data/cars';
import { makeCar, newSave } from '../save/SaveManager';
import type { SaveGame } from '../save/types';
import { buildCar } from './CarBuild';
import { computeBonuses, incomePerSecond, runRewards, xpForLevel, applyXp } from './Economy';
import { ensureContracts, evaluateContracts } from './Contracts';
import * as A from './Actions';
import { fmt } from '../ui/format';
import type { RunStats } from '../sim/ScoreSystem';

function stats(score: number): RunStats {
  return {
    score, bestMultiplier: 3, longestDrift: 8, driftDistance: 400, crashes: 0,
    cones: 12, transitions: 4, wallRides: 2, nearMisses: 1, topSpeed: 140,
    cleanRun: true, zoneScore: { Puerto: score * 0.4 }, chainedCorners: 3, bestChainedCorners: 5,
  };
}

/** Estado de progresión plausible para un nivel de Hype dado. */
function stateAt(hype: number): SaveGame {
  const save = newSave();
  save.hypeTotal = hype;
  const tier = Math.log10(Math.max(10, hype));
  save.playerLevel = Math.max(1, Math.floor(tier * 6));
  for (const sp of SPONSORS) {
    if (hype >= sp.hypeRequired) save.sponsors[sp.id] = Math.min(sp.maxLevel, Math.floor(tier * 2));
  }
  for (const st of STAFF) save.staff[st.id] = Math.min(st.maxLevel, Math.floor(tier));
  for (const r of ROOMS) save.rooms[r.id] = Math.min(r.maxLevel, Math.floor(tier));
  save.bays = Math.min(8, 1 + Math.floor(tier / 2));
  const car = save.cars[0];
  for (const u of UPGRADES) car.upgrades[u.id] = Math.min(u.maxLevel, Math.floor(tier * 2));
  save.cash = incomePerSecond(save) * 120;
  return save;
}

/** La compra más barata disponible ahora mismo, en cash. */
function cheapestPurchase(save: SaveGame): number {
  const b = computeBonuses(save);
  const options: number[] = [];
  const car = save.cars[0];
  for (const u of UPGRADES) {
    const level = car.upgrades[u.id] ?? 0;
    if (level < u.maxLevel) options.push(upgradeCost(u, level).cash * (1 - b.upgradeDiscount));
  }
  for (const sp of SPONSORS) {
    const level = save.sponsors[sp.id] ?? 0;
    if (save.hypeTotal >= sp.hypeRequired && level < sp.maxLevel) options.push(sponsorCost(sp, level));
  }
  for (const st of STAFF) {
    const level = save.staff[st.id] ?? 0;
    if (level < st.maxLevel) options.push(staffCost(st, level));
  }
  for (const r of ROOMS) {
    const level = save.rooms[r.id] ?? 0;
    if (level < r.maxLevel) options.push(roomCost(r, level));
  }
  if (save.bays < 8) options.push(bayCost(save.bays + 1));
  return Math.min(...options);
}

describe('economía', () => {
  it('siempre hay algo comprable cerca (invariante del Pilar 4)', () => {
    const failures: string[] = [];
    for (let i = 0; i < 100; i++) {
      const hype = Math.pow(10, 1 + (i / 100) * 7); // 10 → 1e8
      const save = stateAt(hype);
      const ips = incomePerSecond(save);
      const cheapest = cheapestPurchase(save);
      // La compra más barata nunca debe estar a más de 30 min de idle
      if (cheapest > ips * 1800) {
        failures.push(`hype=${fmt(hype)} ips=${fmt(ips)}/s más barato=${fmt(cheapest)}`);
      }
    }
    expect(failures, failures.slice(0, 5).join('\n')).toHaveLength(0);
  });

  it('el ingreso pasivo crece de forma monótona con el Hype', () => {
    let prev = 0;
    for (let h = 0; h < 1e9; h = h * 3 + 10) {
      const v = incomePerSecond(stateAt(h));
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it('el cash de un run tiene retornos decrecientes; el Hype no', () => {
    const b = computeBonuses(newSave());
    const small = runRewards(stats(10_000), b);
    const big = runRewards(stats(1_000_000), b);
    expect(big.hype / small.hype).toBeCloseTo(100, 0);
    expect(big.cash / small.cash).toBeGreaterThan(20);
    expect(big.cash / small.cash).toBeLessThan(60);
  });

  it('sube de nivel y nunca deja XP negativa', () => {
    const save = newSave();
    const levels = applyXp(save, xpForLevel(1) * 3);
    expect(levels).toBeGreaterThan(0);
    expect(save.playerXp).toBeGreaterThanOrEqual(0);
  });
});

describe('acciones', () => {
  it('no se puede comprar sin plata', () => {
    const save = newSave();
    save.cash = 0;
    expect(A.buyUpgrade(save, 0, 'engine')).toBe(false);
    expect(A.buySponsor(save, 'koen')).toBe(false);
    expect(A.hireStaff(save, 'mechanic')).toBe(false);
  });

  it('comprar descuenta exactamente el precio', () => {
    const save = newSave();
    save.cash = 10_000;
    const price = A.upgradePrice(save, 0, 'engine')!;
    expect(A.buyUpgrade(save, 0, 'engine')).toBe(true);
    expect(save.cash).toBe(10_000 - price.cash);
    expect(save.cars[0].upgrades.engine).toBe(1);
  });

  it('los sponsors bloqueados por Hype no se pueden firmar', () => {
    const save = newSave();
    save.cash = 1e12;
    save.hypeTotal = 0;
    expect(A.buySponsor(save, 'aurora')).toBe(false);
    expect(A.buySponsor(save, 'koen')).toBe(true);
  });

  it('el prestige conserva lo que corresponde', () => {
    const save = newSave();
    save.hypeTotal = 50_000_000;
    save.cash = 1e9;
    save.sponsors = { koen: 5 };
    save.staff = { mechanic: 3 };
    A.grantCar(save, 'kite_300zt');
    const keep = save.activeCarInstanceId;
    expect(A.prestige(save, keep)).toBe(true);
    expect(save.legacy).toBeGreaterThan(0);
    expect(save.cash).toBe(0);
    expect(save.hypeTotal).toBe(0);
    expect(save.sponsors).toEqual({});
    expect(save.cars).toHaveLength(1);
    expect(save.cars[0].instanceId).toBe(keep);
    expect(save.prestigeCount).toBe(1);
  });

  it('nunca te quedás sin autos', () => {
    const save = newSave();
    expect(A.sellCar(save, save.cars[0].instanceId)).toBe(false);
  });
});

describe('contratos', () => {
  it('siempre hay 3 activos más el diario', () => {
    const save = newSave();
    ensureContracts(save);
    expect(save.contracts.filter((c) => !c.daily && !c.done)).toHaveLength(3);
    expect(save.contracts.filter((c) => c.daily && !c.done)).toHaveLength(1);
  });

  it('los targets escalan con el rendimiento del jugador', () => {
    const rookie = newSave();
    rookie.records.bestScore = 5_000;
    const pro = newSave();
    pro.records.bestScore = 5_000_000;
    ensureContracts(rookie);
    ensureContracts(pro);
    const scoreTarget = (s: SaveGame): number =>
      s.contracts.find((c) => c.type === 'score')?.target ?? 0;
    if (scoreTarget(rookie) && scoreTarget(pro)) {
      expect(scoreTarget(pro)).toBeGreaterThan(scoreTarget(rookie));
    }
  });

  it('completar un contrato paga una sola vez', () => {
    const save = newSave();
    save.contracts = [{
      id: 'x', type: 'score', text: 'test', target: 1000, progress: 0,
      reward: { cash: 500, parts: 2, rep: 1 }, done: false, daily: false, expiresAt: 0,
    }];
    evaluateContracts(save, stats(5000), 1);
    expect(save.cash).toBe(500);
    evaluateContracts(save, stats(5000), 1);
    expect(save.cash).toBe(500);
  });
});

describe('build del auto', () => {
  it('los upgrades cambian la física de verdad', () => {
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

  it('cada auto del roster se siente distinto', () => {
    const save = newSave();
    const b = computeBonuses(save);
    const seen = new Set<string>();
    for (const id of ['kite_240', 'kestrel_gt', 'sable_formula', 'phantom_01']) {
      const c = makeCar(id);
      const built = buildCar(c, b);
      const sig = [
        Math.round(built.spec.mass / 50),
        Math.round(built.spec.tireFalloff * 20),
        Math.round(built.spec.maxSteerAngle * 20),
      ].join('/');
      expect(seen.has(sig), `${id} duplica el feel de otro auto`).toBe(false);
      seen.add(sig);
      expect(getCar(id).displayName.length).toBeGreaterThan(0);
    }
  });
});

describe('formato de números', () => {
  it('siempre 3 dígitos significativos', () => {
    expect(fmt(1)).toBe('1');
    expect(fmt(999)).toBe('999');
    expect(fmt(1234)).toBe('1.23K');
    expect(fmt(45_600)).toBe('45.6K');
    expect(fmt(456_000)).toBe('456K');
    expect(fmt(1.5e6)).toBe('1.50M');
    expect(fmt(1e12)).toBe('1.00T');
    expect(fmt(1e15)).toBe('1.00Qa');
    expect(fmt(1e45)).toMatch(/^1\.00[a-z]{2}$/);
  });
});
