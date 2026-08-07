/**
 * Pub/sub tipado. Todo evento de gameplay pasa por acá: audio, VFX y UI se
 * suscriben. Nada de llamadas directas cruzadas entre sistemas.
 */

export interface GameEvents {
  'drift:start': { angle: number };
  'drift:tier': { tier: number; label: string; mult: number };
  'drift:bank': { points: number; mult: number; x: number; z: number };
  'drift:lost': { points: number };
  'bonus': { label: string; points: number; x: number; z: number };
  'collision': { severity: 'scrape' | 'hit' | 'crash'; impulse: number; x: number; z: number; nx: number; nz: number };
  'prop:destroyed': { x: number; z: number; type: string };
  'gear:shift': { gear: number };
  'run:end': Record<string, never>;
  'cash:earned': { amount: number };
  'ui:refresh': Record<string, never>;
}

type Handler<K extends keyof GameEvents> = (payload: GameEvents[K]) => void;

export class EventBus {
  private handlers = new Map<string, Set<(p: unknown) => void>>();

  on<K extends keyof GameEvents>(event: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(fn as (p: unknown) => void);
    return () => set!.delete(fn as (p: unknown) => void);
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const fn of set) fn(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const bus = new EventBus();
