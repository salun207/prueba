import { DEG } from '../lib/math';
import type { CarSpec } from '../sim/types';

export interface CarMods {
  torqueScale: number;
  gripScale: number;
  /** Fracción extra de plata por run (0.1 = +10%). */
  cashBonus: number;
  crashReduction: number;
}

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  maxLevel: number;
  baseCost: number;
  growth: number;
  apply: (spec: CarSpec, level: number, mods: CarMods) => void;
  readout: (level: number) => string;
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'engine',
    name: 'Motor',
    desc: '+4% de torque por nivel',
    maxLevel: 20,
    baseCost: 1500,
    growth: 1.28,
    apply: (_s, l, m) => {
      m.torqueScale *= 1 + 0.04 * l;
    },
    readout: (l) => `+${(l * 4).toFixed(0)}% torque`,
  },
  {
    id: 'turbo',
    name: 'Turbo',
    desc: '+3% de torque arriba de 4000 rpm',
    maxLevel: 12,
    baseCost: 6000,
    growth: 1.3,
    apply: (s, l) => {
      s.torqueCurve = s.torqueCurve.map(([r, t]) => [r, r >= 4000 ? t * (1 + 0.03 * l) : t]);
    },
    readout: (l) => `+${(l * 3).toFixed(0)}% arriba`,
  },
  {
    id: 'exhaust',
    name: 'Escape',
    desc: '+1.5% torque y +2% de plata por run',
    maxLevel: 10,
    baseCost: 3000,
    growth: 1.26,
    apply: (_s, l, m) => {
      m.torqueScale *= 1 + 0.015 * l;
      m.cashBonus += 0.02 * l;
    },
    readout: (l) => `+${(l * 2).toFixed(0)}% plata`,
  },
  {
    id: 'weight',
    name: 'Aligerado',
    desc: '-1.2% de masa por nivel',
    maxLevel: 15,
    baseCost: 4000,
    growth: 1.3,
    apply: (s, l) => {
      s.mass *= Math.max(0.65, 1 - 0.012 * l);
      s.inertiaYaw *= Math.max(0.7, 1 - 0.01 * l);
    },
    readout: (l) => `-${(l * 1.2).toFixed(1)}% masa`,
  },
  {
    id: 'suspension',
    name: 'Suspensión',
    desc: 'Menos transferencia de peso, +1% grip',
    maxLevel: 15,
    baseCost: 5000,
    growth: 1.28,
    apply: (s, l, m) => {
      s.cgHeight *= Math.max(0.7, 1 - 0.02 * l);
      m.gripScale *= 1 + 0.01 * l;
    },
    readout: (l) => `+${(l * 1).toFixed(0)}% grip`,
  },
  {
    id: 'tires',
    name: 'Neumáticos',
    desc: '+2% de μ. ¡Ojo: más grip = cuesta más derrapar!',
    maxLevel: 20,
    baseCost: 2500,
    growth: 1.27,
    apply: (_s, l, m) => {
      m.gripScale *= 1 + 0.02 * l;
    },
    readout: (l) => `+${(l * 2).toFixed(0)}% μ`,
  },
  {
    id: 'diff',
    name: 'Diferencial',
    desc: 'Drift más estable y predecible',
    maxLevel: 10,
    baseCost: 9000,
    growth: 1.3,
    apply: (s, l) => {
      s.diffLock = Math.min(1, s.diffLock + 0.05 * l);
    },
    readout: (l) => `+${(l * 5).toFixed(0)}% bloqueo`,
  },
  {
    id: 'steering',
    name: 'Dirección',
    desc: '+1.5° de ángulo máximo por nivel',
    maxLevel: 10,
    baseCost: 12000,
    growth: 1.32,
    apply: (s, l) => {
      s.maxSteerAngle += DEG(1.5) * l;
    },
    readout: (l) => `+${(l * 1.5).toFixed(1)}°`,
  },
  {
    id: 'brakes',
    name: 'Frenos',
    desc: '+4% de torque de freno',
    maxLevel: 10,
    baseCost: 3500,
    growth: 1.26,
    apply: (s, l) => {
      s.brakeTorqueFront *= 1 + 0.04 * l;
      s.brakeTorqueRear *= 1 + 0.04 * l;
    },
    readout: (l) => `+${(l * 4).toFixed(0)}%`,
  },
  {
    id: 'gearbox',
    name: 'Caja',
    desc: 'Cambios más rápidos',
    maxLevel: 8,
    baseCost: 15000,
    growth: 1.34,
    apply: (s, l) => {
      s.shiftTime *= Math.max(0.35, 1 - 0.06 * l);
    },
    readout: (l) => `-${(l * 6).toFixed(0)}% tiempo`,
  },
  {
    id: 'cage',
    name: 'Jaula',
    desc: '-10% de daño de choque, +15 kg',
    maxLevel: 5,
    baseCost: 25000,
    growth: 1.4,
    apply: (s, l, m) => {
      s.mass += 15 * l;
      m.crashReduction += 0.1 * l;
    },
    readout: (l) => `-${(l * 10).toFixed(0)}% daño`,
  },
  {
    id: 'aero',
    name: 'Aero',
    desc: '+8% downforce, +3% drag',
    maxLevel: 10,
    baseCost: 20000,
    growth: 1.3,
    apply: (s, l) => {
      s.downforceCoefficient *= 1 + 0.08 * l;
      s.dragCoefficient *= 1 + 0.03 * l;
    },
    readout: (l) => `+${(l * 8).toFixed(0)}% carga`,
  },
];

export const UPGRADES_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));

export function upgradeCost(u: UpgradeDef, level: number): number {
  return Math.floor(u.baseCost * Math.pow(u.growth, level));
}

// ─────────────────────────── setup (gratis) ───────────────────────────

export interface SetupParam {
  id: string;
  name: string;
  min: number;
  max: number;
  step: number;
  def: number;
  unit: string;
  hint: string;
  apply: (spec: CarSpec, value: number) => void;
}

export const SETUP_PARAMS: SetupParam[] = [
  {
    id: 'steerAngle', name: 'Ángulo de dirección', min: 30, max: 65, step: 1, def: 36, unit: '°',
    hint: 'Más ángulo = drifts más extremos, más difícil de controlar',
    apply: (s, v) => { s.maxSteerAngle = DEG(v); },
  },
  {
    id: 'brakeBias', name: 'Balance de frenos', min: 40, max: 80, step: 1, def: 62, unit: '% del.',
    hint: 'Más atrás = el auto rota al frenar',
    apply: (s, v) => { s.brakeBias = v / 100; },
  },
  {
    id: 'diffLock', name: 'Bloqueo del diferencial', min: 0, max: 100, step: 5, def: 50, unit: '%',
    hint: 'Más bloqueo = drift más sostenido y predecible',
    apply: (s, v) => { s.diffLock = v / 100; },
  },
  {
    id: 'pressureFront', name: 'Presión delantera', min: 1.6, max: 2.6, step: 0.1, def: 2.1, unit: 'bar',
    hint: 'Baja = más grip delantero (mejor contravolante)',
    apply: (s, v) => { s.peakGripFront *= 1 + (2.1 - v) * 0.08; },
  },
  {
    id: 'pressureRear', name: 'Presión trasera', min: 1.6, max: 2.6, step: 0.1, def: 2.1, unit: 'bar',
    hint: 'Alta = menos grip trasero = más fácil derrapar',
    apply: (s, v) => { s.peakGripRear *= 1 - (v - 2.1) * 0.08; },
  },
  {
    id: 'rearStiffness', name: 'Rigidez trasera', min: 0, max: 100, step: 5, def: 50, unit: '',
    hint: 'Más rígido atrás = el tren trasero se suelta antes',
    apply: (s, v) => { s.tireStiffnessRear *= 1 - ((v - 50) / 100) * 0.25; },
  },
  {
    id: 'finalDrive', name: 'Relación final', min: 2.8, max: 4.8, step: 0.1, def: 3.9, unit: '',
    hint: 'Corta = acelera; larga = más velocidad punta',
    apply: (s, v) => { s.finalDrive = v; },
  },
];

export const SETUP_DEFAULTS: Record<string, number> = Object.fromEntries(
  SETUP_PARAMS.map((p) => [p.id, p.def]),
);

export const SETUP_RECOMMENDED: Record<string, number> = {
  steerAngle: 48,
  brakeBias: 58,
  diffLock: 75,
  pressureFront: 1.8,
  pressureRear: 2.4,
  rearStiffness: 65,
  finalDrive: 4.1,
};
