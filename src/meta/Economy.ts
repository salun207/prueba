import { getCar } from '../data/cars';
import { LEGACY_BY_ID } from '../data/legacy';
import { ROOMS_BY_ID } from '../data/rooms';
import { SPONSORS_BY_ID, sponsorMultiplier } from '../data/sponsors';
import { STAFF_BY_ID } from '../data/staff';
import type { SaveGame } from '../save/types';
import type { RunStats } from '../sim/ScoreSystem';

export interface Bonuses {
  upgradeDiscount: number; // 0..0.8
  hypeBonus: number; // multiplicador total
  cashBonus: number;
  repBonus: number;
  incomeMultiplier: number;
  flatIncome: number;
  torqueBonus: number;
  gripBonus: number;
  offlineCapSeconds: number;
  offlineEfficiency: number;
  crashShield: boolean;
  extraMultiplier: number;
  tierSpeed: number;
}

const lvl = (map: Record<string, number>, id: string): number => map[id] ?? 0;

export function computeBonuses(save: SaveGame): Bonuses {
  const staffAmp = 1 + lvl(save.staff, 'manager') * (STAFF_BY_ID.get('manager')!.perLevel);

  const staffEffect = (id: string): number => {
    const def = STAFF_BY_ID.get(id)!;
    return lvl(save.staff, id) * def.perLevel * staffAmp;
  };
  const roomEffect = (id: string): number => {
    const def = ROOMS_BY_ID.get(id)!;
    return lvl(save.rooms, id) * def.perLevel;
  };
  const legacyEffect = (id: string): number => {
    const def = LEGACY_BY_ID.get(id)!;
    return lvl(save.legacyNodes, id) * def.perLevel;
  };

  // ── Sponsors ──
  let sponsorMult = 1;
  let sponsorHype = 0;
  let sponsorCash = 0;
  let sponsorCrash = 0;
  let sponsorTorque = 0;
  let sponsorTier = 0;
  for (const [id, level] of Object.entries(save.sponsors)) {
    if (level <= 0) continue;
    const def = SPONSORS_BY_ID.get(id);
    if (!def) continue;
    sponsorMult *= sponsorMultiplier(def, level);
    if (id === 'nightowl') sponsorHype += 0.1;
    if (id === 'aurora') sponsorHype += 0.25;
    if (id === 'static') sponsorCash += 0.15;
    if (id === 'chassis9') sponsorCrash += 0.08;
    if (id === 'vertex') sponsorTorque += 0.03;
    if (id === 'torque') sponsorTier += 1;
  }

  const empireLevels = lvl(save.legacyNodes, 'empire');
  const prestigeMult =
    (1 + save.prestigeCount * 0.1) * (1 + legacyEffect('income')) * Math.pow(2, empireLevels);

  const instructorBoost = 1 + lvl(save.staff, 'instructor') * 0.15;
  const flatIncome =
    roomEffect('merch') + roomEffect('school') * instructorBoost + bayIncome(save);

  return {
    upgradeDiscount: Math.min(
      0.8,
      staffEffect('mechanic') + roomEffect('workshop') + legacyEffect('discount'),
    ),
    hypeBonus: 1 + staffEffect('marketing') + roomEffect('trophies') + sponsorHype + legacyEffect('hype'),
    cashBonus: 1 + sponsorCash,
    repBonus: 1 + staffEffect('scout'),
    incomeMultiplier: sponsorMult * (1 + staffEffect('accountant') + roomEffect('office')) * prestigeMult,
    flatIncome,
    torqueBonus: 1 + staffEffect('engineer') + roomEffect('dyno') + sponsorTorque,
    gripBonus: 1 + staffEffect('engineer') * 0.5,
    offlineCapSeconds: 2 * 3600 + lvl(save.staff, 'community') * 1800,
    offlineEfficiency: Math.min(0.85, 0.4 + roomEffect('lounge')),
    crashShield: lvl(save.legacyNodes, 'shield') > 0,
    extraMultiplier: legacyEffect('veteran') + sponsorTier * 0.5,
    tierSpeed: 1 + legacyEffect('adrenaline'),
  };
}

/** Los autos guardados en bahías se alquilan para eventos. */
export function bayIncome(save: SaveGame): number {
  let total = 0;
  for (const car of save.cars) {
    if (car.inBay === null || car.inBay >= save.bays) continue;
    const def = getCar(car.id);
    const value = Math.max(10_000, def.price);
    total += Math.pow(value, 0.55) * (1 + car.level * 0.12) * 0.4;
  }
  return total;
}

export function baseIncomePerSecond(hypeTotal: number): number {
  return 0.9 * Math.pow(Math.max(0, hypeTotal), 0.62);
}

export function incomePerSecond(save: SaveGame, b: Bonuses = computeBonuses(save)): number {
  return baseIncomePerSecond(save.hypeTotal) * b.incomeMultiplier + b.flatIncome;
}

// ─────────────────────────── recompensas de run ───────────────────────────

export interface RunRewards {
  score: number;
  hype: number;
  cash: number;
  xp: number;
  rep: number;
}

export function runRewards(stats: RunStats, b: Bonuses): RunRewards {
  const score = stats.score;
  const hype = Math.floor((score / 100) * b.hypeBonus);
  // Exponente < 1: los runs enormes rinden mucho pero con retornos decrecientes,
  // así el ingreso pasivo sigue siendo relevante para los jugadores buenos.
  const cash = Math.floor(Math.pow(score, 0.78) * 0.55 * b.cashBonus);
  const xp = Math.floor(score / 250);
  const rep = Math.floor((score / 5000) * b.repBonus);
  return { score, hype, cash, xp, rep };
}

export function xpForLevel(level: number): number {
  return Math.floor(500 * Math.pow(level, 1.65));
}

export function applyXp(save: SaveGame, xp: number): number {
  save.playerXp += xp;
  let levels = 0;
  while (save.playerXp >= xpForLevel(save.playerLevel)) {
    save.playerXp -= xpForLevel(save.playerLevel);
    save.playerLevel++;
    levels++;
  }
  return levels;
}

export function carXpForLevel(level: number): number {
  return Math.floor(300 * Math.pow(level, 1.5));
}

// ─────────────────────────── offline ───────────────────────────

export interface OfflineResult {
  seconds: number;
  cash: number;
  capped: boolean;
}

export function computeOffline(save: SaveGame, now = Date.now()): OfflineResult {
  const b = computeBonuses(save);
  const elapsedRaw = Math.max(0, (now - save.lastSeenAt) / 1000);
  const elapsed = Math.min(elapsedRaw, b.offlineCapSeconds);
  const cash = Math.floor(incomePerSecond(save, b) * elapsed * b.offlineEfficiency);
  return { seconds: elapsedRaw, cash, capped: elapsedRaw > b.offlineCapSeconds };
}
