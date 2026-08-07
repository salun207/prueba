export type RoomEffect =
  | 'upgradeDiscount'
  | 'torqueBonus'
  | 'incomeBonus'
  | 'hypeBonus'
  | 'flatIncome'
  | 'schoolIncome'
  | 'offlineEfficiency';

export interface RoomDef {
  id: string;
  name: string;
  effect: RoomEffect;
  perLevel: number;
  baseCost: number;
  growth: number;
  maxLevel: number;
  desc: string;
}

export const ROOMS: RoomDef[] = [
  { id: 'workshop', name: 'Taller', effect: 'upgradeDiscount', perLevel: 0.025, baseCost: 6_000, growth: 1.45, maxLevel: 10, desc: '-2.5% costo de upgrades por nivel' },
  { id: 'dyno', name: 'Dyno', effect: 'torqueBonus', perLevel: 0.02, baseCost: 20_000, growth: 1.45, maxLevel: 10, desc: '+2% torque a todos los autos' },
  { id: 'office', name: 'Oficina', effect: 'incomeBonus', perLevel: 0.06, baseCost: 12_000, growth: 1.45, maxLevel: 15, desc: '+6% ingreso pasivo por nivel' },
  { id: 'trophies', name: 'Sala de trofeos', effect: 'hypeBonus', perLevel: 0.03, baseCost: 40_000, growth: 1.45, maxLevel: 10, desc: '+3% Hype por nivel' },
  { id: 'merch', name: 'Tienda de merch', effect: 'flatIncome', perLevel: 12, baseCost: 8_000, growth: 1.45, maxLevel: 20, desc: '+$12/s planos por nivel' },
  { id: 'school', name: 'Escuela de drift', effect: 'schoolIncome', perLevel: 30, baseCost: 60_000, growth: 1.45, maxLevel: 20, desc: '+$30/s por nivel (×Instructores)' },
  { id: 'lounge', name: 'Lounge', effect: 'offlineEfficiency', perLevel: 0.045, baseCost: 90_000, growth: 1.45, maxLevel: 10, desc: '+4.5% eficiencia offline por nivel' },
];

export const ROOMS_BY_ID = new Map(ROOMS.map((r) => [r.id, r]));

export function roomCost(def: RoomDef, level: number): number {
  return Math.floor(def.baseCost * Math.pow(def.growth, level));
}

/** Costo de la bahía nº n (1-indexado; la primera es gratis). */
export function bayCost(n: number): number {
  return Math.floor(50_000 * Math.pow(6, n - 2));
}

export const MAX_BAYS = 8;
