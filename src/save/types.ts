export const SAVE_VERSION = 2;

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

  records: {
    bestScore: number;
    bestCombo: number;
    longestDrift: number;
    bestCashRun: number;
    totalRuns: number;
    totalCrashes: number;
    totalDriftDistance: number;
    totalCashEarned: number;
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
