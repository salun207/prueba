import { TRAFFIC_PRESETS, type HighwayConfig } from '../sim/Highway';

/**
 * Rutas del modo tráfico. Cada una es un preset de autopista con su ficha de
 * selección; se abren con reputación igual que los circuitos de drift.
 */
export interface RouteEntry {
  id: string;
  name: string;
  blurb: string;
  repRequired: number;
  /** 1–3, para la ficha. */
  difficulty: number;
  cfg: HighwayConfig;
}

export const ROUTES: RouteEntry[] = [
  {
    id: 'autopista',
    name: 'Autopista Costera',
    blurb:
      'Tres carriles por mano y curvas largas. Manejar de contramano paga el doble, ' +
      'y esquivar de cerca sube el combo.',
    repRequired: 0,
    difficulty: 1,
    cfg: TRAFFIC_PRESETS.autopista,
  },
  {
    id: 'ruta_libre',
    name: 'Ruta Libre',
    blurb:
      'Doble mano, sin separador y con poco tráfico: se va rapidísimo, pero cuando ' +
      'aparece alguien de frente aparece de golpe.',
    repRequired: 120,
    difficulty: 2,
    cfg: TRAFFIC_PRESETS.ruta_libre,
  },
  {
    id: 'hora_pico',
    name: 'Hora Pico',
    blurb:
      'Cuatro carriles por mano, todos llenos. El tráfico va lento: la plata está ' +
      'en pasar entre medio sin tocar a nadie.',
    repRequired: 450,
    difficulty: 3,
    cfg: TRAFFIC_PRESETS.hora_pico,
  },
];

export const ROUTES_BY_ID = new Map(ROUTES.map((r) => [r.id, r]));

export function getRoute(id: string): RouteEntry {
  return ROUTES_BY_ID.get(id) ?? ROUTES[0];
}

export function isRouteUnlocked(entry: RouteEntry, rep: number): boolean {
  return rep >= entry.repRequired;
}
