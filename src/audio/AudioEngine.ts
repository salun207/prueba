import { clamp } from '../lib/math';
import type { CarDefinition } from '../data/cars';
import type { CarState } from '../sim/types';

/**
 * Audio sintetizado en runtime. Cero archivos.
 *
 * Dos reglas después de la primera versión, que salía chillona:
 *
 * 1. El motor y las gomas son AMBIENTE. Tienen que poder sonar 10 minutos sin
 *    cansar: armónicos con caída suave (nada de sierra + distorsión), filtros
 *    cerrados y ganancia baja. Si algo molesta, es esto.
 * 2. Las recompensas son la MELODÍA. Cada premio toca la nota siguiente de una
 *    escala pentatónica y sube. Encadenar suena a que estás subiendo algo, y
 *    eso es lo que engancha: el sonido te dice que vas bien antes que el número.
 */

// Pentatónica mayor sobre varias octavas: no hay forma de que suene mal.
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];
const ROOT = 261.63; // Do central

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private busEngine!: GainNode;
  private busTire!: GainNode;
  private busImpact!: GainNode;
  private busReward!: GainNode;
  private busMusic!: GainNode;
  private noiseBuffer!: AudioBuffer;

  // Motor
  private oscMain!: OscillatorNode;
  private oscSub!: OscillatorNode;
  private engineGain!: GainNode;
  private engineFilter!: BiquadFilterNode;
  private engineHarm!: GainNode;
  private turbo: { gain: GainNode; filter: BiquadFilterNode } | null = null;

  // Gomas: dos capas — un siseo con cuerpo y un rumor grave
  private tireGain!: GainNode;
  private tireBand!: BiquadFilterNode;
  private tireLow!: GainNode;

  private delay!: DelayNode;
  private delayFeedback!: GainNode;
  private rewardSend!: GainNode;

  private started = false;
  private carDef: CarDefinition | null = null;
  private prevThrottle = 0;

  // Escalera de recompensas
  private chainStep = 0;
  private chainUntil = 0;

  // Música
  private musicStep = 0;
  private nextNoteTime = 0;
  private musicIntensity = 0;
  private progression = 0;

  volumes = { master: 0.8, music: 0.3, sfx: 0.75 };

  /** Debe llamarse desde un gesto del usuario. */
  start(): void {
    if (this.started) return;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.started = true;

    this.master = ctx.createGain();
    this.master.gain.value = this.volumes.master;
    this.master.connect(ctx.destination);

    const bus = (v: number): GainNode => {
      const g = ctx.createGain();
      g.gain.value = v;
      g.connect(this.master);
      return g;
    };
    // El motor y las gomas van MUY por debajo de las recompensas.
    this.busEngine = bus(0.26 * this.volumes.sfx);
    this.busTire = bus(0.2 * this.volumes.sfx);
    this.busImpact = bus(0.5 * this.volumes.sfx);
    this.busReward = bus(0.85 * this.volumes.sfx);
    this.busMusic = bus(this.volumes.music);

    const len = Math.floor(ctx.sampleRate * 2);
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Delay corto: le da cola y aire a las recompensas sin embarrar
    this.delay = ctx.createDelay(0.5);
    this.delay.delayTime.value = 0.22;
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = 0.28;
    this.rewardSend = ctx.createGain();
    this.rewardSend.gain.value = 0.35;
    this.rewardSend.connect(this.delay);
    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.delay.connect(this.master);

    this.buildEngine();
    this.buildTires();
    this.nextNoteTime = ctx.currentTime;
  }

  // ─────────────────────────── motor ───────────────────────────

  /**
   * Onda de motor: armónicos con caída 1/n^1.25 y fases alternadas. Suena a
   * motor y no a zumbador, que es lo que pasaba con sierra + waveshaper.
   */
  private engineWave(harmonics: number, oddBias: number): PeriodicWave {
    const ctx = this.ctx!;
    const n = harmonics + 1;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let i = 1; i < n; i++) {
      const odd = i % 2 === 1 ? oddBias : 1 - oddBias * 0.5;
      imag[i] = (1 / Math.pow(i, 1.25)) * odd;
    }
    return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  }

  private buildEngine(): void {
    const ctx = this.ctx!;

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 600;
    this.engineFilter.Q.value = 0.7;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.busEngine);

    this.oscMain = ctx.createOscillator();
    this.oscMain.setPeriodicWave(this.engineWave(12, 0.7));
    this.oscMain.frequency.value = 60;
    this.engineHarm = ctx.createGain();
    this.engineHarm.gain.value = 0.75;
    this.oscMain.connect(this.engineHarm);
    this.engineHarm.connect(this.engineFilter);
    this.oscMain.start();

    // Sub: el cuerpo grave, siempre presente y estable
    this.oscSub = ctx.createOscillator();
    this.oscSub.type = 'sine';
    this.oscSub.frequency.value = 30;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.5;
    this.oscSub.connect(subGain);
    subGain.connect(this.engineFilter);
    this.oscSub.start();

    // Aire de admisión / turbo
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1600;
    filter.Q.value = 1.4;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.busEngine);
    src.start();
    this.turbo = { gain, filter };
  }

  private buildTires(): void {
    const ctx = this.ctx!;

    this.tireGain = ctx.createGain();
    this.tireGain.gain.value = 0;
    this.tireGain.connect(this.busTire);

    // Capa 1: siseo con Q bajo (el Q alto de antes era el chillido molesto)
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    this.tireBand = ctx.createBiquadFilter();
    this.tireBand.type = 'bandpass';
    this.tireBand.frequency.value = 900;
    this.tireBand.Q.value = 3.5;
    const tame = ctx.createBiquadFilter();
    tame.type = 'lowpass';
    tame.frequency.value = 2600;
    src.connect(this.tireBand);
    this.tireBand.connect(tame);
    tame.connect(this.tireGain);
    src.start();

    // Capa 2: rumor grave, le da peso al derrape
    const src2 = ctx.createBufferSource();
    src2.buffer = this.noiseBuffer;
    src2.loop = true;
    src2.playbackRate.value = 0.45;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 320;
    this.tireLow = ctx.createGain();
    this.tireLow.gain.value = 0.9;
    src2.connect(low);
    low.connect(this.tireLow);
    this.tireLow.connect(this.tireGain);
    src2.start();
  }

  setCar(def: CarDefinition): void {
    this.carDef = def;
    if (!this.ctx) return;
    const ch = def.audio.character;
    // Cada carácter cambia la riqueza armónica, no el nivel de distorsión.
    const harmonics = ch === 'electric' ? 3 : ch === 'v12' ? 16 : ch === 'v8' ? 10 : 12;
    const oddBias = ch === 'v8' ? 0.85 : ch === 'rotary' ? 0.5 : 0.7;
    this.oscMain.setPeriodicWave(this.engineWave(harmonics, oddBias));
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.volumes = { master, music, sfx };
    if (!this.ctx) return;
    this.master.gain.value = master;
    this.busMusic.gain.value = music;
    this.busEngine.gain.value = 0.26 * sfx;
    this.busTire.gain.value = 0.2 * sfx;
    this.busImpact.gain.value = 0.5 * sfx;
    this.busReward.gain.value = 0.85 * sfx;
  }

  setMuted(muted: boolean): void {
    if (!this.ctx) return;
    this.master.gain.value = muted ? 0 : this.volumes.master;
  }

  setReverb(amount: number): void {
    if (!this.ctx) return;
    this.delayFeedback.gain.setTargetAtTime(0.28 + amount * 0.3, this.ctx.currentTime, 0.3);
  }

  /** Motor + gomas, cada frame. */
  updateCar(car: CarState, throttle: number, idle: boolean, dt: number): void {
    if (!this.ctx || !this.carDef) return;
    const now = this.ctx.currentTime;
    const ch = this.carDef.audio.character;
    const cyl = Math.max(2, this.carDef.audio.cylinders || 4);

    const firing =
      ch === 'electric' ? 55 + (car.rpm / 14000) * 210 : (car.rpm / 60) * (cyl / 2);
    const f = clamp(firing, 22, 420);
    this.oscMain.frequency.setTargetAtTime(f, now, 0.035);
    this.oscSub.frequency.setTargetAtTime(clamp(f * 0.5, 18, 180), now, 0.05);

    const load = clamp(throttle, 0, 1);
    const rpmNorm = clamp(car.rpm / (this.carDef.spec.redline || 7000), 0, 1.1);

    // Ganancia contenida y filtro que abre poco: el motor acompaña, no tapa.
    const target = idle ? 0.05 : 0.1 + load * 0.28 + rpmNorm * 0.1;
    this.engineGain.gain.setTargetAtTime(target, now, 0.07);
    this.engineFilter.frequency.setTargetAtTime(
      340 + car.rpm * 0.14 + load * 420,
      now,
      0.09,
    );
    this.engineHarm.gain.setTargetAtTime(0.5 + load * 0.35, now, 0.09);

    if (this.turbo) {
      const t = this.carDef.audio.turbo ? rpmNorm * load * 0.075 : 0.008;
      this.turbo.gain.gain.setTargetAtTime(idle ? 0 : t, now, 0.1);
      this.turbo.filter.frequency.setTargetAtTime(1100 + rpmNorm * 1800, now, 0.1);
    }

    // Pop de corte: suave y poco frecuente. Antes era un estallido de ruido.
    if (this.prevThrottle > 0.65 && throttle < 0.15 && car.rpm > 4800 && Math.random() < 0.22) {
      this.pop();
    }
    this.prevThrottle = throttle;

    // Gomas: sube con el slip pero con techo bajo y sin picos
    const slip = Math.max(car.rearSlipVelocity, car.frontSlipVelocity * 0.5);
    const level = idle ? 0 : Math.pow(clamp((slip - 2) / 14, 0, 1), 0.8) * 0.34;
    this.tireGain.gain.setTargetAtTime(level, now, 0.06);
    this.tireBand.frequency.setTargetAtTime(700 + clamp(slip, 0, 18) * 42, now, 0.09);
    void dt;
  }

  private pop(): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(180, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0005, ctx.currentTime + 0.11);
    o.connect(g);
    g.connect(this.busEngine);
    o.start();
    o.stop(ctx.currentTime + 0.13);
  }

  // ─────────────────────────── recompensas ───────────────────────────

  /**
   * Nota de la escalera. `step` es el escalón; sube el pitch sin salirse de la
   * pentatónica, así que encadenar 20 premios seguidos suena a melodía y no a
   * ruido. Es el mismo truco de los juegos de monedas, y funciona.
   */
  private note(step: number, when: number, gain: number, dur: number, octave = 0): void {
    const ctx = this.ctx!;
    const semi = PENTA[Math.min(step, PENTA.length - 1)] + octave * 12;
    const freq = ROOT * Math.pow(2, semi / 12);

    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;

    // Segunda voz una quinta arriba, muy suave: da brillo sin agregar aspereza
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 1.5;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    const g2 = ctx.createGain();
    g2.gain.value = 0.3;

    o.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(this.busReward);
    g.connect(this.rewardSend);

    o.start(when);
    o2.start(when);
    o.stop(when + dur + 0.05);
    o2.stop(when + dur + 0.05);
  }

  /** Premio chico (cono, near miss, bonus). Sube un escalón cada vez. */
  pickup(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now > this.chainUntil) this.chainStep = 0;
    this.chainUntil = now + 1.8;
    this.note(this.chainStep, now, 0.2, 0.26, 1);
    this.chainStep = Math.min(this.chainStep + 1, PENTA.length - 1);
  }

  /** Subida de tier: acorde ascendente de tres notas, cada tier más arriba. */
  tier(level: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const base = Math.min(level * 2, 8);
    this.note(base, now, 0.24, 0.3);
    this.note(base + 2, now + 0.075, 0.22, 0.34);
    this.note(base + 4, now + 0.15, 0.26, 0.5, 1);
    this.chainStep = Math.min(base + 4, PENTA.length - 1);
    this.chainUntil = now + 1.8;
  }

  /** Cobrar el combo: arpegio resolviendo hacia arriba + golpe grave. */
  bank(multiplier: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const steps = clamp(Math.round(multiplier), 2, 6);
    for (let i = 0; i < steps; i++) {
      this.note(i * 2, now + i * 0.055, 0.2, 0.32, i > 3 ? 1 : 0);
    }
    this.note(steps * 2, now + steps * 0.055, 0.3, 0.8, 1);

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, now);
    o.frequency.exponentialRampToValueAtTime(52, now + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.34, now);
    g.gain.exponentialRampToValueAtTime(0.0005, now + 0.34);
    o.connect(g);
    g.connect(this.busReward);
    o.start(now);
    o.stop(now + 0.36);

    this.chainStep = 0;
  }

  /** Perder el combo: dos notas bajando. Claro pero no castigador. */
  lost(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.note(4, now, 0.14, 0.2, -1);
    this.note(1, now + 0.1, 0.14, 0.35, -1);
    this.chainStep = 0;
  }

  cash(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.note(5, now, 0.18, 0.16, 1);
    this.note(8, now + 0.06, 0.2, 0.4, 1);
  }

  click(ok = true): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.note(ok ? 4 : 0, now, 0.1, 0.09, ok ? 0 : -1);
  }

  // ─────────────────────────── impactos ───────────────────────────

  impact(severity: 'scrape' | 'hit' | 'crash'): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const cfg =
      severity === 'scrape'
        ? { freq: 2200, q: 3, dur: 0.13, gain: 0.1, low: false }
        : severity === 'hit'
          ? { freq: 520, q: 1.2, dur: 0.24, gain: 0.34, low: true }
          : { freq: 240, q: 0.9, dur: 0.42, gain: 0.55, low: true };

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.7 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = cfg.low ? 'lowpass' : 'bandpass';
    f.frequency.value = cfg.freq;
    f.Q.value = cfg.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(cfg.gain, now);
    g.gain.exponentialRampToValueAtTime(0.0005, now + cfg.dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.busImpact);
    src.start(now);
    src.stop(now + cfg.dur + 0.03);

    if (cfg.low) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(90, now);
      o.frequency.exponentialRampToValueAtTime(38, now + cfg.dur);
      const og = ctx.createGain();
      og.gain.setValueAtTime(cfg.gain * 0.7, now);
      og.gain.exponentialRampToValueAtTime(0.0005, now + cfg.dur);
      o.connect(og);
      og.connect(this.busImpact);
      o.start(now);
      o.stop(now + cfg.dur + 0.03);
    }
  }

  // ─────────────────────────── música ───────────────────────────

  setMusicIntensity(v: number): void {
    this.musicIntensity = clamp(v, 0, 1);
  }

  private readonly PROGRESSIONS = [
    [0, -3, -5, -7],
    [0, 3, -2, -5],
    [0, -5, -3, -7],
  ];

  updateMusic(): void {
    if (!this.ctx || this.volumes.music <= 0.001) return;
    const ctx = this.ctx;
    const stepDur = 60 / 112 / 4;
    while (this.nextNoteTime < ctx.currentTime + 0.15) {
      this.scheduleStep(this.musicStep, this.nextNoteTime, stepDur);
      this.musicStep++;
      if (this.musicStep % 64 === 0) {
        this.progression = (this.progression + 1) % this.PROGRESSIONS.length;
      }
      this.nextNoteTime += stepDur;
    }
  }

  private scheduleStep(step: number, time: number, dur: number): void {
    const ctx = this.ctx!;
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const root = 55 * Math.pow(2, this.PROGRESSIONS[this.progression][bar] / 12);
    const it = this.musicIntensity;

    if (s % 4 === 0) this.kick(time);
    if (s % 8 === 4) this.hit(time, 'snare', 0.16 + it * 0.1);
    if (s % 2 === 1 && it > 0.1) this.hit(time, 'hat', 0.1 + it * 0.14);

    if ([0, 3, 6, 8, 11, 14].includes(s)) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = root;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(220 + it * 900, time);
      f.Q.value = 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(0.16, time + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur * 1.7);
      o.connect(f);
      f.connect(g);
      g.connect(this.busMusic);
      o.start(time);
      o.stop(time + dur * 2);
    }

    if (s === 0) {
      for (const semi of [0, 7, 16]) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = root * 2 * Math.pow(2, semi / 12);
        o.detune.value = (Math.random() - 0.5) * 8;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, time);
        g.gain.linearRampToValueAtTime(0.028, time + 0.5);
        g.gain.linearRampToValueAtTime(0.0001, time + dur * 16);
        o.connect(g);
        g.connect(this.busMusic);
        o.start(time);
        o.stop(time + dur * 16.2);
      }
    }
  }

  private kick(time: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(125, time);
    o.frequency.exponentialRampToValueAtTime(44, time + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.34, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
    o.connect(g);
    g.connect(this.busMusic);
    o.start(time);
    o.stop(time + 0.22);
  }

  private hit(time: number, kind: 'snare' | 'hat', level: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    let stopAt: number;
    if (kind === 'snare') {
      f.type = 'bandpass';
      f.frequency.value = 1500;
      f.Q.value = 1.1;
      g.gain.setValueAtTime(level, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
      stopAt = time + 0.16;
    } else {
      f.type = 'highpass';
      f.frequency.value = 8200;
      g.gain.setValueAtTime(level * 0.5, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
      stopAt = time + 0.06;
    }
    src.connect(f);
    f.connect(g);
    g.connect(this.busMusic);
    src.start(time);
    src.stop(stopAt);
  }
}

export const audio = new AudioEngine();
