import { Rng } from '../core/Rng';
import type { ChallengeSave, SaveGame } from '../save/types';
import type { RunStats } from '../sim/ScoreSystem';
import { CASH_RATE } from './Economy';

/**
 * Desafíos: el único "meta" que quedó. No son timers ni cuotas diarias que te
 * castigan si no entrás — son objetivos de manejo que pagan plata extra. Si no
 * los hacés no perdés nada.
 */

type ChallengeType =
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
  type: ChallengeType;
  text: (t: number) => string;
  target: (ref: number, difficulty: number) => number;
  measure: (s: RunStats) => number;
  pay: number;
  rep: number;
}

const ZONES = ['Puerto', 'Rotonda', 'Costanera', 'Obra', 'Túnel', 'Diagonal'];

const TEMPLATES: Template[] = [
  {
    type: 'score',
    text: (t) => `Hacé ${fmtShort(t)} puntos en un solo run`,
    target: (ref, d) => Math.max(2000, Math.round((ref * d) / 500) * 500),
    measure: (s) => s.score,
    pay: 1,
    rep: 1,
  },
  {
    type: 'combo',
    text: (t) => `Alcanzá un multiplicador ×${t}`,
    target: (_r, d) => Math.min(12, Math.max(2, Math.round(1.5 + d * 2))),
    measure: (s) => s.bestMultiplier,
    pay: 0.9,
    rep: 0.8,
  },
  {
    type: 'duration',
    text: (t) => `Mantené un drift ${t} segundos seguidos`,
    target: (_r, d) => Math.max(4, Math.round(4 + d * 8)),
    measure: (s) => s.longestDrift,
    pay: 0.8,
    rep: 0.8,
  },
  {
    type: 'zone',
    text: (t) => `Hacé ${fmtShort(t)} puntos`,
    target: (ref, d) => Math.max(1000, Math.round((ref * d * 0.35) / 500) * 500),
    measure: () => 0, // se resuelve por zoneScore
    pay: 1.2,
    rep: 1.2,
  },
  {
    type: 'proximity',
    text: (t) => `Conseguí ${t} bonus de WALL RIDE`,
    target: (_r, d) => Math.max(3, Math.round(3 + d * 10)),
    measure: (s) => s.wallRides,
    pay: 1.1,
    rep: 1,
  },
  {
    type: 'destruction',
    text: (t) => `Destruí ${t} objetos en un run`,
    target: (_r, d) => Math.max(8, Math.round(8 + d * 30)),
    measure: (s) => s.cones,
    pay: 0.8,
    rep: 0.5,
  },
  {
    type: 'speed',
    text: (t) => `Superá los ${t} km/h`,
    target: (_r, d) => Math.round(Math.min(220, 110 + d * 60)),
    measure: (s) => s.topSpeed,
    pay: 0.7,
    rep: 1.2,
  },
  {
    type: 'chain',
    text: (t) => `Encadená ${t} curvas sin romper el combo`,
    target: (_r, d) => Math.max(3, Math.round(3 + d * 6)),
    measure: (s) => s.bestChainedCorners,
    pay: 1.1,
    rep: 1.3,
  },
  {
    type: 'clean',
    text: (t) => `Hacé ${fmtShort(t)} puntos sin chocar`,
    target: (ref, d) => Math.max(1500, Math.round((ref * d * 0.6) / 500) * 500),
    measure: (s) => (s.cleanRun ? s.score : 0),
    pay: 1.4,
    rep: 1.6,
  },
];

function fmtShort(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(Math.round(n));
}

let counter = 0;

export function generateChallenge(save: SaveGame, daily: boolean, seed: number): ChallengeSave {
  const rng = new Rng(seed);
  const tpl = rng.pick(TEMPLATES);
  const ref = Math.max(3000, save.records.bestScore * 0.7);
  const difficulty = (daily ? 1.4 : 1) * rng.range(0.7, 1.25) * (1 + save.playerLevel * 0.02);
  const target = tpl.target(ref, difficulty);

  const zone = tpl.type === 'zone' ? rng.pick(ZONES) : undefined;
  const text = zone ? `${tpl.text(target)} en ${zone}` : tpl.text(target);

  // El pago se ancla al rendimiento real del jugador: siempre vale la pena,
  // nunca es plata regalada.
  const base = Math.max(2000, save.records.bestScore * CASH_RATE * 0.55);
  const scale = daily ? 3 : 1;
  counter++;
  return {
    id: `k${seed.toString(36)}${counter.toString(36)}`,
    type: zone ? `zone:${zone}` : tpl.type,
    text,
    target,
    progress: 0,
    reward: {
      cash: Math.floor(base * tpl.pay * scale),
      rep: Math.floor((3 + save.playerLevel * 0.6) * tpl.rep * scale),
    },
    done: false,
    daily,
    expiresAt: daily ? Date.now() + 24 * 3600 * 1000 : 0,
  };
}

export function ensureChallenges(save: SaveGame): void {
  save.challenges = save.challenges.filter((c) => !c.done);
  const active = save.challenges.filter((c) => !c.daily);
  let seedBase = Date.now();
  while (active.length < 3) {
    const c = generateChallenge(save, false, (seedBase++ ^ (save.runsPlayed * 7919)) >>> 0);
    save.challenges.push(c);
    active.push(c);
  }
  const daily = save.challenges.find((c) => c.daily && c.expiresAt > Date.now());
  if (!daily) {
    save.challenges = save.challenges.filter((c) => !c.daily);
    const dayIndex = Math.floor(Date.now() / (24 * 3600 * 1000));
    save.challenges.push(generateChallenge(save, true, dayIndex >>> 0));
  }
}

function measureFor(challenge: ChallengeSave, stats: RunStats): number {
  if (challenge.type.startsWith('zone:')) {
    return Math.floor(stats.zoneScore[challenge.type.slice(5)] ?? 0);
  }
  const tpl = TEMPLATES.find((t) => t.type === challenge.type);
  return tpl ? tpl.measure(stats) : 0;
}

export interface ChallengeResult {
  challenge: ChallengeSave;
  completed: boolean;
  value: number;
}

export function evaluateChallenges(save: SaveGame, stats: RunStats, repBonus: number): ChallengeResult[] {
  const results: ChallengeResult[] = [];
  for (const c of save.challenges) {
    if (c.done) continue;
    if (c.daily && c.expiresAt < Date.now()) continue;
    const value = measureFor(c, stats);
    c.progress = Math.max(c.progress, value);
    const completed = value >= c.target;
    if (completed) {
      c.done = true;
      save.cash += c.reward.cash;
      save.rep += Math.floor(c.reward.rep * repBonus);
      if (c.daily) {
        const day = 24 * 3600 * 1000;
        save.dailyStreak = Date.now() - save.lastDailyClaim < day * 2
          ? Math.min(7, save.dailyStreak + 1)
          : 1;
        save.lastDailyClaim = Date.now();
      }
    }
    results.push({ challenge: c, completed, value });
  }
  return results;
}
