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

export function makeCar(id: string, bay: number | null = 0): CarSave {
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
      wheelId: 0,
      wheelColor: '#2a2f3a',
      caliperColor: '#ff3b30',
      bodyKit: 0,
      neonColor: null,
      smokeColor: null,
    },
    inBay: bay,
  };
}

export function newSave(): SaveGame {
  const first = makeCar('kite_240', 0);
  return {
    version: SAVE_VERSION,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    playtimeSeconds: 0,
    cash: 0,
    hypeTotal: 0,
    rep: 0,
    parts: 0,
    legacy: 0,
    playerLevel: 1,
    playerXp: 0,
    cars: [first],
    activeCarInstanceId: first.instanceId,
    bays: 1,
    rooms: {},
    sponsors: {},
    staff: {},
    legacyNodes: {},
    contracts: [],
    dailyStreak: 0,
    lastDailyClaim: 0,
    prestigeCount: 0,
    records: {
      bestScore: 0,
      bestCombo: 0,
      longestDrift: 0,
      totalRuns: 0,
      totalCrashes: 0,
      totalDriftDistance: 0,
    },
    settings: defaultSettings(),
    tutorialDone: false,
    runsPlayed: 0,
  };
}

/** Migraciones: nunca romper un save viejo. */
const MIGRATIONS: Record<number, (s: SaveGame) => SaveGame> = {
  // 1 → 2 iría acá cuando cambie el esquema.
};

function migrate(save: SaveGame): SaveGame {
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

/** Un NaN en el cash rompe todo el juego para siempre. Se sanea al cargar. */
function sanitize(s: SaveGame): SaveGame {
  const nums: (keyof SaveGame)[] = ['cash', 'hypeTotal', 'rep', 'parts', 'legacy', 'playerXp'];
  for (const k of nums) {
    const v = s[k] as unknown as number;
    if (!Number.isFinite(v) || v < 0) (s[k] as unknown as number) = 0;
  }
  if (!Number.isFinite(s.playerLevel) || s.playerLevel < 1) s.playerLevel = 1;
  if (!s.cars || s.cars.length === 0) {
    const c = makeCar('kite_240', 0);
    s.cars = [c];
    s.activeCarInstanceId = c.instanceId;
  }
  if (!s.cars.some((c) => c.instanceId === s.activeCarInstanceId)) {
    s.activeCarInstanceId = s.cars[0].instanceId;
  }
  for (const c of s.cars) {
    c.setup = { ...SETUP_DEFAULTS, ...c.setup };
    if (!Number.isFinite(c.xp) || c.xp < 0) c.xp = 0;
    if (!Number.isFinite(c.level) || c.level < 1) c.level = 1;
  }
  s.settings = { ...defaultSettings(), ...s.settings };
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
        const parsed = JSON.parse(raw) as SaveGame;
        return sanitize(migrate({ ...newSave(), ...parsed }));
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
    if (this.dirty && this.timer > 2) {
      this.flush();
    } else if (this.timer > 30) {
      this.flush();
    }
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
      const parsed = JSON.parse(decodeURIComponent(escape(atob(text.trim())))) as SaveGame;
      this.data = sanitize(migrate({ ...newSave(), ...parsed }));
      this.flush();
      return true;
    } catch {
      return false;
    }
  }

  get activeCar(): CarSave {
    return this.data.cars.find((c) => c.instanceId === this.data.activeCarInstanceId) ?? this.data.cars[0];
  }
}
