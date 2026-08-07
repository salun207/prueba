import { audio } from '../audio/AudioEngine';
import { CARS, getCar } from '../data/cars';
import { LEGACY_NODES, legacyCost, legacyPointsFor, PRESTIGE_MIN_HYPE } from '../data/legacy';
import { bayCost, MAX_BAYS, ROOMS } from '../data/rooms';
import { SPONSORS, sponsorCost, sponsorMultiplier } from '../data/sponsors';
import { STAFF, staffCost } from '../data/staff';
import { SETUP_PARAMS, SETUP_RECOMMENDED, UPGRADES } from '../data/upgrades';
import { clamp, degrees } from '../lib/math';
import * as A from '../meta/Actions';
import { buildCar } from '../meta/CarBuild';
import {
  carXpForLevel, computeBonuses, incomePerSecond, xpForLevel,
  type Bonuses, type RunRewards,
} from '../meta/Economy';
import type { ContractSave, SaveGame } from '../save/types';
import type { RunStats } from '../sim/ScoreSystem';
import { fmt, fmtCash, fmtDuration, fmtInt } from './format';

export interface UiHost {
  save: SaveGame;
  startRun(mode: 'timed' | 'free'): void;
  resumeRun(): void;
  endRun(): void;
  onCarChanged(): void;
  onSettingsChanged(): void;
  markDirty(): void;
}

type Screen = 'hidden' | 'garage' | 'results' | 'offline' | 'pause';

const PALETTE = [
  '#22e1ff', '#ff2e88', '#39ff88', '#ffa332', '#ff3b30', '#e8ecf5',
  '#9aa3b5', '#141826', '#6a3aff', '#00c2a8', '#ffd83a', '#ff6a2a',
];

export class GameUI {
  private root: HTMLElement;
  private host: UiHost;
  private screen: Screen = 'hidden';
  private tab = 'garage';
  private lastResults: { rewards: RunRewards; stats: RunStats; contracts: string[]; levelUps: number } | null = null;
  private offlineData: { seconds: number; cash: number } | null = null;
  private toastTimer = 0;

  constructor(root: HTMLElement, host: UiHost) {
    this.root = root;
    this.host = host;
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('input', (e) => this.onInput(e));
    root.addEventListener('change', (e) => this.onInput(e));
  }

  get save(): SaveGame {
    return this.host.save;
  }

  get visible(): boolean {
    return this.screen !== 'hidden';
  }

  hide(): void {
    this.screen = 'hidden';
    this.root.innerHTML = '';
    this.root.classList.remove('active');
  }

  showGarage(tab = this.tab): void {
    this.tab = tab;
    this.screen = 'garage';
    this.render();
  }

  showResults(rewards: RunRewards, stats: RunStats, contracts: string[], levelUps: number): void {
    this.lastResults = { rewards, stats, contracts, levelUps };
    this.screen = 'results';
    this.render();
  }

  showOffline(seconds: number, cash: number): void {
    this.offlineData = { seconds, cash };
    this.screen = 'offline';
    this.render();
  }

  showPause(): void {
    this.screen = 'pause';
    this.render();
  }

  toast(msg: string): void {
    let el = this.root.querySelector('.toast') as HTMLElement | null;
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      this.root.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    this.toastTimer = 2.2;
  }

  update(dt: number): void {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) {
        this.root.querySelector('.toast')?.classList.remove('show');
      }
    }
    // El ingreso pasivo se ve subir en vivo
    if (this.screen === 'garage') {
      const el = this.root.querySelector('[data-live="cash"]');
      if (el) el.textContent = fmtCash(this.save.cash);
    }
  }

  // ─────────────────────────── render ───────────────────────────

  private render(): void {
    this.root.classList.toggle('active', this.screen !== 'hidden');
    switch (this.screen) {
      case 'garage': this.root.innerHTML = this.garageHtml(); break;
      case 'results': this.root.innerHTML = this.resultsHtml(); break;
      case 'offline': this.root.innerHTML = this.offlineHtml(); break;
      case 'pause': this.root.innerHTML = this.pauseHtml(); break;
      default: this.root.innerHTML = '';
    }
  }

  private topBar(): string {
    const s = this.save;
    const b = computeBonuses(s);
    const ips = incomePerSecond(s, b);
    return `
      <header class="topbar">
        <div class="currencies">
          <span class="cur cash" data-live="cash">${fmtCash(s.cash)}</span>
          <span class="cur hype">⚡ ${fmt(s.hypeTotal)}</span>
          <span class="cur rep">★ ${fmt(s.rep)}</span>
          <span class="cur parts">⚙ ${fmt(s.parts)}</span>
          ${s.legacy > 0 ? `<span class="cur legacy">◆ ${fmt(s.legacy)}</span>` : ''}
          <span class="cur ips">+${fmtCash(ips)}/s</span>
        </div>
        <button class="drive" data-act="drive">MANEJAR</button>
      </header>`;
  }

  private tabs(): string {
    const list: [string, string][] = [
      ['garage', 'Garage'],
      ['cars', 'Autos'],
      ['upgrades', 'Upgrades'],
      ['setup', 'Setup'],
      ['paint', 'Pintura'],
      ['sponsors', 'Sponsors'],
      ['staff', 'Staff'],
      ['contracts', 'Contratos'],
      ['legacy', 'Legacy'],
      ['options', 'Opciones'],
    ];
    return `<nav class="tabs">${list
      .map(([id, label]) => `<button data-act="tab" data-id="${id}" class="${this.tab === id ? 'on' : ''}">${label}</button>`)
      .join('')}</nav>`;
  }

  private garageHtml(): string {
    let body = '';
    switch (this.tab) {
      case 'garage': body = this.tabGarage(); break;
      case 'cars': body = this.tabCars(); break;
      case 'upgrades': body = this.tabUpgrades(); break;
      case 'setup': body = this.tabSetup(); break;
      case 'paint': body = this.tabPaint(); break;
      case 'sponsors': body = this.tabSponsors(); break;
      case 'staff': body = this.tabStaff(); break;
      case 'contracts': body = this.tabContracts(); break;
      case 'legacy': body = this.tabLegacy(); break;
      case 'options': body = this.tabOptions(); break;
    }
    return `
      <div class="screen garage">
        ${this.topBar()}
        ${this.tabs()}
        <div class="content">${body}</div>
      </div>`;
  }

  // ── Garage: bahías y salas ──
  private tabGarage(): string {
    const s = this.save;
    const b = computeBonuses(s);
    const bays: string[] = [];
    for (let i = 0; i < MAX_BAYS; i++) {
      if (i < s.bays) {
        const car = s.cars.find((c) => c.inBay === i);
        const def = car ? getCar(car.id) : null;
        bays.push(`
          <div class="bay ${car ? 'full' : 'empty'}">
            <div class="bay-num">BAHÍA ${i + 1}</div>
            ${def ? `<div class="bay-car" style="--paint:${car!.cosmetics.paintColor}">
                <div class="carchip"></div>
                <b>${def.displayName}</b><span>Nv.${car!.level}</span>
              </div>` : '<div class="bay-empty">Vacía</div>'}
          </div>`);
      } else if (i === s.bays) {
        const cost = bayCost(i + 1);
        bays.push(`
          <div class="bay locked">
            <div class="bay-num">BAHÍA ${i + 1}</div>
            <button data-act="buybay" ${s.cash >= cost ? '' : 'disabled'}>${fmtCash(cost)}</button>
          </div>`);
      } else {
        bays.push(`<div class="bay locked dim"><div class="bay-num">BAHÍA ${i + 1}</div><span>—</span></div>`);
      }
    }

    const rooms = ROOMS.map((r) => {
      const level = s.rooms[r.id] ?? 0;
      const cost = level >= r.maxLevel ? null : Math.floor(r.baseCost * Math.pow(r.growth, level));
      return this.card(
        r.name,
        `${r.desc}<br><b>Nivel ${level}/${r.maxLevel}</b>`,
        cost === null ? 'MAX' : fmtCash(cost),
        cost !== null && s.cash >= cost,
        'buyroom',
        r.id,
        level / r.maxLevel,
      );
    }).join('');

    return `
      <h2>Tu garage</h2>
      <p class="hint">Los autos guardados en bahías se alquilan para eventos y generan plata sola. Ingreso pasivo actual: <b>${fmtCash(incomePerSecond(s, b))}/s</b></p>
      <div class="bays">${bays.join('')}</div>
      <h2>Salas</h2>
      <div class="grid">${rooms}</div>`;
  }

  // ── Autos ──
  private tabCars(): string {
    const s = this.save;
    const owned = s.cars.map((c) => {
      const def = getCar(c.id);
      const active = c.instanceId === s.activeCarInstanceId;
      const xpNeed = carXpForLevel(c.level);
      return `
        <div class="card car ${active ? 'active' : ''}" style="--paint:${c.cosmetics.paintColor}">
          <div class="carchip big"></div>
          <h3>${def.displayName} <span class="tier t${def.tier}">${def.tier}</span></h3>
          <p class="blurb">${def.blurb}</p>
          <div class="bar"><i style="width:${clamp(c.xp / xpNeed, 0, 1) * 100}%"></i></div>
          <small>Nv.${c.level} · ${fmtInt(c.xp)}/${fmtInt(xpNeed)} XP</small>
          <div class="actions">
            ${active ? '<button disabled>EN USO</button>' : `<button data-act="select" data-id="${c.instanceId}">USAR</button>`}
            ${s.cars.length > 1 ? `<button class="ghost" data-act="sell" data-id="${c.instanceId}">VENDER</button>` : ''}
          </div>
        </div>`;
    }).join('');

    const shop = CARS.filter((d) => !s.cars.some((c) => c.id === d.id)).map((d) => {
      const check = A.canBuyCar(s, d.id);
      const price =
        d.unlock.type === 'cash' ? fmtCash(d.price)
        : d.unlock.type === 'prestige' ? `${d.unlock.amount} ◆`
        : d.unlock.type === 'sponsor' ? 'Sponsor'
        : d.unlock.type === 'rep' ? `${d.unlock.amount} ★`
        : '—';
      return `
        <div class="card car shop" style="--paint:${d.defaultPaint}">
          <div class="carchip big"></div>
          <h3>${d.displayName} <span class="tier t${d.tier}">${d.tier}</span></h3>
          <p class="blurb">${d.blurb}</p>
          <small>${Math.round(d.spec.mass)} kg · ${Math.round(Math.max(...d.spec.torqueCurve.map((t) => t[1])))} N·m · ${degrees(d.spec.maxSteerAngle).toFixed(0)}°</small>
          <div class="actions">
            <button data-act="buycar" data-id="${d.id}" ${check.ok ? '' : 'disabled'}>${check.ok ? price : `${price} · ${check.reason}`}</button>
          </div>
        </div>`;
    }).join('');

    return `<h2>Tus autos</h2><div class="grid">${owned}</div>
            <h2>Concesionaria</h2><div class="grid">${shop}</div>`;
  }

  // ── Upgrades ──
  private tabUpgrades(): string {
    const s = this.save;
    const idx = s.cars.findIndex((c) => c.instanceId === s.activeCarInstanceId);
    const car = s.cars[idx];
    const def = getCar(car.id);
    const items = UPGRADES.map((u) => {
      const level = car.upgrades[u.id] ?? 0;
      const price = A.upgradePrice(s, idx, u.id);
      const label = price === null
        ? 'MAX'
        : `${fmtCash(price.cash)}${price.parts > 0 ? ` + ${price.parts}⚙` : ''}`;
      const afford = price !== null && s.cash >= price.cash && s.parts >= price.parts;
      const next = level < u.maxLevel ? `${u.readout(level)} → <b>${u.readout(level + 1)}</b>` : u.readout(level);
      return this.card(
        `${u.name} <small>${level}/${u.maxLevel}</small>`,
        `${u.desc}<br>${next}`,
        label,
        afford,
        'buyupgrade',
        u.id,
        level / u.maxLevel,
      );
    }).join('');
    return `<h2>Upgrades — ${def.displayName}</h2>
            <p class="hint">Todo esto cambia la física de verdad, no son stats de adorno.</p>
            <div class="grid">${items}</div>`;
  }

  // ── Setup ──
  private tabSetup(): string {
    const s = this.save;
    const car = s.cars.find((c) => c.instanceId === s.activeCarInstanceId)!;
    const built = buildCar(car, computeBonuses(s));
    const spec = built.spec;

    const stability = clamp(
      spec.diffLock * 0.35 + (spec.peakGripRear / spec.peakGripFront) * 0.5 + (1 - spec.tireFalloff) * 0.35,
      0, 1,
    );
    const angle = clamp((degrees(spec.maxSteerAngle) - 28) / 45, 0, 1);
    const accel = clamp(
      (Math.max(...spec.torqueCurve.map((t) => t[1])) * built.mods.torqueScale) / spec.mass / 0.9,
      0, 1,
    );

    const sliders = SETUP_PARAMS.map((p) => {
      const v = car.setup[p.id] ?? p.def;
      return `
        <div class="slider">
          <label>${p.name}<b>${v}${p.unit}</b></label>
          <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${v}" data-act="setup" data-id="${p.id}">
          <small>${p.hint}</small>
        </div>`;
    }).join('');

    return `
      <h2>Setup</h2>
      <p class="hint">Gratis y ajustable siempre. Si no querés entender nada, tocá "Setup recomendado".</p>
      <div class="summary">
        ${this.meter('ESTABILIDAD', stability, '#22e1ff')}
        ${this.meter('ÁNGULO', angle, '#ff2e88')}
        ${this.meter('ACELERACIÓN', accel, '#39ff88')}
      </div>
      <div class="actions">
        <button data-act="setup-rec">SETUP RECOMENDADO</button>
        <button class="ghost" data-act="setup-def">VOLVER A STOCK</button>
      </div>
      <div class="sliders">${sliders}</div>`;
  }

  private meter(label: string, value: number, color: string): string {
    return `<div class="meter"><span>${label}</span><div class="bar"><i style="width:${value * 100}%;background:${color}"></i></div></div>`;
  }

  // ── Pintura ──
  private tabPaint(): string {
    const s = this.save;
    const car = s.cars.find((c) => c.instanceId === s.activeCarInstanceId)!;
    const c = car.cosmetics;
    const neonUnlocked = (s.sponsors['halo'] ?? 0) > 0;

    const swatches = (act: string, current: string): string =>
      PALETTE.map((p) => `<button class="swatch ${p === current ? 'on' : ''}" style="background:${p}" data-act="${act}" data-id="${p}"></button>`).join('');

    const types = ['gloss', 'matte', 'metallic', 'pearl', 'chrome']
      .map((t) => `<button class="pill ${c.paintType === t ? 'on' : ''}" data-act="painttype" data-id="${t}">${t}</button>`)
      .join('');

    const kits = ['Stock', 'Street', 'Widebody']
      .map((k, i) => `<button class="pill ${c.bodyKit === i ? 'on' : ''}" data-act="kit" data-id="${i}">${k}</button>`)
      .join('');

    return `
      <h2>Pintura y cosméticos</h2>
      <div class="paintrow"><h3>Color</h3><div class="swatches">${swatches('paint', c.paintColor)}</div></div>
      <div class="paintrow"><h3>Acabado</h3><div class="pills">${types}</div></div>
      <div class="paintrow"><h3>Llantas</h3><div class="swatches">${swatches('wheel', c.wheelColor)}</div></div>
      <div class="paintrow"><h3>Pinzas de freno</h3><div class="swatches">${swatches('caliper', c.caliperColor)}</div></div>
      <div class="paintrow"><h3>Kit de carrocería</h3><div class="pills">${kits}</div>
        <small class="hint">El widebody ensancha la vía de verdad: +0.12 m, más estable.</small></div>
      <div class="paintrow"><h3>Neón bajo el auto ${neonUnlocked ? '' : '<small>(requiere Halo Optics)</small>'}</h3>
        <div class="swatches ${neonUnlocked ? '' : 'disabled'}">
          <button class="swatch off ${c.neonColor ? '' : 'on'}" data-act="neon" data-id="none">✕</button>
          ${neonUnlocked ? swatches('neon', c.neonColor ?? '') : ''}
        </div></div>
      <div class="paintrow"><h3>Humo de color</h3>
        <div class="swatches">
          <button class="swatch off ${c.smokeColor ? '' : 'on'}" data-act="smoke" data-id="none">✕</button>
          ${swatches('smoke', c.smokeColor ?? '')}
        </div></div>`;
  }

  // ── Sponsors ──
  private tabSponsors(): string {
    const s = this.save;
    const items = SPONSORS.map((sp) => {
      const level = s.sponsors[sp.id] ?? 0;
      const locked = s.hypeTotal < sp.hypeRequired;
      const cost = sponsorCost(sp, level);
      const mult = sponsorMultiplier(sp, level);
      const body = locked
        ? `Se desbloquea con <b>${fmt(sp.hypeRequired)} ⚡</b>`
        : `${sp.perk}<br>Multiplicador actual: <b>×${mult.toFixed(2)}</b>`;
      return this.card(
        `${sp.name} <small>${level}/${sp.maxLevel}</small>`,
        body,
        locked ? '🔒' : level >= sp.maxLevel ? 'MAX' : fmtCash(cost),
        !locked && level < sp.maxLevel && s.cash >= cost,
        'buysponsor',
        sp.id,
        level / sp.maxLevel,
      );
    }).join('');
    return `<h2>Sponsors</h2>
            <p class="hint">El Hype que generás drifteando atrae sponsors. Los sponsors pagan por segundo, jugues o no.</p>
            <div class="grid">${items}</div>`;
  }

  // ── Staff ──
  private tabStaff(): string {
    const s = this.save;
    const items = STAFF.map((st) => {
      const level = s.staff[st.id] ?? 0;
      const cost = staffCost(st, level);
      return `
        <div class="card">
          <div class="bar"><i style="width:${(level / st.maxLevel) * 100}%"></i></div>
          <h3>${st.name} <small>${level}/${st.maxLevel}</small></h3>
          <p>${st.desc}</p>
          <div class="actions">
            <button data-act="hire" data-id="${st.id}" ${level < st.maxLevel && s.cash >= cost ? '' : 'disabled'}>
              ${level >= st.maxLevel ? 'MAX' : fmtCash(cost)}
            </button>
            ${level > 0 ? `<button class="ghost" data-act="fire" data-id="${st.id}">DESPEDIR</button>` : ''}
          </div>
        </div>`;
    }).join('');
    return `<h2>Staff</h2><div class="grid">${items}</div>`;
  }

  // ── Contratos ──
  private tabContracts(): string {
    const s = this.save;
    const render = (c: ContractSave): string => `
      <div class="card contract ${c.daily ? 'daily' : ''}">
        <div class="bar"><i style="width:${clamp(c.progress / c.target, 0, 1) * 100}%"></i></div>
        <h3>${c.daily ? '★ DIARIO — ' : ''}${c.text}</h3>
        <small>Mejor: ${fmtInt(c.progress)} / ${fmtInt(c.target)}</small>
        <p class="reward">${fmtCash(c.reward.cash)} ${c.reward.parts ? `· ${c.reward.parts}⚙` : ''} ${c.reward.rep ? `· ${c.reward.rep}★` : ''}</p>
      </div>`;
    const list = s.contracts.filter((c) => !c.done).map(render).join('');
    return `<h2>Contratos</h2>
            <p class="hint">Racha diaria: <b>${s.dailyStreak}</b> día(s) — la recompensa del diario crece hasta ×3 en 7 días.</p>
            <div class="grid">${list || '<p class="hint">No hay contratos activos.</p>'}</div>`;
  }

  // ── Legacy ──
  private tabLegacy(): string {
    const s = this.save;
    const points = legacyPointsFor(s.hypeTotal);
    const can = A.canPrestige(s);
    const nodes = LEGACY_NODES.map((n) => {
      const level = s.legacyNodes[n.id] ?? 0;
      const cost = legacyCost(n, level);
      return this.card(
        `${n.name} <small>${level}/${n.maxLevel}</small>`,
        n.desc,
        level >= n.maxLevel ? 'MAX' : `${cost} ◆`,
        level < n.maxLevel && s.legacy >= cost,
        'buylegacy',
        n.id,
        level / n.maxLevel,
      );
    }).join('');

    return `
      <h2>Legacy</h2>
      <div class="prestige">
        <p>Vender el imperio reinicia cash, sponsors, staff, salas y todos los autos menos el activo.
           Te quedás con los Legacy Points, los cosméticos y los récords.</p>
        <p>Hype acumulado: <b>${fmt(s.hypeTotal)}</b> / ${fmt(PRESTIGE_MIN_HYPE)}</p>
        <p>Ganarías: <b>${points} ◆</b> · Prestiges: ${s.prestigeCount}</p>
        <button data-act="prestige" ${can ? '' : 'disabled'}>${can ? 'VENDER EL IMPERIO' : 'TODAVÍA NO'}</button>
      </div>
      <div class="grid">${nodes}</div>`;
  }

  // ── Opciones ──
  private tabOptions(): string {
    const st = this.save.settings;
    const opt = (act: string, values: string[], current: string): string =>
      values.map((v) => `<button class="pill ${current === v ? 'on' : ''}" data-act="${act}" data-id="${v}">${v}</button>`).join('');
    return `
      <h2>Opciones</h2>
      <div class="paintrow"><h3>Asistencias</h3><div class="pills">${opt('assist', ['casual', 'standard', 'pro'], st.assistLevel)}</div>
        <small class="hint">Nunca son cero: el contravolante asistido siempre está activo.</small></div>
      <div class="paintrow"><h3>Calidad</h3><div class="pills">${opt('quality', ['low', 'medium', 'high', 'ultra'], st.quality)}</div></div>
      <div class="paintrow"><h3>Tráfico</h3><div class="pills">${opt('traffic', ['off', 'low', 'medium', 'high'], st.traffic)}</div></div>
      <div class="paintrow"><h3>Accesibilidad</h3><div class="pills">
        <button class="pill ${st.screenShake ? 'on' : ''}" data-act="shake">Screenshake</button>
        <button class="pill ${st.showAngleArc ? 'on' : ''}" data-act="arc">Arco de ángulo</button>
      </div></div>
      <div class="paintrow"><h3>Volumen</h3>
        <div class="slider"><label>Master<b>${Math.round(st.masterVolume * 100)}%</b></label>
          <input type="range" min="0" max="1" step="0.05" value="${st.masterVolume}" data-act="vol" data-id="master"></div>
        <div class="slider"><label>Música<b>${Math.round(st.musicVolume * 100)}%</b></label>
          <input type="range" min="0" max="1" step="0.05" value="${st.musicVolume}" data-act="vol" data-id="music"></div>
        <div class="slider"><label>Efectos<b>${Math.round(st.sfxVolume * 100)}%</b></label>
          <input type="range" min="0" max="1" step="0.05" value="${st.sfxVolume}" data-act="vol" data-id="sfx"></div>
      </div>
      <div class="paintrow"><h3>Guardado</h3>
        <div class="actions">
          <button data-act="export">COPIAR SAVE</button>
          <button class="ghost" data-act="import">IMPORTAR SAVE</button>
          <button class="danger" data-act="wipe">BORRAR TODO</button>
        </div>
        <small class="hint">Es la única forma de no perder el progreso si borrás el caché del navegador.</small>
      </div>`;
  }

  private card(
    title: string, body: string, price: string, afford: boolean,
    act: string, id: string, progress: number,
  ): string {
    return `
      <div class="card">
        <div class="bar"><i style="width:${clamp(progress, 0, 1) * 100}%"></i></div>
        <h3>${title}</h3>
        <p>${body}</p>
        <div class="actions">
          <button data-act="${act}" data-id="${id}" ${afford ? '' : 'disabled'}>${price}</button>
        </div>
      </div>`;
  }

  // ── Resultados ──
  private resultsHtml(): string {
    const r = this.lastResults;
    if (!r) return '';
    const { rewards, stats, contracts, levelUps } = r;
    const rows: [string, string][] = [
      ['Mejor combo', `×${stats.bestMultiplier.toFixed(2)}`],
      ['Drift más largo', `${stats.longestDrift.toFixed(1)} s`],
      ['Distancia driftada', `${Math.round(stats.driftDistance)} m`],
      ['Choques', String(stats.crashes)],
      ['Objetos destruidos', String(stats.cones)],
      ['Transiciones', String(stats.transitions)],
      ['Velocidad máxima', `${Math.round(stats.topSpeed)} km/h`],
    ];
    return `
      <div class="screen results">
        <h1>RUN COMPLETO</h1>
        <div class="bigscore">${fmtInt(rewards.score)}</div>
        <table>${rows.map(([k, v], i) => `<tr style="animation-delay:${i * 90}ms"><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
        <div class="rewards">
          <div style="animation-delay:700ms"><b>⚡ +${fmt(rewards.hype)}</b><span>HYPE</span></div>
          <div style="animation-delay:790ms"><b>$ +${fmt(rewards.cash)}</b><span>CASH</span></div>
          <div style="animation-delay:880ms"><b>+${fmt(rewards.xp)}</b><span>XP</span></div>
          <div style="animation-delay:970ms"><b>★ +${fmt(rewards.rep)}</b><span>REP</span></div>
        </div>
        ${levelUps > 0 ? `<p class="levelup">¡SUBISTE ${levelUps} NIVEL${levelUps > 1 ? 'ES' : ''}!</p>` : ''}
        ${contracts.length ? `<div class="contracts-done">${contracts.map((c) => `<p>✓ ${c}</p>`).join('')}</div>` : ''}
        <div class="actions big">
          <button data-act="drive">REPETIR</button>
          <button class="ghost" data-act="togarage">GARAGE</button>
        </div>
      </div>`;
  }

  private offlineHtml(): string {
    const d = this.offlineData!;
    return `
      <div class="screen modal">
        <h1>BIENVENIDO DE VUELTA</h1>
        <p>Estuviste <b>${fmtDuration(d.seconds)}</b> afuera.</p>
        <p>Tu garage siguió laburando:</p>
        <div class="bigscore">${fmtCash(d.cash)}</div>
        <div class="actions big">
          <button data-act="claim">COBRAR</button>
          <button data-act="claim2">COBRAR ×2 HACIENDO UN RUN</button>
        </div>
        <small class="hint">Sin anuncios. El ×2 se gana manejando.</small>
      </div>`;
  }

  private pauseHtml(): string {
    return `
      <div class="screen modal">
        <h1>PAUSA</h1>
        <div class="actions big column">
          <button data-act="resume">SEGUIR MANEJANDO</button>
          <button class="ghost" data-act="endrun">TERMINAR RUN</button>
          <button class="ghost" data-act="togarage">GARAGE</button>
        </div>
      </div>`;
  }

  // ─────────────────────────── eventos ───────────────────────────

  private onInput(e: Event): void {
    const el = e.target as HTMLInputElement;
    const act = el.dataset.act;
    if (!act) return;
    const s = this.save;
    if (act === 'setup') {
      const car = s.cars.find((c) => c.instanceId === s.activeCarInstanceId)!;
      car.setup[el.dataset.id!] = parseFloat(el.value);
      this.host.onCarChanged();
      this.host.markDirty();
      this.render();
    } else if (act === 'vol') {
      const v = parseFloat(el.value);
      if (el.dataset.id === 'master') s.settings.masterVolume = v;
      if (el.dataset.id === 'music') s.settings.musicVolume = v;
      if (el.dataset.id === 'sfx') s.settings.sfxVolume = v;
      this.host.onSettingsChanged();
      this.host.markDirty();
    }
  }

  private onClick(e: Event): void {
    const target = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!target || target.tagName === 'INPUT') return;
    const act = target.dataset.act!;
    const id = target.dataset.id ?? '';
    const s = this.save;
    let ok = true;
    let rerender = true;

    switch (act) {
      case 'tab':
        this.tab = id;
        break;
      case 'drive':
        audio.blip(720, 0.08, 'triangle', 0.2);
        this.hide();
        this.host.startRun('timed');
        return;
      case 'togarage':
        this.showGarage();
        return;
      case 'resume':
        this.hide();
        this.host.resumeRun();
        return;
      case 'endrun':
        this.hide();
        this.host.endRun();
        return;
      case 'claim':
        s.cash += this.offlineData?.cash ?? 0;
        audio.cash();
        this.showGarage();
        this.host.markDirty();
        return;
      case 'claim2':
        s.cash += (this.offlineData?.cash ?? 0) * 2;
        audio.cash(4);
        this.hide();
        this.host.startRun('timed');
        this.host.markDirty();
        return;

      case 'buyupgrade': {
        const idx = s.cars.findIndex((c) => c.instanceId === s.activeCarInstanceId);
        ok = A.buyUpgrade(s, idx, id);
        if (ok) this.host.onCarChanged();
        break;
      }
      case 'buysponsor': ok = A.buySponsor(s, id); break;
      case 'hire': ok = A.hireStaff(s, id); break;
      case 'fire': ok = A.fireStaff(s, id); break;
      case 'buyroom': ok = A.buyRoom(s, id); break;
      case 'buybay': ok = A.buyBay(s); break;
      case 'buycar':
        ok = A.buyCar(s, id);
        if (ok) this.toast(`¡${getCar(id).displayName} en el garage!`);
        break;
      case 'sell': ok = A.sellCar(s, id); if (ok) this.host.onCarChanged(); break;
      case 'select':
        s.activeCarInstanceId = id;
        this.host.onCarChanged();
        break;
      case 'buylegacy': ok = A.buyLegacy(s, id); break;
      case 'prestige':
        if (confirm('¿Vender el imperio? Perdés cash, sponsors, staff, salas y todos los autos menos el activo.')) {
          ok = A.prestige(s, s.activeCarInstanceId);
          if (ok) this.host.onCarChanged();
        } else ok = false;
        break;

      case 'setup-rec': {
        const car = s.cars.find((c) => c.instanceId === s.activeCarInstanceId)!;
        Object.assign(car.setup, SETUP_RECOMMENDED);
        this.host.onCarChanged();
        break;
      }
      case 'setup-def': {
        const car = s.cars.find((c) => c.instanceId === s.activeCarInstanceId)!;
        for (const p of SETUP_PARAMS) car.setup[p.id] = p.def;
        this.host.onCarChanged();
        break;
      }

      case 'paint': case 'wheel': case 'caliper': case 'neon': case 'smoke': case 'painttype': case 'kit': {
        const car = s.cars.find((c) => c.instanceId === s.activeCarInstanceId)!;
        const c = car.cosmetics;
        if (act === 'paint') c.paintColor = id;
        if (act === 'wheel') c.wheelColor = id;
        if (act === 'caliper') c.caliperColor = id;
        if (act === 'neon') c.neonColor = id === 'none' ? null : id;
        if (act === 'smoke') c.smokeColor = id === 'none' ? null : id;
        if (act === 'painttype') c.paintType = id as typeof c.paintType;
        if (act === 'kit') c.bodyKit = parseInt(id, 10);
        this.host.onCarChanged();
        break;
      }

      case 'assist': s.settings.assistLevel = id as 'casual'; this.host.onSettingsChanged(); break;
      case 'quality': s.settings.quality = id as 'low'; this.host.onSettingsChanged(); break;
      case 'traffic': s.settings.traffic = id as 'off'; this.host.onSettingsChanged(); break;
      case 'shake': s.settings.screenShake = !s.settings.screenShake; this.host.onSettingsChanged(); break;
      case 'arc': s.settings.showAngleArc = !s.settings.showAngleArc; this.host.onSettingsChanged(); break;

      case 'export':
        window.dispatchEvent(new CustomEvent('neon:export'));
        rerender = false;
        break;
      case 'import':
        window.dispatchEvent(new CustomEvent('neon:import'));
        rerender = false;
        break;
      case 'wipe':
        if (confirm('¿Borrar TODO el progreso? No hay vuelta atrás.')) {
          window.dispatchEvent(new CustomEvent('neon:wipe'));
        }
        rerender = false;
        break;
      default:
        rerender = false;
    }

    if (ok) {
      if (act.startsWith('buy') || act === 'hire') audio.cash(Math.random() * 4);
      else audio.blip(560, 0.05, 'sine', 0.14);
      this.host.markDirty();
    } else {
      audio.blip(180, 0.09, 'square', 0.12);
    }
    if (rerender && this.screen === 'garage') this.render();
  }

  refreshBonuses(): Bonuses {
    return computeBonuses(this.save);
  }

  playerProgress(): { level: number; frac: number } {
    const need = xpForLevel(this.save.playerLevel);
    return { level: this.save.playerLevel, frac: clamp(this.save.playerXp / need, 0, 1) };
  }
}
