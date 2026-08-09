import { getCar, type CarDefinition } from '../data/cars';
import { SETUP_PARAMS, UPGRADES, type CarMods } from '../data/upgrades';
import type { CarSave } from '../save/types';
import type { CarSpec } from '../sim/types';
import type { Bonuses } from './Economy';

export interface BuiltCar {
  def: CarDefinition;
  spec: CarSpec;
  mods: CarMods;
}

function cloneSpec(s: CarSpec): CarSpec {
  return { ...s, gearRatios: [...s.gearRatios], torqueCurve: s.torqueCurve.map((p) => [p[0], p[1]]) };
}

/**
 * Construye el `CarSpec` efectivo: base del auto + setup + upgrades + nivel +
 * bonus globales. El tuning afecta la física de verdad, no es un `+5% stat`.
 */
export function buildCar(save: CarSave, bonuses: Bonuses): BuiltCar {
  const def = getCar(save.id);
  const spec = cloneSpec(def.spec);
  const mods: CarMods = {
    torqueScale: 1,
    gripScale: 1,
    cashBonus: 0,
    crashReduction: 0,
  };

  // 1. Setup (gratis, ajustable siempre)
  for (const p of SETUP_PARAMS) {
    const v = save.setup[p.id];
    if (typeof v === 'number') p.apply(spec, v);
  }

  // 2. Upgrades comprados
  for (const u of UPGRADES) {
    const level = save.upgrades[u.id] ?? 0;
    if (level > 0) u.apply(spec, level, mods);
  }

  // 3. Nivel del auto: +0.5% a todo
  const levelBonus = 1 + (save.level - 1) * 0.005;
  mods.torqueScale *= levelBonus;
  mods.gripScale *= 1 + (save.level - 1) * 0.002;

  // 4. Kit de carrocería: el widebody ensancha la vía de verdad
  if (save.cosmetics.bodyKit === 2) {
    spec.trackWidth += 0.12;
    spec.bodyWidth += 0.12;
    spec.inertiaYaw *= 1.03;
  }

  // 5. Bonus globales
  mods.torqueScale *= bonuses.torqueBonus;
  mods.gripScale *= bonuses.gripBonus;

  return { def, spec, mods };
}

/** Valor de reventa aproximado: el auto más la mitad de lo invertido. */
export function carValue(save: CarSave): number {
  const def = getCar(save.id);
  let total = def.price;
  for (const u of UPGRADES) {
    const level = save.upgrades[u.id] ?? 0;
    for (let i = 0; i < level; i++) total += u.baseCost * Math.pow(u.growth, i) * 0.5;
  }
  return total;
}
