import type { MapDefinition } from '../../sim/World';
import { buildApexSchool, buildKaidaCanyon } from './circuit';
import { buildHarborMap } from './harbor';

export interface MapEntry {
  id: string;
  name: string;
  blurb: string;
  /** Reputación (★) necesaria para abrirlo. 0 = disponible desde el arranque. */
  repRequired: number;
  /** Dificultad para la ficha de selección, 1–3. */
  difficulty: number;
  traffic: boolean;
  build: () => MapDefinition;
}

export const MAPS: MapEntry[] = [
  {
    id: 'apex',
    name: 'Escuela Apex',
    blurb:
      'Circuito de drift: pista ancha, curvas largas y muros de goma cerca para raspar. ' +
      'Nada que te choque de frente — es donde se aprende a encadenar.',
    repRequired: 0,
    difficulty: 1,
    traffic: false,
    build: buildApexSchool,
  },
  {
    id: 'harbor',
    name: 'Harbor District',
    blurb:
      'Ciudad portuaria abierta: grilla, avenida diagonal, rotonda y un laberinto de ' +
      'contenedores. Hay tráfico y paredes de verdad.',
    repRequired: 150,
    difficulty: 2,
    traffic: true,
    build: buildHarborMap,
  },
  {
    id: 'kaida',
    name: 'Cañón Kaida',
    blurb:
      'Angosto y sin respiro: horquillas encadenadas entre paredes de roca. ' +
      'Un error y perdés el combo entero.',
    repRequired: 600,
    difficulty: 3,
    traffic: false,
    build: buildKaidaCanyon,
  },
];

export const MAPS_BY_ID = new Map(MAPS.map((m) => [m.id, m]));

export function getMap(id: string): MapEntry {
  return MAPS_BY_ID.get(id) ?? MAPS[0];
}

export function isMapUnlocked(entry: MapEntry, rep: number): boolean {
  return rep >= entry.repRequired;
}
