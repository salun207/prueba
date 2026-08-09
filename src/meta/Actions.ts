import { CARS, getCar } from '../data/cars';
import { UPGRADES_BY_ID, upgradeCost } from '../data/upgrades';
import { makeCar } from '../save/SaveManager';
import type { SaveGame } from '../save/types';

/**
 * Acciones del garage. Todo se paga con plata ganada drifteando: no hay
 * monedas premium, ni partes, ni desbloqueos por esperar.
 */

export function upgradePrice(save: SaveGame, carIndex: number, upgradeId: string): number | null {
  const u = UPGRADES_BY_ID.get(upgradeId);
  const car = save.cars[carIndex];
  if (!u || !car) return null;
  const level = car.upgrades[upgradeId] ?? 0;
  if (level >= u.maxLevel) return null;
  return upgradeCost(u, level);
}

export function buyUpgrade(save: SaveGame, carIndex: number, upgradeId: string): boolean {
  const price = upgradePrice(save, carIndex, upgradeId);
  if (price === null || save.cash < price) return false;
  save.cash -= price;
  const car = save.cars[carIndex];
  car.upgrades[upgradeId] = (car.upgrades[upgradeId] ?? 0) + 1;
  return true;
}

export interface UnlockCheck {
  ok: boolean;
  reason: string;
  price: string;
}

export function carUnlock(save: SaveGame, id: string): UnlockCheck {
  const def = getCar(id);
  if (save.cars.some((c) => c.id === id)) return { ok: false, reason: 'Ya lo tenés', price: '—' };
  if (def.unlock.type === 'start') return { ok: false, reason: 'Inicial', price: '—' };

  if (def.unlock.type === 'rep') {
    const need = def.unlock.amount ?? 0;
    if (save.rep < need) {
      return { ok: false, reason: `Te faltan ${need - save.rep} ★`, price: `${need} ★` };
    }
    return save.cash >= def.price
      ? { ok: true, reason: '', price: `$${def.price.toLocaleString('es-AR')}` }
      : { ok: false, reason: 'Falta plata', price: `$${def.price.toLocaleString('es-AR')}` };
  }

  return save.cash >= def.price
    ? { ok: true, reason: '', price: `$${def.price.toLocaleString('es-AR')}` }
    : { ok: false, reason: 'Falta plata', price: `$${def.price.toLocaleString('es-AR')}` };
}

export function buyCar(save: SaveGame, id: string): boolean {
  if (!carUnlock(save, id).ok) return false;
  const def = getCar(id);
  save.cash -= def.price;
  save.cars.push(makeCar(id));
  return true;
}

export function sellCar(save: SaveGame, instanceId: string): boolean {
  if (save.cars.length <= 1) return false;
  const idx = save.cars.findIndex((c) => c.instanceId === instanceId);
  if (idx < 0) return false;
  const car = save.cars[idx];
  save.cash += Math.floor(getCar(car.id).price * 0.6);
  save.cars.splice(idx, 1);
  if (save.activeCarInstanceId === instanceId) save.activeCarInstanceId = save.cars[0].instanceId;
  return true;
}

export function selectCar(save: SaveGame, instanceId: string): boolean {
  if (!save.cars.some((c) => c.instanceId === instanceId)) return false;
  save.activeCarInstanceId = instanceId;
  return true;
}

export function carList(): typeof CARS {
  return CARS;
}
