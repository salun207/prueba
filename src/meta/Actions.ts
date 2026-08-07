import { CARS, getCar } from '../data/cars';
import { LEGACY_BY_ID, legacyCost, legacyPointsFor, PRESTIGE_MIN_HYPE } from '../data/legacy';
import { bayCost, MAX_BAYS, ROOMS_BY_ID, roomCost } from '../data/rooms';
import { SPONSORS_BY_ID, sponsorCost } from '../data/sponsors';
import { STAFF_BY_ID, staffCost } from '../data/staff';
import { UPGRADES_BY_ID, upgradeCost } from '../data/upgrades';
import { makeCar } from '../save/SaveManager';
import type { SaveGame } from '../save/types';
import { computeBonuses } from './Economy';

export function upgradePrice(save: SaveGame, carIndex: number, upgradeId: string): { cash: number; parts: number } | null {
  const u = UPGRADES_BY_ID.get(upgradeId);
  const car = save.cars[carIndex];
  if (!u || !car) return null;
  const level = car.upgrades[upgradeId] ?? 0;
  if (level >= u.maxLevel) return null;
  const base = upgradeCost(u, level);
  const discount = computeBonuses(save).upgradeDiscount;
  return { cash: Math.floor(base.cash * (1 - discount)), parts: base.parts };
}

export function buyUpgrade(save: SaveGame, carIndex: number, upgradeId: string): boolean {
  const price = upgradePrice(save, carIndex, upgradeId);
  if (!price) return false;
  if (save.cash < price.cash || save.parts < price.parts) return false;
  save.cash -= price.cash;
  save.parts -= price.parts;
  const car = save.cars[carIndex];
  car.upgrades[upgradeId] = (car.upgrades[upgradeId] ?? 0) + 1;
  return true;
}

export function buySponsor(save: SaveGame, id: string): boolean {
  const def = SPONSORS_BY_ID.get(id);
  if (!def) return false;
  const level = save.sponsors[id] ?? 0;
  if (level >= def.maxLevel) return false;
  if (save.hypeTotal < def.hypeRequired) return false;
  const cost = sponsorCost(def, level);
  if (save.cash < cost) return false;
  save.cash -= cost;
  save.sponsors[id] = level + 1;
  if (id === 'meridian' && level === 0) grantCar(save, 'meridian_zenith');
  return true;
}

export function hireStaff(save: SaveGame, id: string): boolean {
  const def = STAFF_BY_ID.get(id);
  if (!def) return false;
  const level = save.staff[id] ?? 0;
  if (level >= def.maxLevel) return false;
  const cost = staffCost(def, level);
  if (save.cash < cost) return false;
  save.cash -= cost;
  save.staff[id] = level + 1;
  return true;
}

export function fireStaff(save: SaveGame, id: string): boolean {
  const def = STAFF_BY_ID.get(id);
  const level = save.staff[id] ?? 0;
  if (!def || level <= 0) return false;
  save.staff[id] = level - 1;
  save.cash += Math.floor(staffCost(def, level - 1) * 0.4);
  return true;
}

export function buyRoom(save: SaveGame, id: string): boolean {
  const def = ROOMS_BY_ID.get(id);
  if (!def) return false;
  const level = save.rooms[id] ?? 0;
  if (level >= def.maxLevel) return false;
  const cost = roomCost(def, level);
  if (save.cash < cost) return false;
  save.cash -= cost;
  save.rooms[id] = level + 1;
  return true;
}

export function buyBay(save: SaveGame): boolean {
  if (save.bays >= MAX_BAYS) return false;
  const cost = bayCost(save.bays + 1);
  if (save.cash < cost) return false;
  save.cash -= cost;
  save.bays++;
  return true;
}

export function canBuyCar(save: SaveGame, id: string): { ok: boolean; reason: string } {
  const def = getCar(id);
  if (save.cars.some((c) => c.id === id)) return { ok: false, reason: 'Ya lo tenés' };
  switch (def.unlock.type) {
    case 'start':
      return { ok: false, reason: 'Inicial' };
    case 'cash':
      return save.cash >= def.price
        ? { ok: true, reason: '' }
        : { ok: false, reason: 'Falta plata' };
    case 'rep':
      return save.rep >= (def.unlock.amount ?? 0)
        ? { ok: true, reason: '' }
        : { ok: false, reason: `Necesitás ${def.unlock.amount} ★` };
    case 'sponsor':
      return (save.sponsors[def.unlock.key ?? ''] ?? 0) > 0
        ? { ok: true, reason: '' }
        : { ok: false, reason: 'Requiere sponsor' };
    case 'prestige':
      return save.legacy >= (def.unlock.amount ?? 0)
        ? { ok: true, reason: '' }
        : { ok: false, reason: `Necesitás ${def.unlock.amount} ◆` };
  }
}

export function grantCar(save: SaveGame, id: string): void {
  if (save.cars.some((c) => c.id === id)) return;
  const bay = nextFreeBay(save);
  save.cars.push(makeCar(id, bay));
}

function nextFreeBay(save: SaveGame): number | null {
  const used = new Set(save.cars.map((c) => c.inBay).filter((b) => b !== null));
  for (let i = 0; i < save.bays; i++) if (!used.has(i)) return i;
  return null;
}

export function buyCar(save: SaveGame, id: string): boolean {
  const check = canBuyCar(save, id);
  if (!check.ok) return false;
  const def = getCar(id);
  if (def.unlock.type === 'cash') {
    if (save.cash < def.price) return false;
    save.cash -= def.price;
  } else if (def.unlock.type === 'prestige') {
    const need = def.unlock.amount ?? 0;
    if (save.legacy < need) return false;
    save.legacy -= need;
  }
  grantCar(save, id);
  return true;
}

export function sellCar(save: SaveGame, instanceId: string): boolean {
  if (save.cars.length <= 1) return false;
  const idx = save.cars.findIndex((c) => c.instanceId === instanceId);
  if (idx < 0) return false;
  const car = save.cars[idx];
  save.cash += Math.floor(getCar(car.id).price * 0.5);
  save.parts += 5 * car.level;
  save.cars.splice(idx, 1);
  if (save.activeCarInstanceId === instanceId) save.activeCarInstanceId = save.cars[0].instanceId;
  return true;
}

export function buyLegacy(save: SaveGame, id: string): boolean {
  const node = LEGACY_BY_ID.get(id);
  if (!node) return false;
  const level = save.legacyNodes[id] ?? 0;
  if (level >= node.maxLevel) return false;
  const cost = legacyCost(node, level);
  if (save.legacy < cost) return false;
  save.legacy -= cost;
  save.legacyNodes[id] = level + 1;
  return true;
}

export function canPrestige(save: SaveGame): boolean {
  return save.hypeTotal >= PRESTIGE_MIN_HYPE;
}

/**
 * Vender el imperio. Se pierde cash, sponsors, staff, salas y los autos menos
 * el elegido. Se conserva Legacy, cosméticos, récords y el árbol.
 */
export function prestige(save: SaveGame, keepInstanceId: string): boolean {
  if (!canPrestige(save)) return false;
  const points = legacyPointsFor(save.hypeTotal);
  const keep = save.cars.find((c) => c.instanceId === keepInstanceId) ?? save.cars[0];
  const legendary = save.cars.filter((c) => c.level >= 30 && c.instanceId !== keep.instanceId);

  save.legacy += points;
  save.prestigeCount++;
  save.cash = 0;
  save.hypeTotal = 0;
  save.parts = 0;
  save.sponsors = {};
  save.staff = {};
  save.rooms = {};
  save.contracts = [];
  save.cars = [keep, ...legendary];
  keep.inBay = 0;
  legendary.forEach((c, i) => (c.inBay = i + 1 < save.bays ? i + 1 : null));
  save.activeCarInstanceId = keep.instanceId;
  save.bays = 1 + (save.legacyNodes['bay'] ?? 0);

  if ((save.legacyNodes['contacts'] ?? 0) > 0) {
    save.sponsors = { koen: 1, vertex: 1, nightowl: 1 };
  }
  return true;
}

export function carList(): typeof CARS {
  return CARS;
}
