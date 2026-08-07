import { clamp, moveTowards } from '../lib/math';
import { createInput, type InputState } from '../sim/types';

const ATTACK = 4.2;
const RELEASE = 7.0;

export class InputManager {
  readonly state: InputState = createInput();
  private keys = new Set<string>();
  private steerSmoothed = 0;
  private throttleSmoothed = 0;
  private brakeSmoothed = 0;
  private handbrakeBuffer = 0;

  /** Acciones de un frame (se consumen). */
  resetPressed = false;
  cameraPressed = false;
  pausePressed = false;

  private touch = { steer: 0, throttle: 0, brake: 0, handbrake: false, active: false };
  enabled = true;

  constructor(target: HTMLElement = document.body) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === 'r') this.resetPressed = true;
      if (k === 'c') this.cameraPressed = true;
      if (k === 'escape') this.pausePressed = true;
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());

    this.setupTouch(target);
  }

  private setupTouch(target: HTMLElement): void {
    const pointers = new Map<number, { zone: string; startX: number }>();

    const zoneFor = (x: number, y: number): string => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (y < h * 0.45) return 'none';
      if (x < w * 0.35) return 'handbrake';
      if (x > w * 0.62) return x > w * 0.82 ? 'throttle' : 'brake';
      return 'steer';
    };

    const apply = (): void => {
      this.touch.throttle = 0;
      this.touch.brake = 0;
      this.touch.handbrake = false;
      let steering = false;
      for (const p of pointers.values()) {
        if (p.zone === 'throttle') this.touch.throttle = 1;
        else if (p.zone === 'brake') this.touch.brake = 1;
        else if (p.zone === 'handbrake') this.touch.handbrake = true;
        else if (p.zone === 'steer') steering = true;
      }
      if (!steering) this.touch.steer = 0;
    };

    target.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      this.touch.active = true;
      pointers.set(e.pointerId, { zone: zoneFor(e.clientX, e.clientY), startX: e.clientX });
      apply();
    });
    target.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      if (p.zone === 'steer') {
        this.touch.steer = clamp((e.clientX - p.startX) / 90, -1, 1);
      }
    });
    const end = (e: PointerEvent): void => {
      pointers.delete(e.pointerId);
      apply();
    };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  }

  get isTouch(): boolean {
    return this.touch.active;
  }

  update(dt: number): void {
    if (!this.enabled) {
      this.state.throttle = 0;
      this.state.brake = 0;
      this.state.steer = 0;
      this.state.handbrake = false;
      return;
    }

    const k = this.keys;
    let steerRaw = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    let throttleRaw = k.has('w') || k.has('arrowup') ? 1 : 0;
    let brakeRaw = k.has('s') || k.has('arrowdown') ? 1 : 0;
    let handbrake = k.has(' ');

    // Gamepad (analógico directo, con deadzone radial y curva de respuesta)
    const pads = navigator.getGamepads?.() ?? [];
    for (const pad of pads) {
      if (!pad) continue;
      const ax = pad.axes[0] ?? 0;
      if (Math.abs(ax) > 0.12) steerRaw = Math.sign(ax) * Math.pow(Math.abs(ax), 1.35);
      const rt = pad.buttons[7]?.value ?? 0;
      const lt = pad.buttons[6]?.value ?? 0;
      if (rt > 0.03) throttleRaw = rt;
      if (lt > 0.03) brakeRaw = lt;
      if (pad.buttons[0]?.pressed) handbrake = true;
      if (pad.buttons[3]?.pressed) this.resetPressed = true;
      if (pad.buttons[5]?.pressed) this.cameraPressed = true;
      if (pad.buttons[9]?.pressed) this.pausePressed = true;
      break;
    }

    if (this.touch.active) {
      steerRaw = this.touch.steer;
      throttleRaw = this.touch.throttle;
      brakeRaw = this.touch.brake;
      handbrake = handbrake || this.touch.handbrake;
    }

    // El teclado es binario; el juego necesita analógico.
    const rate =
      steerRaw !== 0 && Math.sign(steerRaw) === Math.sign(this.steerSmoothed) ? ATTACK : RELEASE;
    this.steerSmoothed = moveTowards(this.steerSmoothed, steerRaw, rate * dt);
    this.throttleSmoothed = moveTowards(this.throttleSmoothed, throttleRaw, (throttleRaw > 0 ? 6 : 9) * dt);
    this.brakeSmoothed = moveTowards(this.brakeSmoothed, brakeRaw, (brakeRaw > 0 ? 9 : 12) * dt);

    // Buffer de 100 ms: perdona el timing del handbrake
    if (handbrake) this.handbrakeBuffer = 0.1;
    else this.handbrakeBuffer = Math.max(0, this.handbrakeBuffer - dt);

    this.state.steer = this.steerSmoothed;
    this.state.throttle = this.throttleSmoothed;
    this.state.brake = this.brakeSmoothed;
    this.state.handbrake = handbrake || this.handbrakeBuffer > 0;
  }

  consumeReset(): boolean {
    const v = this.resetPressed;
    this.resetPressed = false;
    return v;
  }
  consumeCamera(): boolean {
    const v = this.cameraPressed;
    this.cameraPressed = false;
    return v;
  }
  consumePause(): boolean {
    const v = this.pausePressed;
    this.pausePressed = false;
    return v;
  }
}
