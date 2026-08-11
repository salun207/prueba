import { SETUP_DEFAULTS } from '../data/upgrades';
import { CARS } from '../data/cars';
import { defaultSettings, SAVE_VERSION, type CarSave, type SaveGame } from './types';

const KEY = 'neon-apex-save';
const BACKUP = 'neon-apex-save-backup';

let uid = 0;
function newId(): string {
  uid++;
  return `c${Date.now().toString(36)}${uid.toString(36)}`;
}

export function makeCar(id: string): CarSave {
  const def = CARS.find((c) => c.id === id) ?? CARS[0];
  return {
    id,
    instanceId: newId(),
    level: 1,
    xp: 0,
    upgrades: {},
    setup: { ...SETUP_DEFAULTS },
    cosmetics: {
      paintColor: def.defaultPaint,
      paintType: 'gloss',
      wheelColor: '#2a2622',
      caliperColor: '#ff4d3a',
      bodyKit: 0,
      smokeColor: null,
    },
  };
}

export function newSave(): SaveGame {
  const first = makeCar('kite_240');
  return {
    version: SAVE_VERSION,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    playtimeSeconds: 0,
    cash: 0,
    rep: 0,
    playerLevel: 1,
    playerXp: 0,
    cars: [first],
    activeCarInstanceId: first.instanceId,
    challenges: [],
    dailyStreak: 0,
    lastDailyClaim: 0,
    gameMode: 'traffic',
    selectedRoute: 'autopista',
    trafficRecords: {},
    selectedMap: 'apex',
    mapRecords: {},
    records: {
      bestScore: 0,
      bestCombo: 0,
      longestDrift: 0,
      bestCashRun: 0,
      totalRuns: 0,
      totalCrashes: 0,
      totalDriftDistance: 0,
      totalCashEarned: 0,
      bestTrafficScore: 0,
      bestTrafficDistance: 0,
      totalNearMisses: 0,
      totalOvertakes: 0,
    },
    settings: defaultSettings(),
    tutorialDone: false,
    runsPlayed: 0,
  };
}

type LegacySave = SaveGame & Record<string, unknown>;

/**
 * Migraciones: nunca romper un save viejo.
 *
 * 1 → 2 saca toda la capa tycoon (hype, partes, sponsors, staff, salas, bahías,
 * prestige). La plata que el jugador tenía se conserva pero se recorta, porque
 * en v1 venía inflada por el ingreso pasivo y con la economía nueva rompería la
 * progresión.
 */
const MIGRATIONS: Record<number, (s: LegacySave) => LegacySave> = {
  // 3 → 4: aparece el modo tráfico. Quien ya venía jugando arranca en el modo
  // que conoce; el juego nuevo arranca en tráfico (ver newSave).
  3: (s) => {
    s.gameMode = 'drift';
    s.selectedRoute = 'autopista';
    s.trafficRecords = {};
    return s;
  },
  // 2 → 3: aparecen los mapas. Los saves viejos jugaban solo en la ciudad, así
  // que arrancan en el circuito nuevo y conservan la ciudad si ya tienen la
  // reputación para tenerla abierta.
  2: (s) => {
    s.selectedMap = 'apex';
    s.mapRecords = {};
    return s;
  },
  1: (s) => {
    const legacy = s as LegacySave;
    s.cash = Math.min(Number(legacy.cash) || 0, 250_000);
    s.rep = Number(legacy.rep) || 0;
    s.challenges = Array.isArray(legacy.contracts)
      ? (legacy.contracts as SaveGame['challenges']).map((c) => ({
          ...c,
          reward: { cash: c.reward?.cash ?? 0, rep: c.reward?.rep ?? 0 },
        }))
      : [];
    for (const key of [
      'hypeTotal', 'hypeCurrent', 'parts', 'legacy', 'sponsors', 'staff',
      'rooms', 'bays', 'legacyNodes', 'prestigeCount', 'contracts',
    ]) {
      delete legacy[key];
    }
    for (const car of s.cars ?? []) {
      const c = car as CarSave & Record<string, unknown>;
      delete c.inBay;
      delete c.perks;
      delete c.isLegendary;
      delete c.setupPresets;
      const cos = c.cosmetics as unknown as Record<string, unknown> | undefined;
      if (cos) {
        delete cos.neonColor;
        delete cos.wheelId;
        delete cos.decals;
      }
    }
    return s;
  },
};

function migrate(save: LegacySave): SaveGame {
  let s = save;
  while (s.version < SAVE_VERSION) {
    const fn = MIGRATIONS[s.version];
    if (!fn) {
      s.version = SAVE_VERSION;
      break;
    }
    s = fn(s);
    s.version++;
  }
  return s;
}

/** Un NaN en el cash rompe el juego para siempre. Se sanea al cargar. */
function sanitize(s: SaveGame): SaveGame {
  for (const k of ['cash', 'rep', 'playerXp'] as const) {
    if (!Number.isFinite(s[k]) || s[k] < 0) s[k] = 0;
  }
  if (!Number.isFinite(s.playerLevel) || s.playerLevel < 1) s.playerLevel = 1;
  if (!Array.isArray(s.cars) || s.cars.length === 0) {
    const c = makeCar('kite_240');
    s.cars = [c];
    s.activeCarInstanceId = c.instanceId;
  }
  if (!s.cars.some((c) => c.instanceId === s.activeCarInstanceId)) {
    s.activeCarInstanceId = s.cars[0].instanceId;
  }
  for (const c of s.cars) {
    c.setup = { ...SETUP_DEFAULTS, ...c.setup };
    c.upgrades = c.upgrades ?? {};
    if (!Number.isFinite(c.xp) || c.xp < 0) c.xp = 0;
    if (!Number.isFinite(c.level) || c.level < 1) c.level = 1;
  }
  if (!Array.isArray(s.challenges)) s.challenges = [];
  if (typeof s.selectedMap !== 'string') s.selectedMap = 'apex';
  if (!s.mapRecords || typeof s.mapRecords !== 'object') s.mapRecords = {};
  if (s.gameMode !== 'drift' && s.gameMode !== 'traffic') s.gameMode = 'traffic';
  if (typeof s.selectedRoute !== 'string') s.selectedRoute = 'autopista';
  if (!s.trafficRecords || typeof s.trafficRecords !== 'object') s.trafficRecords = {};
  s.settings = { ...defaultSettings(), ...s.settings };
  s.records = { ...newSave().records, ...s.records };
  return s;
}

export class SaveManager {
  data: SaveGame;
  private dirty = false;
  private timer = 0;

  constructor() {
    this.data = this.load();
  }

  private load(): SaveGame {
    for (const key of [KEY, BACKUP]) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as LegacySave;
        return sanitize(migrate({ ...newSave(), ...parsed } as LegacySave));
      } catch {
        // corrupto: probamos el backup
      }
    }
    return newSave();
  }

  markDirty(): void {
    this.dirty = true;
  }

  update(dt: number): void {
    this.data.playtimeSeconds += dt;
    this.timer += dt;
    if (this.dirty && this.timer > 2) this.flush();
    else if (this.timer > 30) this.flush();
  }

  flush(): void {
    this.timer = 0;
    this.dirty = false;
    this.data.lastSeenAt = Date.now();
    try {
      const json = JSON.stringify(this.data);
      JSON.parse(json); // verificación antes de pisar el save bueno
      const prev = localStorage.getItem(KEY);
      if (prev) localStorage.setItem(BACKUP, prev);
      localStorage.setItem(KEY, json);
    } catch (e) {
      console.warn('No se pudo guardar', e);
    }
  }

  reset(): void {
    this.data = newSave();
    this.flush();
  }

  exportSave(): string {
    return btoa(unescape(encodeURIComponent(JSON.stringify(this.data))));
  }

  importSave(text: string): boolean {
    try {
      const parsed = JSON.parse(decodeURIComponent(escape(atob(text.trim())))) as LegacySave;
      this.data = sanitize(migrate({ ...newSave(), ...parsed } as LegacySave));
      this.flush();
      return true;
    } catch {
      return false;
    }
  }

  get activeCar(): CarSave {
    return (
      this.data.cars.find((c) => c.instanceId === this.data.activeCarInstanceId) ?? this.data.cars[0]
    );
  }
}
