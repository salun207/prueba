import { clamp } from '../lib/math';
import type { CarDefinition } from '../data/cars';
import type { CarState } from '../sim/types';

/**
 * Todo el audio es sintetizado en runtime. Cero archivos: 0 KB de bundle y un
 * pitch de motor perfectamente continuo, que es lo único que importa en un
 * juego de autos.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private busEngine!: GainNode;
  private busTire!: GainNode;
  private busImpact!: GainNode;
  private busUi!: GainNode;
  private busMusic!: GainNode;
  private noiseBuffer!: AudioBuffer;

  // Motor
  private osc: OscillatorNode[] = [];
  private engineGain!: GainNode;
  private engineFilter!: BiquadFilterNode;
  private engineShaper!: WaveShaperNode;
  private turboNode: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;

  // Neumáticos
  private tireSrc!: AudioBufferSourceNode;
  private tireFilter!: BiquadFilterNode;
  private tireGain!: GainNode;

  private convolver!: ConvolverNode;
  private reverbSend!: GainNode;

  private started = false;
  private carDef: CarDefinition | null = null;
  private prevThrottle = 0;

  // Música
  private musicStep = 0;
  private nextNoteTime = 0;
  private musicIntensity = 0;
  private progression = 0;
  private musicEnabled = true;

  volumes = { master: 0.8, music: 0.35, sfx: 0.7 };

  /** Debe llamarse desde un gesto del usuario. */
  start(): void {
    if (this.started) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.started = true;

    this.master = ctx.createGain();
    this.master.gain.value = this.volumes.master;
    this.master.connect(ctx.destination);

    const mk = (v: number): GainNode => {
      const g = ctx.createGain();
      g.gain.value = v;
      g.connect(this.master);
      return g;
    };
    this.busEngine = mk(0.55 * this.volumes.sfx);
    this.busTire = mk(0.45 * this.volumes.sfx);
    this.busImpact = mk(0.7 * this.volumes.sfx);
    this.busUi = mk(0.6 * this.volumes.sfx);
    this.busMusic = mk(this.volumes.music);

    // Ruido reutilizable
    const len = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Reverb sintético (para el túnel)
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = this.makeImpulse(1.8, 2.5);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0;
    this.reverbSend.connect(this.convolver);
    this.convolver.connect(this.master);

    this.buildEngine();
    this.buildTires();

    this.nextNoteTime = ctx.currentTime;
  }

  private makeImpulse(duration: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  private buildEngine(): void {
    const ctx = this.ctx!;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 800;
    this.engineFilter.Q.value = 1.2;

    this.engineShaper = ctx.createWaveShaper();
    this.engineShaper.curve = this.makeDistortionCurve(12);

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;

    this.engineFilter.connect(this.engineShaper);
    this.engineShaper.connect(this.engineGain);
    this.engineGain.connect(this.busEngine);
    this.engineGain.connect(this.reverbSend);

    const types: OscillatorType[] = ['sawtooth', 'square', 'sawtooth'];
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = types[i];
      o.frequency.value = 60;
      if (i === 2) o.detune.value = 8;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.6 : i === 1 ? 0.25 : 0.3;
      o.connect(g);
      g.connect(this.engineFilter);
      o.start();
      this.osc.push(o);
    }

    // Aire / turbo
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2400;
    filter.Q.value = 6;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.busEngine);
    src.start();
    this.turboNode = { src, gain, filter };
  }

  private makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
    }
    return curve;
  }

  private buildTires(): void {
    const ctx = this.ctx!;
    this.tireSrc = ctx.createBufferSource();
    this.tireSrc.buffer = this.noiseBuffer;
    this.tireSrc.loop = true;

    this.tireFilter = ctx.createBiquadFilter();
    this.tireFilter.type = 'bandpass';
    this.tireFilter.frequency.value = 700;
    this.tireFilter.Q.value = 18;

    this.tireGain = ctx.createGain();
    this.tireGain.gain.value = 0;

    this.tireSrc.connect(this.tireFilter);
    this.tireFilter.connect(this.tireGain);
    this.tireGain.connect(this.busTire);
    this.tireGain.connect(this.reverbSend);
    this.tireSrc.start();
  }

  setCar(def: CarDefinition): void {
    this.carDef = def;
    if (!this.ctx) return;
    const ch = def.audio.character;
    this.osc[0].type = ch === 'electric' ? 'triangle' : 'sawtooth';
    this.osc[1].type = ch === 'rotary' ? 'sawtooth' : 'square';
    this.engineShaper.curve = this.makeDistortionCurve(ch === 'v8' ? 20 : ch === 'electric' ? 2 : 12);
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.volumes = { master, music, sfx };
    if (!this.ctx) return;
    this.master.gain.value = master;
    this.busMusic.gain.value = music;
    this.busEngine.gain.value = 0.55 * sfx;
    this.busTire.gain.value = 0.45 * sfx;
    this.busImpact.gain.value = 0.7 * sfx;
    this.busUi.gain.value = 0.6 * sfx;
  }

  setMuted(muted: boolean): void {
    if (!this.ctx) return;
    this.master.gain.value = muted ? 0 : this.volumes.master;
  }

  setReverb(amount: number): void {
    if (!this.ctx) return;
    this.reverbSend.gain.setTargetAtTime(amount, this.ctx.currentTime, 0.2);
  }

  /** Motor + neumáticos, en cada frame. */
  updateCar(car: CarState, throttle: number, inGarage: boolean, dt: number): void {
    if (!this.ctx || !this.carDef) return;
    const now = this.ctx.currentTime;
    const ch = this.carDef.audio.character;

    const cylinders = Math.max(1, this.carDef.audio.cylinders || 4);
    const base =
      ch === 'electric'
        ? 40 + (car.rpm / 14000) * 260
        : (car.rpm / 60) * (cylinders / 2);

    const f = clamp(base, 20, 900);
    this.osc[0].frequency.setTargetAtTime(f, now, 0.02);
    this.osc[1].frequency.setTargetAtTime(f * 0.5, now, 0.02);
    this.osc[2].frequency.setTargetAtTime(f * (ch === 'rotary' ? 1.75 : 1.5), now, 0.02);

    const load = clamp(throttle, 0, 1);
    const rpmNorm = clamp(car.rpm / (this.carDef.spec.redline || 7000), 0, 1.1);
    const targetGain = inGarage ? 0.06 : 0.12 + load * 0.5 + rpmNorm * 0.12;
    this.engineGain.gain.setTargetAtTime(targetGain, now, 0.05);
    this.engineFilter.frequency.setTargetAtTime(400 + car.rpm * 0.35 + load * 900, now, 0.05);

    // Turbo / aire
    if (this.turboNode) {
      const turbo = this.carDef.audio.turbo ? rpmNorm * load * 0.18 : 0.015;
      this.turboNode.gain.gain.setTargetAtTime(turbo, now, 0.08);
      this.turboNode.filter.frequency.setTargetAtTime(1200 + rpmNorm * 3200, now, 0.08);
    }

    // Backfire al soltar arriba de 4500 rpm — 15 líneas, y es lo más satisfactorio del juego
    if (this.prevThrottle > 0.6 && throttle < 0.2 && car.rpm > 4500 && Math.random() < 0.4) {
      this.burst(160, 0.22, 900, 'bandpass', this.busImpact, 2.5);
      if (this.carDef.audio.turbo) this.blowOff();
    }
    this.prevThrottle = throttle;

    // Chirrido de gomas
    const slip = Math.max(car.rearSlipVelocity, car.frontSlipVelocity * 0.6);
    const tireLevel = inGarage ? 0 : clamp((slip - 1.5) / 12, 0, 1) * 0.5;
    this.tireGain.gain.setTargetAtTime(tireLevel, now, 0.04);
    this.tireFilter.frequency.setTargetAtTime(
      600 + car.rearSlipVelocity * 45 + Math.sin(now * 7) * 40,
      now,
      0.05,
    );
    void dt;
  }

  private blowOff(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(4200, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.25);
    filter.Q.value = 3;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.busEngine);
    src.start();
    src.stop(ctx.currentTime + 0.3);
  }

  private burst(
    freq: number, duration: number, q: number, type: BiquadFilterType,
    dest: AudioNode, gainValue: number,
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0008, ctx.currentTime + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    src.start();
    src.stop(ctx.currentTime + duration + 0.02);
  }

  impact(severity: 'scrape' | 'hit' | 'crash', kind: string): void {
    if (!this.ctx) return;
    const metal = kind === 'container' || kind === 'barrier' || kind === 'pole';
    if (severity === 'scrape') {
      this.burst(metal ? 3200 : 1800, 0.16, 8, 'bandpass', this.busImpact, 0.28);
    } else if (severity === 'hit') {
      this.burst(metal ? 900 : 420, 0.3, 2, 'lowpass', this.busImpact, 0.7);
    } else {
      this.burst(220, 0.5, 1.2, 'lowpass', this.busImpact, 1.0);
      this.burst(1600, 0.25, 4, 'bandpass', this.busImpact, 0.5);
    }
  }

  propHit(): void {
    this.burst(1400, 0.14, 3, 'bandpass', this.busImpact, 0.35);
  }

  /** Tono corto de UI. `kind` cambia el carácter. */
  blip(freq: number, duration = 0.08, type: OscillatorType = 'sine', gainValue = 0.25): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(gainValue, ctx.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    o.connect(g);
    g.connect(this.busUi);
    o.start();
    o.stop(ctx.currentTime + duration + 0.02);
  }

  /** Este sonido se escucha 500 veces: corto, agradable, con variación de pitch. */
  cash(pitchOffset = 0): void {
    const f = 880 * Math.pow(2, pitchOffset / 12);
    this.blip(f, 0.07, 'triangle', 0.18);
    setTimeout(() => this.blip(f * 1.5, 0.11, 'triangle', 0.15), 55);
  }

  tier(level: number): void {
    const f = 440 * Math.pow(2, Math.min(level, 8) / 12);
    this.blip(f, 0.1, 'square', 0.16);
    setTimeout(() => this.blip(f * 1.335, 0.16, 'triangle', 0.14), 70);
  }

  bank(): void {
    this.blip(660, 0.09, 'triangle', 0.2);
    setTimeout(() => this.blip(990, 0.14, 'triangle', 0.18), 60);
    setTimeout(() => this.blip(1320, 0.2, 'sine', 0.14), 120);
  }

  // ─────────────────────────── música generativa ───────────────────────────

  setMusicIntensity(v: number): void {
    this.musicIntensity = clamp(v, 0, 1);
  }

  setMusicEnabled(on: boolean): void {
    this.musicEnabled = on;
  }

  private readonly PROGRESSIONS = [
    [0, -3, -5, -7],
    [0, 3, 5, 3],
    [0, -2, -5, -4],
    [0, 5, 3, -2],
  ];

  updateMusic(): void {
    if (!this.ctx || !this.musicEnabled) return;
    const ctx = this.ctx;
    const bpm = 128;
    const stepDur = 60 / bpm / 4;
    while (this.nextNoteTime < ctx.currentTime + 0.12) {
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
    const intensity = this.musicIntensity;

    // Kick
    if (s % 4 === 0) this.drum(time, 'kick');
    // Snare
    if (s % 8 === 4) this.drum(time, 'snare');
    // Hi-hat
    if (s % 2 === 1) this.drum(time, 'hat', 0.35 + intensity * 0.3);

    // Bajo: el filtro se abre con el combo
    if ([0, 3, 6, 8, 11, 14].includes(s)) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = root;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(180 + intensity * 1400, time);
      f.frequency.exponentialRampToValueAtTime(120 + intensity * 400, time + dur * 2);
      f.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(0.22, time + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur * 1.8);
      o.connect(f);
      f.connect(g);
      g.connect(this.busMusic);
      o.start(time);
      o.stop(time + dur * 2);
    }

    // Pad de acordes
    if (s === 0) {
      for (const semi of [0, 7, 15]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = root * 2 * Math.pow(2, semi / 12);
        o.detune.value = (Math.random() - 0.5) * 12;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, time);
        g.gain.linearRampToValueAtTime(0.035, time + 0.35);
        g.gain.linearRampToValueAtTime(0.0001, time + dur * 16);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 900 + intensity * 1800;
        o.connect(f);
        f.connect(g);
        g.connect(this.busMusic);
        o.start(time);
        o.stop(time + dur * 16.2);
      }
    }

    // Arpegio: entra a partir del tier 3
    if (intensity > 0.35 && s % 2 === 0) {
      const notes = [0, 7, 12, 15, 19];
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = root * 4 * Math.pow(2, notes[(step / 2) % notes.length] / 12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(0.05 * intensity, time + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur * 1.5);
      o.connect(g);
      g.connect(this.busMusic);
      o.start(time);
      o.stop(time + dur * 2);
    }
  }

  private drum(time: number, kind: 'kick' | 'snare' | 'hat', level = 1): void {
    const ctx = this.ctx!;
    if (kind === 'kick') {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, time);
      o.frequency.exponentialRampToValueAtTime(45, time + 0.11);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
      o.connect(g);
      g.connect(this.busMusic);
      o.start(time);
      o.stop(time + 0.25);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    let stopAt: number;
    if (kind === 'snare') {
      f.type = 'bandpass';
      f.frequency.value = 1900;
      f.Q.value = 1.4;
      g.gain.setValueAtTime(0.28 * level, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
      stopAt = time + 0.18;
    } else {
      f.type = 'highpass';
      f.frequency.value = 7000;
      g.gain.setValueAtTime(0.09 * level, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
      stopAt = time + 0.07;
    }
    src.connect(f);
    f.connect(g);
    g.connect(this.busMusic);
    src.start(time);
    src.stop(stopAt);
  }
}

export const audio = new AudioEngine();
