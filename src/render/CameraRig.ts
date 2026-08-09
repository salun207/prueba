import * as THREE from 'three';
import { clamp, damp, normalizeAngle, smoothstep } from '../lib/math';
import type { CarState } from '../sim/types';

export interface ChaseConfig {
  name: string;
  /** Distancia detrás del auto, en metros. */
  distance: number;
  height: number;
  /** Altura del punto que mira, sobre el piso. */
  lookHeight: number;
  lookAhead: number;
  fovBase: number;
  fovSpeed: number;
  posLag: number;
  rotLag: number;
  /**
   * 0 = la cámara va detrás del vector velocidad (el auto se ve cruzado, que es
   * lo que querés ver drifteando). 1 = va detrás de la trompa. En el medio está
   * el encuadre bueno.
   */
  yawBias: number;
  rollGain: number;
}

export const CHASE: ChaseConfig = {
  name: 'Persecución',
  distance: 6.6,
  height: 2.35,
  lookHeight: 1.25,
  lookAhead: 7,
  fovBase: 64,
  fovSpeed: 16,
  posLag: 0.1,
  rotLag: 0.19,
  yawBias: 0.28,
  rollGain: 0.35,
};

export const CHASE_CLOSE: ChaseConfig = {
  ...CHASE,
  name: 'Corta',
  distance: 4.6,
  height: 1.75,
  lookAhead: 5,
  fovBase: 70,
  yawBias: 0.15,
  rotLag: 0.14,
};

export const CINEMATIC: ChaseConfig = {
  ...CHASE,
  name: 'Cinemática',
  distance: 9.5,
  height: 1.5,
  lookHeight: 1.0,
  lookAhead: 10,
  fovBase: 52,
  fovSpeed: 10,
  posLag: 0.22,
  rotLag: 0.4,
  yawBias: 0.55,
  rollGain: 0.7,
};

export const CAMERAS = [CHASE, CHASE_CLOSE, CINEMATIC];

/** Devuelve la distancia al obstáculo más cercano desde ese punto del mundo. */
export type ClearanceProbe = (x: number, z: number) => number;

/**
 * Cámara de persecución en tercera persona.
 *
 * La decisión que define el encuadre: el rumbo de la cámara sigue casi todo el
 * VECTOR VELOCIDAD y solo un poco el yaw del auto. Si siguiera el yaw, el auto
 * se vería siempre de culata y el drift no se leería; siguiendo la velocidad, el
 * auto entra cruzado en el cuadro y ves el ángulo que estás manteniendo.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  config: ChaseConfig = CHASE;
  shakeEnabled = true;
  probe: ClearanceProbe | null = null;

  private heading = 0;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private smoothLook = new THREE.Vector3();
  private roll = 0;
  private fov = CHASE.fovBase;
  private trauma = 0;
  private shakeTime = 0;
  private comboPush = 0;
  private index = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CHASE.fovBase, aspect, 0.25, 2600);
  }

  cycle(): string {
    this.index = (this.index + 1) % CAMERAS.length;
    this.config = CAMERAS[this.index];
    return this.config.name;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  addTrauma(v: number): void {
    this.trauma = Math.min(1, this.trauma + v);
  }

  reset(car: CarState): void {
    this.heading = car.yaw;
    this.smoothLook.set(car.posX, this.config.lookHeight, car.posZ);
    this.roll = 0;
    this.trauma = 0;
    this.comboPush = 0;
    this.fov = this.config.fovBase;
    this.update(car, 0, 0.016);
  }

  update(car: CarState, comboTier: number, dt: number): void {
    const c = this.config;

    // ── Rumbo ──
    const velHeading = Math.atan2(car.velX, car.velZ);
    const useVel = smoothstep(2.5, 7, car.speed);
    const target =
      car.yaw + normalizeAngle(velHeading - car.yaw) * useVel * (1 - c.yawBias);
    this.heading += normalizeAngle(target - this.heading) * (1 - Math.exp(-dt / c.rotLag));

    const hx = Math.sin(this.heading);
    const hz = Math.cos(this.heading);

    // ── Punto de mira: adelante del auto y un poco arriba ──
    this.look.set(
      car.posX + hx * c.lookAhead,
      c.lookHeight,
      car.posZ + hz * c.lookAhead,
    );
    this.smoothLook.lerp(this.look, 1 - Math.exp(-dt / c.posLag));

    // ── Posición: detrás y arriba, con retroceso extra por combo ──
    this.comboPush = damp(this.comboPush, Math.min(comboTier, 5) * 0.22, 3, dt);
    const dist = c.distance + this.comboPush + car.speed * 0.028;
    let px = car.posX - hx * dist;
    let pz = car.posZ - hz * dist;

    // ── Colisión: si hay una pared atrás, la cámara se acerca al auto ──
    if (this.probe) {
      const clearance = this.probe(px, pz);
      if (clearance < 1.6) {
        const pull = clamp((1.6 - clearance) / 1.6, 0, 0.75);
        px = car.posX - hx * dist * (1 - pull);
        pz = car.posZ - hz * dist * (1 - pull);
      }
    }

    this.pos.set(px, c.height + this.comboPush * 0.25, pz);
    this.camera.position.copy(this.pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.smoothLook);

    // ── Roll: la cámara se acuesta un toque con la G lateral ──
    this.roll = damp(this.roll, clamp(-car.lateralG * 0.035, -0.09, 0.09) * c.rollGain, 5, dt);
    this.camera.rotateZ(this.roll);

    // ── FOV: abre con la velocidad, es el 80% de la sensación de velocidad ──
    const targetFov = c.fovBase + Math.min(1, car.speed / 55) * c.fovSpeed;
    this.fov = damp(this.fov, targetFov, 4, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    // ── Shake por trauma (nunca random puro: se ve barato) ──
    this.shakeTime += dt;
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - 1.6 * dt);
      if (this.shakeEnabled) {
        const s = this.trauma * this.trauma;
        const t = this.shakeTime * 38;
        this.camera.position.x += Math.sin(t * 1.7) * s * 0.35;
        this.camera.position.y += Math.sin(t * 2.9 + 0.4) * s * 0.22;
        this.camera.position.z += Math.sin(t * 2.3 + 1.7) * s * 0.35;
        this.camera.rotateZ(Math.sin(t * 3.3) * s * 0.02);
      }
    }
  }

  projScale(canvasHeight: number): number {
    return (canvasHeight * 0.5) / Math.tan((this.camera.fov * Math.PI) / 360);
  }
}
