export const SAVE_VERSION = 4;

/** Los dos modos de juego. El drift es el original; tráfico es el nuevo. */
export type GameMode = 'traffic' | 'drift';

export interface TrafficRecord {
  bestScore: number;
  bestDistance: number;
  bestCash: number;
  runs: number;
}

export interface CarCosmetics {
  paintColor: string;
  paintType: 'gloss' | 'matte' | 'metallic' | 'pearl' | 'chrome';
  wheelColor: string;
  caliperColor: string;
  bodyKit: number; // 0 stock, 1 street, 2 widebody
  smokeColor: string | null;
}

export interface CarSave {
  id: string;
  instanceId: string;
  level: number;
  xp: number;
  upgrades: Record<string, number>;
  setup: Record<string, number>;
  cosmetics: CarCosmetics;
}

export interface ChallengeSave {
  id: string;
  type: string;
  text: string;
  target: number;
  progress: number;
  reward: { cash: number; rep: number };
  done: boolean;
  daily: boolean;
  expiresAt: number;
}

/**
 * Estado guardado. Sin monedas premium, sin ingreso pasivo, sin timers:
 * plata y reputación se ganan manejando y nada más.
 */
export interface SaveGame {
  version: number;
  createdAt: number;
  lastSeenAt: number;
  playtimeSeconds: number;

  cash: number;
  rep: number;

  playerLevel: number;
  playerXp: number;

  cars: CarSave[];
  activeCarInstanceId: string;

  challenges: ChallengeSave[];
  dailyStreak: number;
  lastDailyClaim: number;

  /** Modo activo y ruta elegida en tráfico. */
  gameMode: GameMode;
  selectedRoute: string;
  trafficRecords: Record<string, TrafficRecord>;

  /** Mapa elegido y récords por mapa. Se desbloquean con reputación. */
  selectedMap: string;
  mapRecords: Record<string, { bestScore: number; bestCash: number; runs: number }>;

  records: {
    bestScore: number;
    bestCombo: number;
    longestDrift: number;
    bestCashRun: number;
    totalRuns: number;
    totalCrashes: number;
    totalDriftDistance: number;
    totalCashEarned: number;
    bestTrafficScore: number;
    bestTrafficDistance: number;
    totalNearMisses: number;
    totalOvertakes: number;
  };

  settings: Settings;
  tutorialDone: boolean;
  runsPlayed: number;
}

export interface Settings {
  assistLevel: 'casual' | 'standard' | 'pro';
  quality: 'low' | 'medium' | 'high' | 'ultra';
  traffic: 'off' | 'low' | 'medium' | 'high';
  camera: number;
  screenShake: boolean;
  showAngleArc: boolean;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
}

export function defaultSettings(): Settings {
  return {
    assistLevel: 'standard',
    quality: 'high',
    traffic: 'low',
    camera: 0,
    screenShake: true,
    showAngleArc: true,
    masterVolume: 0.8,
    musicVolume: 0.3,
    sfxVolume: 0.75,
  };
}
