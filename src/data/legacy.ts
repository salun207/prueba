export type LegacyEffect =
  | 'income'
  | 'hype'
  | 'extraBay'
  | 'startSponsors'
  | 'upgradeDiscount'
  | 'startTier'
  | 'tierSpeed'
  | 'crashShield'
  | 'empire';

export interface LegacyNode {
  id: string;
  name: string;
  effect: LegacyEffect;
  cost: number;
  perLevel: number;
  maxLevel: number;
  desc: string;
}

export const LEGACY_NODES: LegacyNode[] = [
  { id: 'income', name: 'Ingreso inicial', effect: 'income', cost: 5, perLevel: 0.25, maxLevel: 10, desc: '+25% ingreso pasivo por nivel' },
  { id: 'hype', name: 'Hype magnético', effect: 'hype', cost: 8, perLevel: 0.15, maxLevel: 10, desc: '+15% Hype de runs por nivel' },
  { id: 'bay', name: 'Garage heredado', effect: 'extraBay', cost: 20, perLevel: 1, maxLevel: 4, desc: 'Empezás con 1 bahía extra' },
  { id: 'contacts', name: 'Contactos', effect: 'startSponsors', cost: 15, perLevel: 1, maxLevel: 1, desc: 'Los sponsors 1–3 arrancan firmados' },
  { id: 'discount', name: 'Mano dura', effect: 'upgradeDiscount', cost: 12, perLevel: 0.2, maxLevel: 8, desc: '-20% costo de upgrades por nivel' },
  { id: 'veteran', name: 'Piloto veterano', effect: 'startTier', cost: 30, perLevel: 0.5, maxLevel: 3, desc: '+0.5 al multiplicador base' },
  { id: 'adrenaline', name: 'Adrenalina', effect: 'tierSpeed', cost: 25, perLevel: 0.25, maxLevel: 5, desc: 'El combo sube 25% más rápido por nivel' },
  { id: 'shield', name: 'Segunda vida', effect: 'crashShield', cost: 40, perLevel: 1, maxLevel: 1, desc: 'El primer choque de cada run no rompe el combo' },
  { id: 'empire', name: 'Imperio', effect: 'empire', cost: 100, perLevel: 1, maxLevel: 5, desc: '×2 al ingreso pasivo por nivel' },
];

export const LEGACY_BY_ID = new Map(LEGACY_NODES.map((n) => [n.id, n]));

export function legacyCost(node: LegacyNode, level: number): number {
  return Math.floor(node.cost * Math.pow(1.6, level));
}

export const PRESTIGE_MIN_HYPE = 10_000_000;

export function legacyPointsFor(hypeTotal: number): number {
  if (hypeTotal < PRESTIGE_MIN_HYPE) return 0;
  return Math.floor(Math.pow(hypeTotal / 1e6, 0.5) * 12);
}
