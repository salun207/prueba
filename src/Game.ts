import * as THREE from 'three';
import { audio } from './audio/AudioEngine';
import { bus } from './core/EventBus';
import { getMap, isMapUnlocked, MAPS } from './data/maps';
import { InputManager } from './input/InputManager';
import { clamp, DEG } from './lib/math';
import { buildCar, type BuiltCar } from './meta/CarBuild';
import { ensureChallenges, evaluateChallenges } from './meta/Challenges';
import {
  applyXp, carXpForLevel, computeBonuses, runRewards, styleMultiplier, CASH_RATE,
  type Bonuses,
} from './meta/Economy';
import { CAMERAS } from './render/CameraRig';
import { CarView } from './render/CarView';
import { renderCarPreview, warmCarPreviews } from './render/CarPreview';
import { QUALITY, Renderer } from './render/Renderer';
import { smokeTexture, radialTexture } from './render/Textures';
import { FloatingText } from './render/vfx/FloatingText';
import { Particles } from './render/vfx/Particles';
import { TireMarks } from './render/vfx/TireMarks';
import { WorldView } from './render/WorldView';
import { SaveManager } from './save/SaveManager';
import { resolveCollisions } from './sim/Collision';
import { stepCar, type PhysicsContext } from './sim/CarPhysics';
import { ScoreSystem } from './sim/ScoreSystem';
import { Traffic } from './sim/Traffic';
import { createCarState, resetCarState, type CarState } from './sim/types';
import { SimWorld } from './sim/World';
import { Hud } from './ui/Hud';
import { GameUI, type UiHost } from './ui/Screens';

const PHYSICS_DT = 1 / 120;
const RUN_DURATION = 120;

export class Game implements UiHost {
  private renderer: Renderer;
  private world: SimWorld;
  private worldView: WorldView;
  private carState: CarState = createCarState();
  private carView!: CarView;
  private built!: BuiltCar;
  private bonuses: Bonuses;
  private input: InputManager;
  private hud: Hud;
  private ui: GameUI;
  private saves: SaveManager;
  private score = new ScoreSystem();
  private traffic: Traffic;

  private smoke: Particles;
  private sparks: Particles;
  private floating: FloatingText;
  private marks: TireMarks;
  private coach: HTMLElement;
  private trafficMeshes: THREE.InstancedMesh | null = null;

  private accumulator = 0;
  private time = 0;
  private lastFrame = 0;
  private running = false;
  private paused = false;
  private timeLeft = RUN_DURATION;
  private coachTimer = -1;
  private coachStep = 0;
  private smokeColor = new THREE.Color(0xe8dccb);
  private dummy = new THREE.Object3D();

  constructor(gameCanvas: HTMLCanvasElement, hudCanvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.saves = new SaveManager();
    this.bonuses = computeBonuses(this.saves.data);

    this.renderer = new Renderer(gameCanvas);
    const entry = getMap(this.saves.data.selectedMap);
    const mapDef = entry.build();
    this.world = new SimWorld(mapDef);
    this.worldView = new WorldView(mapDef);
    this.renderer.scene.add(this.worldView.group);

    // La cámara consulta el mundo para no meterse en las paredes.
    this.renderer.rig.probe = (x, z) => this.world.nearestWallDistance(x, z, 6);

    this.traffic = new Traffic(mapDef.lanes, entry.traffic ? this.saves.data.settings.traffic : 'off');
    this.buildTrafficView();

    const q = QUALITY[this.saves.data.settings.quality];
    this.smoke = new Particles({
      count: q.smoke, life: 1.5, sizeStart: 0.35, sizeEnd: 2.4,
      gravity: 0.5, drag: 2.1, opacity: 0.17, additive: false, map: smokeTexture(),
    });
    this.sparks = new Particles({
      count: 256, life: 0.55, sizeStart: 0.22, sizeEnd: 0.04,
      gravity: -9, drag: 0.6, opacity: 1, additive: true, map: radialTexture(),
    });
    this.marks = new TireMarks(q.marks);
    this.floating = new FloatingText(8);
    this.renderer.scene.add(this.smoke.points, this.sparks.points, this.marks.mesh, this.floating.group);

    this.input = new InputManager(document.body);
    this.hud = new Hud(hudCanvas);
    this.hud.setMap(mapDef);
    this.ui = new GameUI(uiRoot, this);

    this.coach = document.createElement('div');
    this.coach.id = 'coach';
    document.getElementById('app')!.appendChild(this.coach);

    this.rebuildCar();
    this.applySettings();
    this.wireEvents();
    ensureChallenges(this.saves.data);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    // Las fotos de los autos se renderizan una vez, con el renderer ya listo.
    warmCarPreviews(this.renderer.renderer);
    this.ui.showGarage();

    this.lastFrame = performance.now();
    requestAnimationFrame(this.frame);
  }

  get save() {
    return this.saves.data;
  }

  // ─────────────────────────── setup ───────────────────────────

  private buildTrafficView(): void {
    if (this.trafficMeshes) {
      this.renderer.scene.remove(this.trafficMeshes);
      this.trafficMeshes = null;
    }
    if (this.traffic.cars.length === 0) return;
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      this.traffic.cars.length,
    );
    mesh.castShadow = true;
    const c = new THREE.Color();
    const palette = [0xb0503c, 0x4a6f9a, 0x8a857e, 0xc9c2b4, 0x3f7a68];
    this.traffic.cars.forEach((t, i) => {
      c.setHex(palette[Math.floor(t.colorSeed * palette.length) % palette.length]);
      mesh.setColorAt(i, c);
    });
    this.trafficMeshes = mesh;
    this.renderer.scene.add(mesh);
  }

  private rebuildCar(): void {
    const carSave = this.saves.activeCar;
    this.bonuses = computeBonuses(this.saves.data);
    this.built = buildCar(carSave, this.bonuses);

    if (this.carView) {
      this.renderer.scene.remove(this.carView.group, this.carView.shadowMesh);
    }
    this.carView = new CarView(this.built.def.body, carSave.cosmetics);
    this.renderer.scene.add(this.carView.group, this.carView.shadowMesh);

    this.smokeColor.set(carSave.cosmetics.smokeColor ?? '#e8dccb');
    audio.setCar(this.built.def);
    this.score.extraMultiplier = this.bonuses.extraMultiplier;
    this.score.tierSpeed = this.bonuses.tierSpeed;
  }

  private applySettings(): void {
    const st = this.saves.data.settings;
    this.renderer.setQuality(st.quality);
    this.renderer.rig.shakeEnabled = st.screenShake;
    this.renderer.rig.config = CAMERAS[clamp(st.camera, 0, CAMERAS.length - 1)];
    this.hud.showAngleArc = st.showAngleArc;
    audio.setVolumes(st.masterVolume, st.musicVolume, st.sfxVolume);
    this.bonuses = computeBonuses(this.saves.data);
  }

  private wireEvents(): void {
    bus.on('drift:tier', (e) => {
      this.hud.onTier(e.tier);
      audio.tier(e.tier);
      if (e.label) {
        this.floating.show(e.label, `×${e.mult.toFixed(1)}`, '#ffb03a',
          this.carState.posX, 2.6, this.carState.posZ, 0.9);
      }
    });
    bus.on('drift:bank', (e) => {
      this.hud.onBank();
      audio.bank(e.mult);
      this.renderer.post.flash = Math.min(0.4, 0.1 + e.mult * 0.025);
      const cash = Math.floor(e.points * CASH_RATE * this.bonuses.cashBonus);
      this.floating.show(`+$${cash.toLocaleString('es-AR')}`, '', '#ffd98a', e.x, 3.2, e.z, 0.95);
      if (e.mult > 4) this.renderer.rig.addTrauma(0.12);
    });
    bus.on('drift:lost', () => audio.lost());
    bus.on('bonus', (e) => {
      audio.pickup();
      this.floating.show(e.label, `+${e.points}`, '#ffe9c0', e.x, 2.2, e.z, 0.62);
    });
    bus.on('collision', (e) => {
      audio.impact(e.severity);
      this.renderer.rig.addTrauma(clamp(e.impulse / 20, 0.04, 0.7));
      const n = e.severity === 'scrape' ? 8 : e.severity === 'hit' ? 16 : 30;
      for (let i = 0; i < n; i++) {
        this.sparks.spawn(
          e.x + e.nx * 1.2, 0.5 + Math.random() * 0.4, e.z + e.nz * 1.2,
          e.nx * 6 + (Math.random() - 0.5) * 7,
          2 + Math.random() * 4,
          e.nz * 6 + (Math.random() - 0.5) * 7,
          1, 0.72, 0.3,
        );
      }
    });

    window.addEventListener('neon:export', () => {
      const text = this.saves.exportSave();
      navigator.clipboard?.writeText(text).then(
        () => this.ui.toast('Save copiado al portapapeles'),
        () => window.prompt('Copiá este texto:', text),
      );
    });
    window.addEventListener('neon:import', () => {
      const text = window.prompt('Pegá el save exportado:');
      if (!text) return;
      if (this.saves.importSave(text)) {
        this.rebuildCar();
        this.applySettings();
        this.ui.showGarage();
        this.ui.toast('Save importado');
      } else {
        this.ui.toast('Save inválido');
      }
    });
    window.addEventListener('neon:wipe', () => {
      this.saves.reset();
      this.rebuildCar();
      this.applySettings();
      this.ui.showGarage();
    });

    const startAudio = (): void => {
      audio.start();
      audio.setCar(this.built.def);
      this.applySettings();
    };
    window.addEventListener('pointerdown', startAudio, { once: true });
    window.addEventListener('keydown', startAudio, { once: true });
    document.addEventListener('visibilitychange', () => {
      audio.setMuted(document.hidden);
      if (document.hidden) this.saves.flush();
    });
  }

  private resize(): void {
    this.renderer.resize();
    this.hud.resize();
  }

  // ─────────────────────────── UiHost ───────────────────────────

  startRun(): void {
    this.timeLeft = RUN_DURATION;
    this.running = true;
    this.paused = false;
    this.rebuildCar();

    const spawn = this.world.def.spawn;
    resetCarState(this.carState, spawn.x, spawn.z, spawn.yaw);
    this.carState.velZ = 14; // arrancás andando, no parado
    this.score.reset(this.carState);
    this.world.resetDestructibles();
    this.world.resetHeat();
    for (let i = 0; i < this.world.destructibles.length; i++) {
      this.worldView.setDestructibleVisible(i, true, this.world.def);
    }
    this.marks.clear();
    this.smoke.clear();
    this.renderer.rig.reset(this.carState);
    this.input.enabled = true;

    if (!this.saves.data.tutorialDone) {
      this.coachTimer = 0;
      this.coachStep = 0;
    }
  }

  resumeRun(): void {
    this.paused = false;
    this.input.enabled = true;
  }

  endRun(): void {
    if (!this.running) {
      this.ui.showGarage();
      return;
    }
    this.running = false;
    this.paused = false;
    this.input.enabled = false;
    this.score.bank(this.carState);

    const save = this.saves.data;
    const stats = this.score.stats;
    const rewards = runRewards(stats, this.bonuses);
    // El escape paga un extra sobre el run entero.
    const extra = Math.floor(rewards.cash * this.built.mods.cashBonus);
    rewards.cash += extra;

    save.cash += rewards.cash;
    save.rep += rewards.rep;
    save.runsPlayed++;
    save.records.bestScore = Math.max(save.records.bestScore, stats.score);
    save.records.bestCombo = Math.max(save.records.bestCombo, stats.bestMultiplier);
    save.records.longestDrift = Math.max(save.records.longestDrift, stats.longestDrift);
    save.records.bestCashRun = Math.max(save.records.bestCashRun, rewards.cash);
    save.records.totalCashEarned += rewards.cash;
    save.records.totalRuns++;
    save.records.totalCrashes += stats.crashes;
    save.records.totalDriftDistance += stats.driftDistance;
    save.tutorialDone = true;

    const mapId = save.selectedMap;
    const rec = (save.mapRecords[mapId] ??= { bestScore: 0, bestCash: 0, runs: 0 });
    rec.bestScore = Math.max(rec.bestScore, stats.score);
    rec.bestCash = Math.max(rec.bestCash, rewards.cash);
    rec.runs++;

    // ¿Se abrió un circuito nuevo con esta reputación?
    const justUnlocked = MAPS.filter(
      (m) => m.repRequired > 0 && save.rep >= m.repRequired && save.rep - rewards.rep < m.repRequired,
    );

    const levelUps = applyXp(save, rewards.xp);

    const car = this.saves.activeCar;
    car.xp += rewards.xp;
    while (car.level < 30 && car.xp >= carXpForLevel(car.level)) {
      car.xp -= carXpForLevel(car.level);
      car.level++;
    }

    const results = evaluateChallenges(save, stats, this.bonuses.repBonus);
    const done = results.filter((r) => r.completed).map((r) => r.challenge.text);
    ensureChallenges(save);

    this.saves.markDirty();
    this.saves.flush();
    this.setCoach('');
    this.ui.showResults(rewards, stats, done, levelUps);
    for (const m of justUnlocked) this.ui.toast(`¡Circuito nuevo: ${m.name}!`);
  }

  onCarChanged(): void {
    this.rebuildCar();
    this.saves.markDirty();
  }

  carPreview(carId: string, paint?: string): string | null {
    try {
      return renderCarPreview(this.renderer.renderer, carId, paint);
    } catch {
      return null;
    }
  }

  /** Cambiar de circuito reconstruye el mundo entero. */
  onMapChanged(): void {
    const entry = getMap(this.saves.data.selectedMap);
    if (!isMapUnlocked(entry, this.saves.data.rep)) return;

    const def = entry.build();
    this.renderer.scene.remove(this.worldView.group);
    this.worldView.dispose();

    this.world = new SimWorld(def);
    this.worldView = new WorldView(def);
    this.renderer.scene.add(this.worldView.group);
    this.renderer.rig.probe = (x, z) => this.world.nearestWallDistance(x, z, 6);

    this.traffic = new Traffic(def.lanes, entry.traffic ? this.saves.data.settings.traffic : 'off');
    this.buildTrafficView();
    this.hud.setMap(def);
    this.marks.clear();
    this.smoke.clear();
    this.saves.markDirty();
  }

  onSettingsChanged(): void {
    this.applySettings();
    const entry = getMap(this.saves.data.selectedMap);
    this.traffic = new Traffic(
      this.world.def.lanes,
      entry.traffic ? this.saves.data.settings.traffic : 'off',
    );
    this.buildTrafficView();
    this.saves.markDirty();
  }

  markDirty(): void {
    this.saves.markDirty();
  }

  // ─────────────────────────── loop ───────────────────────────

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const rawDelta = Math.min((now - this.lastFrame) / 1000, 0.25);
    this.lastFrame = now;
    this.time += rawDelta;

    this.saves.update(rawDelta);
    this.ui.update(rawDelta);

    if (this.input.consumePause() && this.running) {
      if (this.paused) {
        this.resumeRun();
        this.ui.hide();
      } else {
        this.paused = true;
        this.input.enabled = false;
        this.ui.showPause();
      }
    }

    const simulating = this.running && !this.paused && !this.ui.visible;
    this.input.update(rawDelta);

    if (simulating) {
      this.accumulator += rawDelta;
      let steps = 0;
      while (this.accumulator >= PHYSICS_DT && steps < 8) {
        this.stepSim(PHYSICS_DT);
        this.accumulator -= PHYSICS_DT;
        steps++;
      }
      if (steps >= 8) this.accumulator = 0;

      this.timeLeft -= rawDelta;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.endRun();
      }
      this.updateCoach(rawDelta);
    }

    this.updateVisuals(rawDelta);
    audio.updateMusic();

    this.renderer.render(
      this.time, rawDelta,
      this.carState.posX, this.carState.posZ,
      this.carState.speed,
    );

    if (this.running && !this.ui.visible) {
      this.hud.draw(this.hudModel(), this.score, this.carState, rawDelta);
    } else {
      this.hud.clear();
    }
  };

  /** Plata que el jugador ya se ganó en este run, en vivo. */
  private liveCash(): number {
    const stats = this.score.stats;
    const pending = this.score.pending;
    const style = styleMultiplier(stats).total;
    return Math.floor((stats.score + pending) * CASH_RATE * style * this.bonuses.cashBonus);
  }

  private hudModel() {
    const save = this.saves.data;
    const challenge = save.challenges.find((c) => !c.done && !c.daily);
    return {
      score: this.score.stats.score,
      timeLeft: this.timeLeft,
      freeRoam: false,
      cash: save.cash,
      cashLive: this.liveCash(),
      speedKmh: this.carState.speed * 3.6,
      rpmNorm: clamp(this.carState.rpm / (this.built.spec.redline || 7000), 0, 1),
      gear: this.carState.gear,
      zone: this.world.zoneNameAt(this.carState.posX, this.carState.posZ),
      contractText: challenge?.text ?? null,
      contractProgress: challenge ? Math.max(challenge.progress, 0) / challenge.target : 0,
    };
  }

  private ctx: PhysicsContext = {
    surfaceGrip: 1,
    assistLevel: 'standard',
    torqueScale: 1,
    gripScale: 1,
  };

  private stepSim(dt: number): void {
    const car = this.carState;
    const save = this.saves.data;

    this.ctx.surfaceGrip = this.world.gripAt(car.posX, car.posZ);
    this.ctx.assistLevel = save.settings.assistLevel;
    this.ctx.torqueScale = this.built.mods.torqueScale;
    this.ctx.gripScale = this.built.mods.gripScale;

    stepCar(car, this.built.spec, this.input.state, this.ctx, dt);
    this.traffic.update(car, dt, () => this.score.onNearMiss(car));

    resolveCollisions(
      car, this.built.spec, this.world, this.traffic.cars,
      (info) => {
        this.score.onImpact(car, info.severity, false);
        bus.emit('collision', {
          severity: info.severity, impulse: info.impulse,
          x: info.x, z: info.z, nx: info.nx, nz: info.nz,
        });
      },
      (index) => {
        const d = this.world.destructibles[index];
        this.worldView.setDestructibleVisible(index, false, this.world.def);
        this.score.onConeDestroyed(car, d.hype);
        for (let i = 0; i < 6; i++) {
          this.sparks.spawn(
            d.x, 0.5, d.z,
            (Math.random() - 0.5) * 6, 2 + Math.random() * 3, (Math.random() - 0.5) * 6,
            1, 0.6, 0.25,
          );
        }
      },
    );

    const lim = this.world.half - 6;
    if (Math.abs(car.posX) > lim || Math.abs(car.posZ) > lim) {
      car.posX = clamp(car.posX, -lim, lim);
      car.posZ = clamp(car.posZ, -lim, lim);
      car.velX *= 0.4;
      car.velZ *= 0.4;
    }

    this.score.update(car, this.built.spec, this.world, dt);
  }

  private updateVisuals(dt: number): void {
    const car = this.carState;
    const spec = this.built.spec;

    if (this.input.consumeReset() && this.running) {
      const spawn = this.world.def.spawn;
      resetCarState(car, spawn.x, spawn.z, spawn.yaw);
      this.score.bank(car);
      this.marks.breakStrip(0);
      this.marks.breakStrip(1);
    }
    if (this.input.consumeCamera()) {
      const name = this.renderer.rig.cycle();
      this.saves.data.settings.camera = CAMERAS.indexOf(this.renderer.rig.config);
      this.saves.markDirty();
      this.ui.toast(`Cámara: ${name}`);
    }

    this.carView.update(car, car.steerVisual, this.input.state.brake > 0.1, dt);
    this.renderer.rig.update(car, this.score.tierIndex, Math.max(dt, 1e-4));

    // ── Humo y marcas en las ruedas traseras ──
    const cos = Math.cos(car.yaw);
    const sin = Math.sin(car.yaw);
    const trackHalf = spec.trackWidth * 0.5;
    const rearOffset = -spec.bodyLength * 0.31;
    const slip = car.rearSlipVelocity;
    const surface = this.world.surfaceAt(car.posX, car.posZ);
    const dusty = surface === 4 || surface === 3;

    for (let w = 0; w < 2; w++) {
      const side = w === 0 ? 1 : -1;
      const wx = car.posX + cos * trackHalf * side + sin * rearOffset;
      const wz = car.posZ - sin * trackHalf * side + cos * rearOffset;

      if (slip > 2 && car.speed > 2) {
        this.marks.addPoint(
          w, wx, wz, car.velX / (car.speed || 1), car.velZ / (car.speed || 1),
          clamp(slip / 12, 0.15, 1) * (dusty ? 0.25 : 1),
        );

        const rate = clamp(slip * 3.4, 0, 38) * dt * (this.score.tierIndex >= 3 ? 1.3 : 1);
        let n = Math.floor(rate);
        if (Math.random() < rate - n) n++;
        for (let i = 0; i < n; i++) {
          // Casi nada de velocidad hacia atrás: si no, el humo viaja derecho
          // hacia la cámara. Se abre a los costados y sube.
          this.smoke.spawn(
            wx + (Math.random() - 0.5) * 0.4, 0.18, wz + (Math.random() - 0.5) * 0.4,
            -car.velX * 0.04 + (Math.random() - 0.5) * 3.4,
            0.5 + Math.random() * 0.7,
            -car.velZ * 0.04 + (Math.random() - 0.5) * 3.4,
            dusty ? 0.62 : this.smokeColor.r,
            dusty ? 0.5 : this.smokeColor.g,
            dusty ? 0.34 : this.smokeColor.b,
          );
        }
      } else {
        this.marks.breakStrip(w);
      }
    }

    const projScale = this.renderer.rig.projScale(
      (document.getElementById('game') as HTMLCanvasElement).clientHeight,
    );
    this.smoke.update(dt, projScale);
    this.sparks.update(dt, projScale);
    this.floating.update(dt);

    if (this.trafficMeshes) {
      this.traffic.cars.forEach((t, i) => {
        this.dummy.position.set(t.x, 0.75, t.z);
        this.dummy.rotation.set(0, -t.rot, 0);
        this.dummy.scale.set(t.hw * 2, 1.5, t.hd * 2);
        this.dummy.updateMatrix();
        this.trafficMeshes!.setMatrixAt(i, this.dummy.matrix);
      });
      this.trafficMeshes.instanceMatrix.needsUpdate = true;
    }

    audio.updateCar(car, this.input.state.throttle, !this.running, dt);
    audio.setMusicIntensity(clamp(this.score.tierIndex / 6, 0, 1));
    audio.setReverb(this.world.zoneNameAt(car.posX, car.posZ) === 'Túnel' ? 0.5 : 0);
  }

  // ─────────────────────────── onboarding ───────────────────────────

  private readonly COACH: [number, string, string][] = [
    [0.4, 'ACELERÁ', 'W  o  ↑'],
    [7, 'FRENÁ Y GIRÁ', 'S + A/D'],
    [16, 'MANTENÉ EL DERRAPE', 'el combo sube solo'],
    [27, 'FRENO DE MANO PARA INICIAR', 'ESPACIO'],
    [40, 'CADA DERRAPE ES PLATA', 'mirá el contador abajo a la izquierda'],
    [52, '', ''],
  ];

  private updateCoach(dt: number): void {
    if (this.coachTimer < 0) return;
    this.coachTimer += dt;
    while (this.coachStep < this.COACH.length && this.coachTimer >= this.COACH[this.coachStep][0]) {
      const [, text, sub] = this.COACH[this.coachStep];
      this.setCoach(text, sub);
      this.coachStep++;
    }
    if (this.coachStep >= this.COACH.length) this.coachTimer = -1;
  }

  private setCoach(text: string, sub = ''): void {
    if (!text) {
      this.coach.classList.remove('show');
      return;
    }
    this.coach.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    this.coach.classList.add('show');
  }

  /** Diagnóstico desde consola: `game.debug()` */
  debug(): Record<string, unknown> {
    return {
      cash: this.saves.data.cash,
      liveCash: this.liveCash(),
      rep: this.saves.data.rep,
      car: this.built.def.displayName,
      speed: this.carState.speed * 3.6,
      driftAngle: this.carState.driftAngle / DEG(1),
      camera: this.renderer.rig.config.name,
      map: this.world.def.name,
      camHeight: this.renderer.rig.camera.position.y,
      quality: this.renderer.quality,
    };
  }
}
