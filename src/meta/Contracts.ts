import { Rng } from '../core/Rng';
import type { ContractSave, SaveGame } from '../save/types';
import type { RunStats } from '../sim/ScoreSystem';

type ContractType =
  | 'score'
  | 'combo'
  | 'duration'
  | 'zone'
  | 'proximity'
  | 'destruction'
  | 'speed'
  | 'chain'
  | 'clean';

interface Template {
  type: ContractType;
  text: (t: number) => string;
  target: (ref: number, difficulty: number) => number;
  measure: (s: RunStats) => number;
  rewardScale: { cash: number; parts: number; rep: number };
  zone?: string;
}

const ZONES = ['Puerto', 'Rotonda', 'Costanera', 'Obra', 'Túnel', 'Diagonal'];

const TEMPLATES: Template[] = [
  {
    type: 'score',
    text: (t) => `Hacé ${fmt(t)} puntos en un solo run`,
    target: (ref, d) => Math.max(2000, Math.round((ref * d) / 500) * 500),
    measure: (s) => s.score,
    rewardScale: { cash: 1, parts: 0, rep: 1 },
  },
  {
    type: 'combo',
    text: (t) => `Alcanzá un multiplicador ×${t}`,
    target: (_ref, d) => Math.min(12, Math.max(2, Math.round(1.5 + d * 2))),
    measure: (s) => s.bestMultiplier,
    rewardScale: { cash: 0.8, parts: 1, rep: 0 },
  },
  {
    type: 'duration',
    text: (t) => `Mantené un drift ${t} segundos seguidos`,
    target: (_ref, d) => Math.max(4, Math.round(4 + d * 8)),
    measure: (s) => s.longestDrift,
    rewardScale: { cash: 0.6, parts: 1.4, rep: 0 },
  },
  {
    type: 'zone',
    text: (t) => `Hacé ${fmt(t)} puntos`,
    target: (ref, d) => Math.max(1000, Math.round((ref * d * 0.35) / 500) * 500),
    measure: () => 0, // se resuelve con zoneScore
    rewardScale: { cash: 1.2, parts: 0, rep: 1.2 },
  },
  {
    type: 'proximity',
    text: (t) => `Conseguí ${t} bonus de WALL RIDE`,
    target: (_ref, d) => Math.max(3, Math.round(3 + d * 10)),
    measure: (s) => s.wallRides,
    rewardScale: { cash: 0.7, parts: 1.3, rep: 0 },
  },
  {
    type: 'destruction',
    text: (t) => `Destruí ${t} objetos en un run`,
    target: (_ref, d) => Math.max(8, Math.round(8 + d * 30)),
    measure: (s) => s.cones,
    rewardScale: { cash: 1.1, parts: 0.5, rep: 0 },
  },
  {
    type: 'speed',
    text: (t) => `Superá los ${t} km/h`,
    target: (_ref, d) => Math.round(Math.min(220, 110 + d * 60)),
    measure: (s) => s.topSpeed,
    rewardScale: { cash: 0.6, parts: 0, rep: 1.4 },
  },
  {
    type: 'chain',
    text: (t) => `Encadená ${t} curvas sin romper el combo`,
    target: (_ref, d) => Math.max(3, Math.round(3 + d * 6)),
    measure: (s) => s.bestChainedCorners,
    rewardScale: { cash: 0.9, parts: 1.2, rep: 1 },
  },
  {
    type: 'clean',
    text: (t) => `Hacé ${fmt(t)} puntos sin chocar`,
    target: (ref, d) => Math.max(1500, Math.round((ref * d * 0.6) / 500) * 500),
    measure: (s) => (s.cleanRun ? s.score : 0),
    rewardScale: { cash: 1, parts: 0, rep: 2 },
  },
];

function fmt(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(Math.round(n));
}

let counter = 0;

/**
 * Los targets se calculan sobre el rendimiento reciente del jugador: siempre
 * desafiantes, nunca imposibles.
 */
export function generateContract(save: SaveGame, daily: boolean, seed: number): ContractSave {
  const rng = new Rng(seed);
  const tpl = rng.pick(TEMPLATES);
  const ref = Math.max(3000, save.records.bestScore * 0.7);
  const difficulty = (daily ? 1.4 : 1) * rng.range(0.7, 1.25) * (1 + save.playerLevel * 0.02);
  const target = tpl.target(ref, difficulty);

  const zone = tpl.type === 'zone' ? rng.pick(ZONES) : undefined;
  const text = tpl.type === 'zone' ? `${tpl.text(target)} en ${zone}` : tpl.text(target);

  const scale = (daily ? 3 : 1) * (1 + save.playerLevel * 0.35);
  counter++;
  return {
    id: `k${seed.toString(36)}${counter.toString(36)}`,
    type: zone ? `zone:${zone}` : tpl.type,
    text,
    target,
    progress: 0,
    reward: {
      cash: Math.floor(tpl.rewardScale.cash * 4000 * scale),
      parts: Math.floor(tpl.rewardScale.parts * 4 * Math.sqrt(scale)),
      rep: Math.floor(tpl.rewardScale.rep * 3 * Math.sqrt(scale)),
    },
    done: false,
    daily,
    expiresAt: daily ? Date.now() + 24 * 3600 * 1000 : 0,
  };
}

export function ensureContracts(save: SaveGame): void {
  const active = save.contracts.filter((c) => !c.done && !c.daily);
  let seedBase = Date.now();
  while (active.length < 3) {
    const c = generateContract(save, false, (seedBase++ ^ save.runsPlayed * 7919) >>> 0);
    save.contracts.push(c);
    active.push(c);
  }
  const daily = save.contracts.find((c) => c.daily && !c.done && c.expiresAt > Date.now());
  if (!daily) {
    save.contracts = save.contracts.filter((c) => !c.daily);
    const dayIndex = Math.floor(Date.now() / (24 * 3600 * 1000));
    save.contracts.push(generateContract(save, true, dayIndex >>> 0));
  }
  // Limpieza de completados viejos
  save.contracts = save.contracts.filter((c) => !c.done);
}

function measureFor(contract: ContractSave, stats: RunStats): number {
  if (contract.type.startsWith('zone:')) {
    const zone = contract.type.slice(5);
    return Math.floor(stats.zoneScore[zone] ?? 0);
  }
  const tpl = TEMPLATES.find((t) => t.type === contract.type);
  return tpl ? tpl.measure(stats) : 0;
}

export interface ContractResult {
  contract: ContractSave;
  completed: boolean;
  value: number;
}

/** Evalúa todos los contratos contra el run y paga los completados. */
export function evaluateContracts(save: SaveGame, stats: RunStats, repBonus: number): ContractResult[] {
  const results: ContractResult[] = [];
  for (const c of save.contracts) {
    if (c.done) continue;
    if (c.daily && c.expiresAt < Date.now()) continue;
    const value = measureFor(c, stats);
    c.progress = Math.max(c.progress, value);
    const completed = value >= c.target;
    if (completed) {
      c.done = true;
      save.cash += c.reward.cash;
      save.parts += c.reward.parts;
      save.rep += Math.floor(c.reward.rep * repBonus);
      if (c.daily) {
        const day = 24 * 3600 * 1000;
        const since = Date.now() - save.lastDailyClaim;
        save.dailyStreak = since < day * 2 ? Math.min(7, save.dailyStreak + 1) : 1;
        save.lastDailyClaim = Date.now();
      }
    }
    results.push({ contract: c, completed, value });
  }
  return results;
}
