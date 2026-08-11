import { audio } from '../audio/AudioEngine';
import { CARS, getCar } from '../data/cars';
import { SETUP_PARAMS, SETUP_RECOMMENDED, UPGRADES } from '../data/upgrades';
import { clamp, degrees } from '../lib/math';
import * as A from '../meta/Actions';
import { buildCar, carValue } from '../meta/CarBuild';
import { ASSIST_PAYOUT, carXpForLevel, computeBonuses, xpForLevel, type RunRewards } from '../meta/Economy';
import { getMap, isMapUnlocked, MAPS } from '../data/maps';
import { getRoute, isRouteUnlocked, ROUTES } from '../data/routes';
import type { ChallengeSave, SaveGame } from '../save/types';
import type { TrafficStats } from '../sim/Highway';
import type { RunStats } from '../sim/ScoreSystem';
import { fmt, fmtCash, fmtInt } from './format';

export interface UiHost {
  save: SaveGame;
  startRun(): void;
  onMapChanged(): void;
  onRouteChanged(): void;
  onModeChanged(): void;
  /** Foto renderizada del auto, o null si todavía no está lista. */
  carPreview(carId: string, paint?: string): string | null;
  resumeRun(): void;
  endRun(): void;
  onCarChanged(): void;
  onSettingsChanged(): void;
  markDirty(): void;
}

type Screen = 'hidden' | 'garage' | 'results' | 'trafficResults' | 'pause';

const PALETTE = [
  '#ff4d3a', '#ffb03a', '#ffe9c0', '#7fd4c1',
  '#3f7ea8', '#2b2f38', '#c9c2b4', '#8a4fa8',
  '#4f8a3a', '#d8456f', '#e8e4d8', '#5a5f6b',
];

export class GameUI {
  private root: HTMLElement;
  private host: UiHost;
  private screen: Screen = 'hidden';
  private tab = 'modes';
  private results: {
    rewards: RunRewards;
    stats: RunStats;
    challenges: string[];
    levelUps: number;
  } | null = null;
  private trafficResults: {
    rewards: RunRewards;
    stats: TrafficStats;
    levelUps: number;
  } | null = null;
  private toastTimer = 0;

  constructor(root: HTMLElement, host: UiHost) {
    this.root = root;
    this.host = host;
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('input', (e) => this.onInput(e));
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

  showResults(rewards: RunRewards, stats: RunStats, challenges: string[], levelUps: number): void {
    this.results = { rewards, stats, challenges, levelUps };
    this.screen = 'results';
    this.render();
  }

  showTrafficResults(rewards: RunRewards, stats: TrafficStats, levelUps: number): void {
    this.trafficResults = { rewards, stats, levelUps };
    this.screen = 'trafficResults';
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
      if (this.toastTimer <= 0) this.root.querySelector('.toast')?.classList.remove('show');
    }
  }

  // ─────────────────────────── render ───────────────────────────

  private render(): void {
    this.root.classList.toggle('active', this.screen !== 'hidden');
    switch (this.screen) {
      case 'garage': this.root.innerHTML = this.garageHtml(); break;
      case 'results': this.root.innerHTML = this.resultsHtml(); break;
      case 'trafficResults': this.root.innerHTML = this.trafficResultsHtml(); break;
      case 'pause': this.root.innerHTML = this.pauseHtml(); break;
      default: this.root.innerHTML = '';
    }
  }

  private topBar(): string {
    const s = this.save;
    const need = xpForLevel(s.playerLevel);
    const where = s.gameMode === 'traffic'
      ? getRoute(s.selectedRoute).name
      : getMap(s.selectedMap).name;
    return `
      <header class="topbar">
        <div class="currencies">
          <span class="cur cash">${fmtCash(s.cash)}</span>
          <span class="cur rep">★ ${fmt(s.rep)}</span>
          <span class="cur lvl">Nv.${s.playerLevel}
            <i style="--p:${clamp(s.playerXp / need, 0, 1) * 100}%"></i>
          </span>
        </div>
        <button class="drive" data-act="drive">
          MANEJAR<small>${s.gameMode === 'traffic' ? 'TRÁFICO' : 'DRIFT'} · ${where}</small>
        </button>
      </header>`;
  }

  private tabs(): string {
    const list: [string, string][] = [
      ['modes', 'Modo'],
      [this.save.gameMode === 'traffic' ? 'routes' : 'maps',
        this.save.gameMode === 'traffic' ? 'Rutas' : 'Circuitos'],
      ['cars', 'Autos'],
      ['upgrades', 'Mejoras'],
      ['setup', 'Setup'],
      ['paint', 'Pintura'],
      ['challenges', 'Desafíos'],
      ['records', 'Récords'],
      ['options', 'Opciones'],
    ];
    return `<nav class="tabs">${list
      .map(([id, label]) => `<button data-act="tab" data-id="${id}" class="${this.tab === id ? 'on' : ''}">${label}</button>`)
      .join('')}</nav>`;
  }

  private garageHtml(): string {
    let body = '';
    switch (this.tab) {
      case 'modes': body = this.tabModes(); break;
      case 'routes': body = this.tabRoutes(); break;
      case 'maps': body = this.tabMaps(); break;
      case 'cars': body = this.tabCars(); break;
      case 'upgrades': body = this.tabUpgrades(); break;
      case 'setup': body = this.tabSetup(); break;
      case 'paint': body = this.tabPaint(); break;
      case 'challenges': body = this.tabChallenges(); break;
      case 'records': body = this.tabRecords(); break;
      case 'options': body = this.tabOptions(); break;
    }
    return `<div class="screen garage">${this.topBar()}${this.tabs()}<div class="content">${body}</div></div>`;
  }

  // ── Autos ──
  private tabCars(): string {
    const s = this.save;
    const owned = s.cars.map((c) => {
      const def = getCar(c.id);
      const active = c.instanceId === s.activeCarInstanceId;
      const need = carXpForLevel(c.level);
      return `
        <div class="card car ${active ? 'active' : ''}" style="--paint:${c.cosmetics.paintColor}">
          ${this.shot(c.id, c.cosmetics.paintColor)}
          <h3>${def.displayName} <span class="tier t${def.tier}">${def.tier}</span></h3>
          <p class="blurb">${def.blurb}</p>
          <div class="bar"><i style="width:${clamp(c.xp / need, 0, 1) * 100}%"></i></div>
          <small>Nv.${c.level} · ${fmtInt(c.xp)}/${fmtInt(need)} XP · vale ${fmtCash(carValue(c))}</small>
          <div class="actions">
            ${active ? '<button disabled>EN USO</button>' : `<button data-act="select" data-id="${c.instanceId}">USAR</button>`}
            ${s.cars.length > 1 ? `<button class="ghost" data-act="sell" data-id="${c.instanceId}">VENDER</button>` : ''}
          </div>
        </div>`;
    }).join('');

    const shop = CARS.filter((d) => !s.cars.some((c) => c.id === d.id)).map((d) => {
      const check = A.carUnlock(s, d.id);
      const torque = Math.round(Math.max(...d.spec.torqueCurve.map((t) => t[1])));
      return `
        <div class="card car shop" style="--paint:${d.defaultPaint}">
          ${this.shot(d.id)}
          <h3>${d.displayName} <span class="tier t${d.tier}">${d.tier}</span></h3>
          <p class="blurb">${d.blurb}</p>
          <small>${Math.round(d.spec.mass)} kg · ${torque} N·m · ${degrees(d.spec.maxSteerAngle).toFixed(0)}° de ángulo</small>
          <div class="actions">
            <button data-act="buycar" data-id="${d.id}" ${check.ok ? '' : 'disabled'}>
              ${check.ok ? check.price : `${check.price} · ${check.reason}`}
            </button>
          </div>
        </div>`;
    }).join('');

    return `<h2>Tus autos</h2><div class="grid">${owned}</div>
            <h2>Concesionaria</h2>
            <p class="hint">Los dos autos de arriba de todo se abren con reputación (★), que solo se gana drifteando bien.</p>
            <div class="grid">${shop}</div>`;
  }

  /** Foto del auto; si todavía no se renderizó, cae en la barrita de color. */
  private shot(carId: string, paint?: string): string {
    const url = this.host.carPreview(carId, paint);
    return url
      ? `<img class="carshot" src="${url}" alt="" width="320" height="200">`
      : '<div class="carchip"></div>';
  }

  // ── Modo de juego ──
  private tabModes(): string {
    const s = this.save;
    const r = s.records;
    const card = (
      id: string, name: string, blurb: string, best: string, keys: string,
    ): string => `
      <div class="card map ${s.gameMode === id ? 'active' : ''}">
        <h3>${name}</h3>
        <p class="blurb">${blurb}</p>
        <small>${best}</small>
        <p class="hint">${keys}</p>
        <div class="actions">
          ${s.gameMode === id
            ? '<button disabled>ELEGIDO</button>'
            : `<button data-act="mode" data-id="${id}">JUGAR ESTE</button>`}
        </div>
      </div>`;

    return `<h2>Modo de juego</h2>
      <p class="hint">Los dos comparten garage, plata y reputación: el auto que mejorás sirve para los dos.</p>
      <div class="grid">
        ${card(
          'traffic', 'Tráfico',
          'Autopista infinita. Esquivás autos a toda velocidad y cobrás por pasar cerca; ' +
          'la mano contraria paga el doble. El run se termina cuando chocás fuerte.',
          r.bestTrafficScore
            ? `Mejor: ${fmtInt(r.bestTrafficScore)} pts · ${fmtInt(r.bestTrafficDistance)} m`
            : 'Sin correr todavía',
          'El auto va plantado: se maneja con reflejos, no peleándolo.',
        )}
        ${card(
          'drift', 'Drift',
          'Circuitos cerrados, 2 minutos por run. Encadenás derrapes y el combo multiplica ' +
          'todo lo que venís juntando.',
          r.bestScore ? `Mejor: ${fmtInt(r.bestScore)} pts · combo ×${r.bestCombo.toFixed(1)}` : 'Sin correr todavía',
          'ESPACIO es freno de mano: el tren trasero se suelta.',
        )}
      </div>`;
  }

  // ── Rutas del modo tráfico ──
  private tabRoutes(): string {
    const s = this.save;
    const cards = ROUTES.map((r) => {
      const unlocked = isRouteUnlocked(r, s.rep);
      const active = s.selectedRoute === r.id;
      const rec = s.trafficRecords[r.id];
      const stars = '●'.repeat(r.difficulty) + '○'.repeat(3 - r.difficulty);
      const lanes = `${r.cfg.lanes} carril${r.cfg.lanes > 1 ? 'es' : ''} por mano` +
        `${r.cfg.twoWay ? ' · doble mano' : ' · mano única'}`;
      return `
        <div class="card map ${active ? 'active' : ''} ${unlocked ? '' : 'locked'}">
          <div class="bar"><i style="width:${unlocked ? 100 : Math.min(100, (s.rep / r.repRequired) * 100)}%"></i></div>
          <h3>${r.name} <span class="diff">${stars}</span></h3>
          <p class="blurb">${r.blurb}</p>
          <small>${lanes} · tráfico a ${r.cfg.trafficKmh} km/h</small><br>
          <small>${rec
            ? `Mejor: ${fmtInt(rec.bestScore)} pts · ${fmtInt(rec.bestDistance)} m · ${fmtCash(rec.bestCash)}`
            : 'Sin correr todavía'}</small>
          <div class="actions">
            ${unlocked
              ? active
                ? '<button disabled>ELEGIDA</button>'
                : `<button data-act="selectroute" data-id="${r.id}">ELEGIR</button>`
              : `<button disabled>🔒 ${r.repRequired} ★ — te faltan ${r.repRequired - s.rep}</button>`}
          </div>
        </div>`;
    }).join('');
    return `<h2>Rutas</h2>
            <p class="hint">Se abren con reputación (★). Tenés ${fmt(s.rep)} ★.</p>
            <div class="grid">${cards}</div>`;
  }

  // ── Circuitos ──
  private tabMaps(): string {
    const s = this.save;
    const cards = MAPS.map((m) => {
      const unlocked = isMapUnlocked(m, s.rep);
      const active = s.selectedMap === m.id;
      const rec = s.mapRecords[m.id];
      const stars = '●'.repeat(m.difficulty) + '○'.repeat(3 - m.difficulty);
      return `
        <div class="card map ${active ? 'active' : ''} ${unlocked ? '' : 'locked'}">
          <div class="bar"><i style="width:${unlocked ? 100 : Math.min(100, (s.rep / m.repRequired) * 100)}%"></i></div>
          <h3>${m.name} <span class="diff">${stars}</span></h3>
          <p class="blurb">${m.blurb}</p>
          <small>${rec ? `Mejor: ${fmtInt(rec.bestScore)} pts · ${fmtCash(rec.bestCash)} · ${rec.runs} runs` : 'Sin correr todavía'}</small>
          <div class="actions">
            ${unlocked
              ? active
                ? '<button disabled>ELEGIDO</button>'
                : `<button data-act="selectmap" data-id="${m.id}">ELEGIR</button>`
              : `<button disabled>🔒 ${m.repRequired} ★ — te faltan ${m.repRequired - s.rep}</button>`}
          </div>
        </div>`;
    }).join('');
    return `<h2>Circuitos</h2>
            <p class="hint">Se abren con reputación (★), que se gana drifteando. Tenés ${fmt(s.rep)} ★.</p>
            <div class="grid">${cards}</div>`;
  }

  // ── Mejoras ──
  private tabUpgrades(): string {
    const s = this.save;
    const idx = s.cars.findIndex((c) => c.instanceId === s.activeCarInstanceId);
    const car = s.cars[idx];
    const def = getCar(car.id);
    const items = UPGRADES.map((u) => {
      const level = car.upgrades[u.id] ?? 0;
      const price = A.upgradePrice(s, idx, u.id);
      const label = price === null ? 'MAX' : fmtCash(price);
      const afford = price !== null && s.cash >= price;
      const next = level < u.maxLevel
        ? `${u.readout(level)} → <b>${u.readout(level + 1)}</b>`
        : u.readout(level);
      return `
        <div class="card">
          <div class="bar"><i style="width:${(level / u.maxLevel) * 100}%"></i></div>
          <h3>${u.name} <small>${level}/${u.maxLevel}</small></h3>
          <p>${u.desc}<br>${next}</p>
          <div class="actions">
            <button data-act="buyupgrade" data-id="${u.id}" ${afford ? '' : 'disabled'}>${label}</button>
          </div>
        </div>`;
    }).join('');
    return `<h2>Mejoras — ${def.displayName}</h2>
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
        ${this.meter('ESTABILIDAD', stability, 'var(--c1)')}
        ${this.meter('ÁNGULO', angle, 'var(--c2)')}
        ${this.meter('ACELERACIÓN', accel, 'var(--c3)')}
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
    const car = this.save.cars.find((c) => c.instanceId === this.save.activeCarInstanceId)!;
    const c = car.cosmetics;
    const swatches = (act: string, current: string): string =>
      PALETTE.map((p) => `<button class="swatch ${p === current ? 'on' : ''}" style="background:${p}" data-act="${act}" data-id="${p}"></button>`).join('');
    const types = ['gloss', 'matte', 'metallic', 'pearl', 'chrome']
      .map((t) => `<button class="pill ${c.paintType === t ? 'on' : ''}" data-act="painttype" data-id="${t}">${t}</button>`)
      .join('');
    const kits = ['Stock', 'Street', 'Widebody']
      .map((k, i) => `<button class="pill ${c.bodyKit === i ? 'on' : ''}" data-act="kit" data-id="${i}">${k}</button>`)
      .join('');

    return `
      <h2>Pintura</h2>
      <div class="paintrow"><h3>Color</h3><div class="swatches">${swatches('paint', c.paintColor)}</div></div>
      <div class="paintrow"><h3>Acabado</h3><div class="pills">${types}</div></div>
      <div class="paintrow"><h3>Llantas</h3><div class="swatches">${swatches('wheel', c.wheelColor)}</div></div>
      <div class="paintrow"><h3>Pinzas de freno</h3><div class="swatches">${swatches('caliper', c.caliperColor)}</div></div>
      <div class="paintrow"><h3>Kit de carrocería</h3><div class="pills">${kits}</div>
        <small class="hint">El widebody ensancha la vía de verdad: +0.12 m, más estable.</small></div>
      <div class="paintrow"><h3>Humo de color</h3>
        <div class="swatches">
          <button class="swatch off ${c.smokeColor ? '' : 'on'}" data-act="smoke" data-id="none">✕</button>
          ${swatches('smoke', c.smokeColor ?? '')}
        </div></div>`;
  }

  // ── Desafíos ──
  private tabChallenges(): string {
    const s = this.save;
    const render = (c: ChallengeSave): string => `
      <div class="card challenge ${c.daily ? 'daily' : ''}">
        <div class="bar"><i style="width:${clamp(c.progress / c.target, 0, 1) * 100}%"></i></div>
        <h3>${c.daily ? '★ DIARIO — ' : ''}${c.text}</h3>
        <small>Mejor: ${fmtInt(c.progress)} / ${fmtInt(c.target)}</small>
        <p class="reward">${fmtCash(c.reward.cash)}${c.reward.rep ? ` · ${c.reward.rep} ★` : ''}</p>
      </div>`;
    const list = s.challenges.filter((c) => !c.done).map(render).join('');
    return `<h2>Desafíos</h2>
            <p class="hint">Pagan plata extra. Si no los hacés no perdés nada: no hay castigo por no entrar.</p>
            <div class="grid">${list || '<p class="hint">No hay desafíos activos.</p>'}</div>`;
  }

  // ── Récords ──
  private tabRecords(): string {
    const r = this.save.records;
    const drift: [string, string][] = [
      ['Mejor score', fmtInt(r.bestScore)],
      ['Mejor combo', `×${r.bestCombo.toFixed(2)}`],
      ['Drift más largo', `${r.longestDrift.toFixed(1)} s`],
      ['Distancia driftada', `${fmtInt(r.totalDriftDistance)} m`],
    ];
    const traffic: [string, string][] = [
      ['Mejor score', fmtInt(r.bestTrafficScore)],
      ['Distancia más larga', `${fmtInt(r.bestTrafficDistance)} m`],
      ['Autos pasados', fmtInt(r.totalOvertakes)],
      ['Pasadas al ras', fmtInt(r.totalNearMisses)],
    ];
    const common: [string, string][] = [
      ['Mejor run pagado', fmtCash(r.bestCashRun)],
      ['Plata total ganada', fmtCash(r.totalCashEarned)],
      ['Runs jugados', fmtInt(r.totalRuns)],
      ['Choques', fmtInt(r.totalCrashes)],
    ];
    const table = (rows: [string, string][]): string =>
      `<table class="records">${rows
        .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
        .join('')}</table>`;
    return `<h2>Récords</h2>
      <h3>Tráfico</h3>${table(traffic)}
      <h3>Drift</h3>${table(drift)}
      <h3>General</h3>${table(common)}`;
  }

  // ── Opciones ──
  private tabOptions(): string {
    const st = this.save.settings;
    const opt = (act: string, values: string[], current: string): string =>
      values.map((v) => `<button class="pill ${current === v ? 'on' : ''}" data-act="${act}" data-id="${v}">${v}</button>`).join('');
    const payout = ASSIST_PAYOUT[st.assistLevel];
    return `
      <h2>Opciones</h2>
      <div class="paintrow"><h3>Asistencias</h3><div class="pills">${opt('assist', ['casual', 'standard', 'pro'], st.assistLevel)}</div>
        <small class="hint">Manejar con menos ayuda paga más: ahora estás en <b>${payout.label}</b>.
        Nunca son cero — el contravolante asistido siempre está activo.</small></div>
      <div class="paintrow"><h3>Calidad</h3><div class="pills">${opt('quality', ['low', 'medium', 'high', 'ultra'], st.quality)}</div></div>
      <div class="paintrow"><h3>Tráfico</h3><div class="pills">${opt('traffic', ['off', 'low', 'medium', 'high'], st.traffic)}</div></div>
      <div class="paintrow"><h3>Accesibilidad</h3><div class="pills">
        <button class="pill ${st.screenShake ? 'on' : ''}" data-act="shake">Sacudida de cámara</button>
        <button class="pill ${st.showAngleArc ? 'on' : ''}" data-act="arc">Medidor de ángulo</button>
      </div></div>
      <div class="paintrow"><h3>Volumen</h3>
        <div class="slider"><label>General<b>${Math.round(st.masterVolume * 100)}%</b></label>
          <input type="range" min="0" max="1" step="0.05" value="${st.masterVolume}" data-act="vol" data-id="master"></div>
        <div class="slider"><label>Música<b>${Math.round(st.musicVolume * 100)}%</b></label>
          <input type="range" min="0" max="1" step="0.05" value="${st.musicVolume}" data-act="vol" data-id="music"></div>
        <div class="slider"><label>Motor y efectos<b>${Math.round(st.sfxVolume * 100)}%</b></label>
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

  // ── Resultados ──
  private resultsHtml(): string {
    const r = this.results;
    if (!r) return '';
    const { rewards, stats, challenges, levelUps } = r;

    // El desglose de estilo es el corazón de la pantalla: muestra exactamente
    // por qué te pagaron lo que te pagaron.
    const style = rewards.styleParts.map((p, i) => `
      <tr style="animation-delay:${300 + i * 70}ms">
        <td>${p.label}</td>
        <td class="${p.value >= 0 ? 'plus' : 'minus'}">${p.value >= 0 ? '+' : ''}${Math.round(p.value * 100)}%</td>
      </tr>`).join('');

    const rows: [string, string][] = [
      ['Mejor combo', `×${stats.bestMultiplier.toFixed(2)}`],
      ['Drift más largo', `${stats.longestDrift.toFixed(1)} s`],
      ['Distancia driftada', `${Math.round(stats.driftDistance)} m`],
      ['Velocidad máxima', `${Math.round(stats.topSpeed)} km/h`],
    ];

    return `
      <div class="screen results">
        <h1>RUN TERMINADO</h1>
        <div class="bigscore">${fmtInt(rewards.score)}<span>puntos</span></div>

        <div class="payout">
          <div class="payline"><span>Base</span><b>${fmtCash(Math.floor(rewards.score * 0.045))}</b></div>
          <table class="stylebreak">${style}</table>
          <div class="payline total">
            <span>Estilo ×${rewards.style.toFixed(2)}</span>
            <b class="cash">${fmtCash(rewards.cash)}</b>
          </div>
        </div>

        <table class="summary-table">${rows
          .map(([k, v], i) => `<tr style="animation-delay:${i * 70}ms"><td>${k}</td><td>${v}</td></tr>`)
          .join('')}</table>

        <div class="rewards">
          <div style="animation-delay:700ms"><b>${fmtCash(rewards.cash)}</b><span>PLATA</span></div>
          <div style="animation-delay:780ms"><b>★ ${fmt(rewards.rep)}</b><span>REPUTACIÓN</span></div>
          <div style="animation-delay:860ms"><b>${fmt(rewards.xp)}</b><span>XP</span></div>
        </div>

        ${levelUps > 0 ? `<p class="levelup">¡SUBISTE ${levelUps} NIVEL${levelUps > 1 ? 'ES' : ''}!</p>` : ''}
        ${challenges.length ? `<div class="challenges-done">${challenges.map((c) => `<p>✓ ${c}</p>`).join('')}</div>` : ''}

        <div class="actions big">
          <button data-act="drive">OTRA VUELTA</button>
          <button class="ghost" data-act="togarage">GARAGE</button>
        </div>
      </div>`;
  }

  // ── Resultados de tráfico ──
  private trafficResultsHtml(): string {
    const r = this.trafficResults;
    if (!r) return '';
    const { rewards, stats, levelUps } = r;

    const style = rewards.styleParts.map((p, i) => `
      <tr style="animation-delay:${300 + i * 70}ms">
        <td>${p.label}</td>
        <td class="${p.value >= 0 ? 'plus' : 'minus'}">${p.value >= 0 ? '+' : ''}${Math.round(p.value * 100)}%</td>
      </tr>`).join('');

    const rows: [string, string][] = [
      ['Distancia', stats.distance >= 1000
        ? `${(stats.distance / 1000).toFixed(2)} km`
        : `${Math.round(stats.distance)} m`],
      ['Autos pasados', fmtInt(stats.overtakes)],
      ['Pasadas al ras', fmtInt(stats.nearMisses)],
      ['Mejor combo', `×${stats.bestCombo.toFixed(1)}`],
      ['Contramano', `${stats.oncomingTime.toFixed(1)} s`],
      ['Velocidad máxima', `${Math.round(stats.topSpeed)} km/h`],
    ];

    return `
      <div class="screen results">
        <h1>${stats.crashed ? 'CHOCASTE' : 'RUN TERMINADO'}</h1>
        <div class="bigscore">${fmtInt(rewards.score)}<span>puntos</span></div>

        <div class="payout">
          <div class="payline"><span>Base</span><b>${fmtCash(Math.floor(rewards.score * 0.12))}</b></div>
          <table class="stylebreak">${style}</table>
          <div class="payline total">
            <span>Estilo ×${rewards.style.toFixed(2)}</span>
            <b class="cash">${fmtCash(rewards.cash)}</b>
          </div>
        </div>

        <table class="summary-table">${rows
          .map(([k, v], i) => `<tr style="animation-delay:${i * 70}ms"><td>${k}</td><td>${v}</td></tr>`)
          .join('')}</table>

        <div class="rewards">
          <div style="animation-delay:700ms"><b>${fmtCash(rewards.cash)}</b><span>PLATA</span></div>
          <div style="animation-delay:780ms"><b>★ ${fmt(rewards.rep)}</b><span>REPUTACIÓN</span></div>
          <div style="animation-delay:860ms"><b>${fmt(rewards.xp)}</b><span>XP</span></div>
        </div>

        ${levelUps > 0 ? `<p class="levelup">¡SUBISTE ${levelUps} NIVEL${levelUps > 1 ? 'ES' : ''}!</p>` : ''}

        <div class="actions big">
          <button data-act="drive">OTRA VUELTA</button>
          <button class="ghost" data-act="togarage">GARAGE</button>
        </div>
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
      const label = el.previousElementSibling?.querySelector('b');
      if (label) label.textContent = `${Math.round(v * 100)}%`;
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
      case 'tab': this.tab = id; break;
      case 'drive':
        audio.click();
        this.hide();
        this.host.startRun();
        return;
      case 'togarage': this.showGarage(); return;
      case 'resume': this.hide(); this.host.resumeRun(); return;
      case 'endrun': this.hide(); this.host.endRun(); return;

      case 'buyupgrade': {
        const idx = s.cars.findIndex((c) => c.instanceId === s.activeCarInstanceId);
        ok = A.buyUpgrade(s, idx, id);
        if (ok) this.host.onCarChanged();
        break;
      }
      case 'buycar':
        ok = A.buyCar(s, id);
        if (ok) this.toast(`¡${getCar(id).displayName} en el garage!`);
        break;
      case 'sell': ok = A.sellCar(s, id); if (ok) this.host.onCarChanged(); break;
      case 'select': ok = A.selectCar(s, id); if (ok) this.host.onCarChanged(); break;
      case 'selectmap': {
        const entry = getMap(id);
        ok = isMapUnlocked(entry, s.rep);
        if (ok) {
          s.selectedMap = id;
          this.host.onMapChanged();
          this.toast(`Circuito: ${entry.name}`);
        }
        break;
      }
      case 'selectroute': {
        const entry = getRoute(id);
        ok = isRouteUnlocked(entry, s.rep);
        if (ok) {
          s.selectedRoute = id;
          this.host.onRouteChanged();
          this.toast(`Ruta: ${entry.name}`);
        }
        break;
      }
      case 'mode':
        s.gameMode = id === 'drift' ? 'drift' : 'traffic';
        this.host.onModeChanged();
        this.toast(s.gameMode === 'traffic' ? 'Modo tráfico' : 'Modo drift');
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

      case 'paint': case 'wheel': case 'caliper': case 'smoke': case 'painttype': case 'kit': {
        const car = s.cars.find((c) => c.instanceId === s.activeCarInstanceId)!;
        const c = car.cosmetics;
        if (act === 'paint') c.paintColor = id;
        if (act === 'wheel') c.wheelColor = id;
        if (act === 'caliper') c.caliperColor = id;
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

      case 'export': window.dispatchEvent(new CustomEvent('neon:export')); rerender = false; break;
      case 'import': window.dispatchEvent(new CustomEvent('neon:import')); rerender = false; break;
      case 'wipe':
        if (confirm('¿Borrar TODO el progreso? No hay vuelta atrás.')) {
          window.dispatchEvent(new CustomEvent('neon:wipe'));
        }
        rerender = false;
        break;
      default: rerender = false;
    }

    if (ok) {
      if (act.startsWith('buy')) audio.cash();
      else audio.click();
      this.host.markDirty();
    } else {
      audio.click(false);
    }
    if (rerender && this.screen === 'garage') this.render();
  }
}
