export type StaffEffect =
  | 'upgradeDiscount'
  | 'hypeBonus'
  | 'incomeBonus'
  | 'engineBonus'
  | 'repBonus'
  | 'staffAmplifier'
  | 'schoolIncome'
  | 'offlineCap';

export interface StaffDef {
  id: string;
  name: string;
  effect: StaffEffect;
  perLevel: number;
  unit: string;
  baseCost: number;
  growth: number;
  maxLevel: number;
  desc: string;
}

export const STAFF: StaffDef[] = [
  { id: 'mechanic', name: 'Mecánico', effect: 'upgradeDiscount', perLevel: 0.03, unit: '%', baseCost: 2_000, growth: 1.18, maxLevel: 20, desc: '-3% costo de upgrades por nivel' },
  { id: 'marketing', name: 'Marketing', effect: 'hypeBonus', perLevel: 0.04, unit: '%', baseCost: 8_000, growth: 1.21, maxLevel: 20, desc: '+4% Hype ganado por nivel' },
  { id: 'accountant', name: 'Contador', effect: 'incomeBonus', perLevel: 0.05, unit: '%', baseCost: 15_000, growth: 1.2, maxLevel: 25, desc: '+5% ingreso pasivo por nivel' },
  { id: 'engineer', name: 'Ingeniero', effect: 'engineBonus', perLevel: 0.02, unit: '%', baseCost: 50_000, growth: 1.25, maxLevel: 15, desc: '+2% torque y +1% grip por nivel' },
  { id: 'scout', name: 'Scout', effect: 'repBonus', perLevel: 0.06, unit: '%', baseCost: 120_000, growth: 1.22, maxLevel: 15, desc: '+6% Rep de contratos por nivel' },
  { id: 'manager', name: 'Manager', effect: 'staffAmplifier', perLevel: 0.02, unit: '%', baseCost: 1_000_000, growth: 1.35, maxLevel: 10, desc: '+2% a todos los efectos de staff' },
  { id: 'instructor', name: 'Instructor', effect: 'schoolIncome', perLevel: 1, unit: '×', baseCost: 400_000, growth: 1.28, maxLevel: 20, desc: 'Potencia la escuela de drift' },
  { id: 'community', name: 'Community Manager', effect: 'offlineCap', perLevel: 1800, unit: 's', baseCost: 250_000, growth: 1.3, maxLevel: 12, desc: '+30 min de tope offline por nivel' },
];

export const STAFF_BY_ID = new Map(STAFF.map((s) => [s.id, s]));

export function staffCost(def: StaffDef, level: number): number {
  return Math.floor(def.baseCost * Math.pow(def.growth, level));
}
