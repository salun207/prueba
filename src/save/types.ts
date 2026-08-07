export const SAVE_VERSION = 1;

export interface CarCosmetics {
  paintColor: string;
  paintType: 'gloss' | 'matte' | 'metallic' | 'pearl' | 'chrome';
  wheelId: number;
  wheelColor: string;
  caliperColor: string;
  bodyKit: number; // 0 stock, 1 street, 2 widebody
  neonColor: string | null;
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
  inBay: number | null;
}

export interface ContractSave {
  id: string;
  type: string;
  text: string;
  target: number;
  progress: number;
  reward: { cash: number; parts: number; rep: number };
  done: boolean;
  daily: boolean;
  expiresAt: number;
}

export interface SaveGame {
  version: number;
  createdAt: number;
  lastSeenAt: number;
  playtimeSeconds: number;

  cash: number;
  hypeTotal: number;
  rep: number;
  parts: number;
  legacy: number;

  playerLevel: number;
  playerXp: number;

  cars: CarSave[];
  activeCarInstanceId: string;

  bays: number;
  rooms: Record<string, number>;
  sponsors: Record<string, number>;
  staff: Record<string, number>;
  legacyNodes: Record<string, number>;

  contracts: ContractSave[];
  dailyStreak: number;
  lastDailyClaim: number;

  prestigeCount: number;
  records: {
    bestScore: number;
    bestCombo: number;
    longestDrift: number;
    totalRuns: number;
    totalCrashes: number;
    totalDriftDistance: number;
  };

  settings: Settings;
  tutorialDone: boolean;
  runsPlayed: number;
}

export interface Settings {
  assistLevel: 'casual' | 'standard' | 'pro';
  quality: 'low' | 'medium' | 'high' | 'ultra';
  traffic: 'off' | 'low' | 'medium' | 'high';
  screenShake: boolean;
  showAngleArc: boolean;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  uiScale: number;
}

export function defaultSettings(): Settings {
  return {
    assistLevel: 'standard',
    quality: 'high',
    traffic: 'low',
    screenShake: true,
    showAngleArc: true,
    masterVolume: 0.8,
    musicVolume: 0.35,
    sfxVolume: 0.7,
    uiScale: 1,
  };
}
