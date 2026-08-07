export interface SponsorDef {
  id: string;
  name: string;
  hypeRequired: number;
  baseCost: number;
  baseMultiplier: number;
  perk: string;
  maxLevel: number;
}

/** Nombres inventados. Ninguna marca real. */
export const SPONSORS: SponsorDef[] = [
  { id: 'koen', name: 'Kōen Tyres', hypeRequired: 0, baseCost: 500, baseMultiplier: 1.15, perk: '+5% duración de gomas', maxLevel: 25 },
  { id: 'vertex', name: 'Vertex Fluids', hypeRequired: 250, baseCost: 4_000, baseMultiplier: 1.2, perk: '+3% torque', maxLevel: 25 },
  { id: 'nightowl', name: 'NightOwl Energy', hypeRequired: 1_500, baseCost: 25_000, baseMultiplier: 1.28, perk: '+10% Hype', maxLevel: 25 },
  { id: 'chassis9', name: 'Chassis Nine', hypeRequired: 8_000, baseCost: 180_000, baseMultiplier: 1.35, perk: '-8% daño de choques', maxLevel: 25 },
  { id: 'halo', name: 'Halo Optics', hypeRequired: 40_000, baseCost: 1_200_000, baseMultiplier: 1.45, perk: 'Desbloquea neón bajo el auto', maxLevel: 25 },
  { id: 'torque', name: 'Torque Republic', hypeRequired: 200_000, baseCost: 9_000_000, baseMultiplier: 1.55, perk: '+1 tier de multiplicador', maxLevel: 25 },
  { id: 'static', name: 'Static Wear', hypeRequired: 1_000_000, baseCost: 70_000_000, baseMultiplier: 1.7, perk: 'Merch: +15% cash de runs', maxLevel: 25 },
  { id: 'meridian', name: 'Meridian Motors', hypeRequired: 6_000_000, baseCost: 600_000_000, baseMultiplier: 1.9, perk: 'Auto exclusivo Meridian Zenith', maxLevel: 25 },
  { id: 'aurora', name: 'Aurora Broadcast', hypeRequired: 40_000_000, baseCost: 5_000_000_000, baseMultiplier: 2.2, perk: 'Transmisión: +25% Hype', maxLevel: 25 },
  { id: 'syndicate', name: 'The Syndicate', hypeRequired: 300_000_000, baseCost: 50_000_000_000, baseMultiplier: 2.6, perk: 'Prestige avanzado', maxLevel: 25 },
];

export const SPONSORS_BY_ID = new Map(SPONSORS.map((s) => [s.id, s]));

export function sponsorCost(def: SponsorDef, level: number): number {
  return Math.floor(def.baseCost * Math.pow(1.16, level));
}

export function sponsorMultiplier(def: SponsorDef, level: number): number {
  if (level <= 0) return 1;
  return def.baseMultiplier + 0.04 * (level - 1);
}
