import { clamp, degrees, easeOutBack } from '../lib/math';
import { TIERS, type ScoreSystem } from '../sim/ScoreSystem';
import type { MapDefinition } from '../sim/World';
import type { CarState } from '../sim/types';
import { fmt, fmtInt, fmtTime } from './format';

const TIER_COLORS = ['#ffe9c0', '#ffb03a', '#ffb03a', '#7fd4c1', '#ff8a3d', '#ff4d3a', '#ff6f91', '#ffffff'];

export interface HudModel {
  score: number;
  timeLeft: number;
  freeRoam: boolean;
  cash: number;
  /** Plata estimada que ya te ganaste en este run. */
  cashLive: number;
  speedKmh: number;
  rpmNorm: number;
  gear: number;
  zone: string | null;
  contractText: string | null;
  contractProgress: number;
}

/**
 * HUD in-game en canvas 2D: cero layout thrash durante el run. El combo va
 * cerca del centro-abajo, en la visión periférica inmediata del jugador.
 */
export class Hud {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private minimap: HTMLCanvasElement | null = null;
  private mapDef: MapDefinition | null = null;

  private tierPulse = 0;
  private displayScore = 0;
  private bankFlash = 0;
  scale = 1;
  showAngleArc = true;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  setMap(def: MapDefinition): void {
    this.mapDef = def;
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d')!;
    const k = size / (def.half * 2);
    const toX = (x: number): number => (x + def.half) * k;
    const toY = (z: number): number => size - (z + def.half) * k;

    g.fillStyle = '#2b2620';
    g.fillRect(0, 0, size, size);

    for (const zone of def.zones) {
      if (zone.mult === 1) continue;
      g.fillStyle = zone.color;
      g.globalAlpha = 0.32;
      g.fillRect(
        toX(zone.x - zone.hw), toY(zone.z + zone.hd),
        zone.hw * 2 * k, zone.hd * 2 * k,
      );
      g.globalAlpha = 1;
    }

    g.strokeStyle = '#7a7168';
    g.lineCap = 'round';
    for (const r of def.roads) {
      g.lineWidth = Math.max(1, r.width * k);
      g.beginPath();
      g.moveTo(toX(r.ax), toY(r.az));
      g.lineTo(toX(r.bx), toY(r.bz));
      g.stroke();
    }
    this.minimap = c;
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.floor(this.canvas.clientHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  onTier(tier: number): void {
    this.tierPulse = 1;
    void tier;
  }

  onBank(): void {
    this.bankFlash = 1;
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
  }

  draw(model: HudModel, score: ScoreSystem, car: CarState, dt: number): void {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    const s = this.scale * clamp(Math.min(w / 1280, h / 720), 0.65, 1.6);
    this.tierPulse = Math.max(0, this.tierPulse - dt * 3);
    this.bankFlash = Math.max(0, this.bankFlash - dt * 2.2);
    this.displayScore += (model.score - this.displayScore) * Math.min(1, dt * 9);

    ctx.textBaseline = 'middle';

    // ── Score y tiempo (arriba) ──
    ctx.textAlign = 'center';
    const scoreY = 44 * s;
    ctx.font = `900 ${44 * s}px system-ui, sans-serif`;
    if (this.bankFlash > 0) {
      ctx.shadowColor = '#ffb03a';
      ctx.shadowBlur = 26 * s * this.bankFlash;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillText(fmtInt(this.displayScore), w / 2, scoreY);
    ctx.shadowBlur = 0;
    ctx.font = `600 ${14 * s}px system-ui, sans-serif`;
    ctx.fillStyle = '#9aa3b5';
    ctx.fillText('PUNTOS', w / 2, scoreY + 30 * s);

    if (!model.freeRoam) {
      ctx.font = `800 ${26 * s}px system-ui, sans-serif`;
      ctx.fillStyle = model.timeLeft < 10 ? '#ff4d3a' : '#ffe9c0';
      ctx.textAlign = 'left';
      ctx.fillText(fmtTime(model.timeLeft), 24 * s, 36 * s);
    } else {
      ctx.font = `700 ${16 * s}px system-ui, sans-serif`;
      ctx.fillStyle = '#9aa3b5';
      ctx.textAlign = 'left';
      ctx.fillText('LIBRE', 24 * s, 36 * s);
    }

    // Plata: la del garage y, más grande, la que estás ganando ahora mismo.
    // Es el recordatorio permanente de que driftear ES la fuente de plata.
    ctx.textAlign = 'left';
    ctx.font = `700 ${14 * s}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(`$ ${fmt(model.cash)}`, 24 * s, h - 44 * s);
    ctx.font = `900 ${26 * s}px system-ui, sans-serif`;
    ctx.fillStyle = '#ffd98a';
    ctx.fillText(`+$${fmt(model.cashLive)}`, 24 * s, h - 18 * s);

    // ── Combo ──
    this.drawCombo(score, car, w, h, s);

    // ── Velocímetro ──
    this.drawSpeedo(model, w, h, s);

    // ── Minimapa ──
    this.drawMinimap(car, w, s);

    // ── Zona ──
    if (model.zone && model.zone !== 'Centro') {
      ctx.textAlign = 'right';
      ctx.font = `800 ${15 * s}px system-ui, sans-serif`;
      ctx.fillStyle = '#ffb03a';
      ctx.fillText(model.zone.toUpperCase(), w - 24 * s, 150 * s);
    }

    // ── Contrato activo ──
    if (model.contractText) {
      ctx.textAlign = 'left';
      ctx.font = `600 ${13 * s}px system-ui, sans-serif`;
      ctx.fillStyle = '#9aa3b5';
      ctx.fillText(model.contractText, 24 * s, 70 * s);
      const bw = 180 * s;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(24 * s, 80 * s, bw, 4 * s);
      ctx.fillStyle = '#7fd4c1';
      ctx.fillRect(24 * s, 80 * s, bw * clamp(model.contractProgress, 0, 1), 4 * s);
    }
  }

  private drawCombo(score: ScoreSystem, car: CarState, w: number, h: number, s: number): void {
    const ctx = this.ctx;
    const active = score.pending > 0 || score.active;
    if (!active) return;

    const cx = w / 2;
    const cy = h * 0.68;
    const tier = score.tierIndex;
    const color = TIER_COLORS[Math.min(tier, TIER_COLORS.length - 1)];
    const pulse = 1 + easeOutBackClamped(this.tierPulse) * 0.35;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pulse, pulse);
    ctx.textAlign = 'center';

    ctx.font = `900 ${34 * s}px system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 18 * s;
    ctx.fillText(`+${fmtInt(score.pending)}`, 0, 0);
    ctx.shadowBlur = 0;

    ctx.font = `900 ${26 * s}px system-ui, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`×${score.multiplier.toFixed(2)}`, 0, 30 * s);

    const label = TIERS[Math.min(tier, TIERS.length - 1)].label;
    if (label) {
      ctx.font = `900 ${18 * s}px system-ui, sans-serif`;
      ctx.fillStyle = color;
      ctx.fillText(label, 0, 56 * s);
    }

    // Barra: progreso al próximo tier, o ventana de gracia. Va DEBAJO del
    // bloque para que se lea como progreso y no como una alarma.
    const bw = 130 * s;
    const bh = 5 * s;
    const by = label ? 78 * s : 56 * s;
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(-bw / 2, by, bw, bh);
    let frac: number;
    let barColor: string;
    if (score.active) {
      const next = TIERS[Math.min(tier + 1, TIERS.length - 1)];
      const cur = TIERS[Math.min(tier, TIERS.length - 1)];
      frac = next.at > cur.at ? (score.driftDuration - cur.at) / (next.at - cur.at) : 1;
      barColor = color;
    } else {
      frac = clamp(score.graceTimer / 1.2, 0, 1);
      barColor = '#ff8a3d';
    }
    ctx.fillStyle = barColor;
    ctx.fillRect(-bw / 2, by, bw * clamp(frac, 0, 1), bh);
    ctx.restore();

    // Arco de ángulo
    if (this.showAngleArc && car.speed > 5) {
      const a = degrees(car.driftAngle);
      const good = a >= 12 && a <= 80;
      const warn = a > 80 && a <= 95;
      ctx.save();
      ctx.translate(cx, cy - 92 * s);
      ctx.lineWidth = 5 * s;
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.arc(0, 0, 30 * s, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = good ? '#7fd4c1' : warn ? '#ffb03a' : '#ff4d3a';
      ctx.beginPath();
      ctx.arc(0, 0, 30 * s, Math.PI, Math.PI + Math.PI * clamp(a / 100, 0, 1));
      ctx.stroke();
      ctx.font = `700 ${13 * s}px system-ui, sans-serif`;
      ctx.fillStyle = '#ffe9c0';
      ctx.textAlign = 'center';
      ctx.fillText(`${a.toFixed(0)}°`, 0, -10 * s);
      ctx.restore();
    }
  }

  private drawSpeedo(model: HudModel, w: number, h: number, s: number): void {
    const ctx = this.ctx;
    const x = w - 130 * s;
    const y = h - 90 * s;

    ctx.textAlign = 'right';
    ctx.font = `900 ${40 * s}px system-ui, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(Math.round(model.speedKmh)), x + 90 * s, y);
    ctx.font = `600 ${13 * s}px system-ui, sans-serif`;
    ctx.fillStyle = '#9aa3b5';
    ctx.fillText('km/h', x + 90 * s, y + 24 * s);

    // Barra de rpm
    const bars = 12;
    const bw = 7 * s;
    const gap = 3 * s;
    const total = bars * (bw + gap);
    for (let i = 0; i < bars; i++) {
      const on = model.rpmNorm > i / bars;
      const t = i / bars;
      ctx.fillStyle = on ? (t > 0.85 ? '#ff4d3a' : t > 0.65 ? '#ffb03a' : '#7fd4c1') : 'rgba(255,255,255,0.12)';
      ctx.fillRect(x + 90 * s - total + i * (bw + gap), y + 34 * s, bw, 12 * s);
    }

    ctx.font = `800 ${20 * s}px system-ui, sans-serif`;
    ctx.fillStyle = '#ffe9c0';
    ctx.fillText(model.gear < 0 ? 'R' : model.gear === 0 ? 'N' : `${model.gear}ª`, x + 90 * s, y + 66 * s);
  }

  private drawMinimap(car: CarState, w: number, s: number): void {
    if (!this.minimap || !this.mapDef) return;
    const ctx = this.ctx;
    const size = 118 * s;
    const x = w - size - 20 * s;
    const y = 20 * s;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.rect(x, y, size, size);
    ctx.clip();
    ctx.drawImage(this.minimap, x, y, size, size);
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, size, size);

    const half = this.mapDef.half;
    const px = x + ((car.posX + half) / (half * 2)) * size;
    const py = y + size - ((car.posZ + half) / (half * 2)) * size;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-car.yaw);
    ctx.fillStyle = '#ffd98a';
    ctx.beginPath();
    ctx.moveTo(0, -6 * s);
    ctx.lineTo(4 * s, 5 * s);
    ctx.lineTo(-4 * s, 5 * s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function easeOutBackClamped(t: number): number {
  if (t <= 0) return 0;
  return clamp(easeOutBack(1 - t) * t, 0, 1);
}
