import type { SaveGame } from '../save/types';
import type { RunStats } from '../sim/ScoreSystem';

/**
 * Economía: la plata sale de driftear y de nada más.
 *
 * No hay ingreso pasivo, ni sponsors, ni staff, ni ganancias offline, ni
 * prestige. Si el juego está cerrado, no pasa nada. Lo único que mueve la aguja
 * es un run bueno, y por eso el pago escala DIRECTO con lo bien que manejaste:
 * el score entra lineal (no con exponente < 1 como cuando había idle que
 * compensaba) y encima se multiplica por el estilo del run.
 */

/** Pesos por punto de score. La perilla principal del balance. */
export const CASH_RATE = 0.045;
export const REP_RATE = 1 / 6000;

export interface Bonuses {
  cashBonus: number;
  repBonus: number;
  torqueBonus: number;
  gripBonus: number;
  extraMultiplier: number;
  tierSpeed: number;
  crashShield: boolean;
  upgradeDiscount: number;
}

/**
 * Lo único que modifica los pagos es el nivel de asistencias: manejar con menos
 * ayuda paga más. Es el incentivo honesto para que el jugador vaya subiendo la
 * dificultad en vez de que le regalen plata por esperar.
 */
export const ASSIST_PAYOUT: Record<string, { cash: number; rep: number; label: string }> = {
  casual: { cash: 0.8, rep: 0.7, label: '−20% de pago' },
  standard: { cash: 1.0, rep: 1.0, label: 'pago normal' },
  pro: { cash: 1.35, rep: 1.5, label: '+35% de pago' },
};

export function computeBonuses(save: SaveGame): Bonuses {
  const payout = ASSIST_PAYOUT[save.settings.assistLevel] ?? ASSIST_PAYOUT.standard;
  return {
    cashBonus: payout.cash,
    repBonus: payout.rep,
    torqueBonus: 1,
    gripBonus: 1,
    extraMultiplier: 0,
    tierSpeed: 1,
    crashShield: false,
    upgradeDiscount: 0,
  };
}

// ─────────────────────────── recompensas de run ───────────────────────────

export interface RunRewards {
  score: number;
  cash: number;
  rep: number;
  xp: number;
  style: number;
  styleParts: { label: string; value: number }[];
}

/**
 * Multiplicador de estilo: premia manejar bien, no manejar mucho. Un run largo
 * y prolijo con combos altos paga muchísimo más que uno largo y sucio.
 */
export function styleMultiplier(stats: RunStats): {
  total: number;
  parts: { label: string; value: number }[];
} {
  const parts: { label: string; value: number }[] = [];

  const combo = (stats.bestMultiplier - 1) * 0.1;
  if (combo > 0.005) parts.push({ label: `Combo ×${stats.bestMultiplier.toFixed(1)}`, value: combo });

  const chain = Math.min(stats.bestChainedCorners, 12) * 0.03;
  if (chain > 0.005) parts.push({ label: `${stats.bestChainedCorners} curvas encadenadas`, value: chain });

  const trans = Math.min(stats.transitions, 15) * 0.02;
  if (trans > 0.005) parts.push({ label: `${stats.transitions} transiciones`, value: trans });

  const wall = Math.min(stats.wallRides, 10) * 0.03;
  if (wall > 0.005) parts.push({ label: `${stats.wallRides} wall rides`, value: wall });

  if (stats.cleanRun && stats.score > 0) parts.push({ label: 'Sin chocar', value: 0.35 });
  else if (stats.crashes > 0) {
    const penalty = -Math.min(0.3, stats.crashes * 0.05);
    parts.push({ label: `${stats.crashes} choques`, value: penalty });
  }

  const total = Math.max(0.4, 1 + parts.reduce((a, p) => a + p.value, 0));
  return { total, parts };
}

export function runRewards(stats: RunStats, b: Bonuses): RunRewards {
  const style = styleMultiplier(stats);
  const cash = Math.floor(stats.score * CASH_RATE * style.total * b.cashBonus);
  const rep = Math.floor(stats.score * REP_RATE * style.total * b.repBonus);
  return {
    score: stats.score,
    cash,
    rep,
    xp: Math.floor(stats.score / 200),
    style: style.total,
    styleParts: style.parts,
  };
}

// ─────────────────────────── niveles ───────────────────────────

export function xpForLevel(level: number): number {
  return Math.floor(600 * Math.pow(level, 1.55));
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
  return Math.floor(350 * Math.pow(level, 1.45));
}
