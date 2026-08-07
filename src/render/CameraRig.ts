import * as THREE from 'three';
import { clamp, damp, normalizeAngle, smoothstep } from '../lib/math';
import type { CarState } from '../sim/types';

export interface CameraConfig {
  pitchDeg: number;
  fov: number;
  heightBase: number;
  heightPerSpeed: number;
  heightMax: number;
  lookAheadBase: number;
  lookAheadPerSpeed: number;
  lookAheadMax: number;
  followLagPos: number;
  followLagRot: number;
  driftOffsetGain: number;
}

export const AERIAL: CameraConfig = {
  pitchDeg: 68,
  fov: 38,
  heightBase: 52,
  heightPerSpeed: 0.6,
  heightMax: 86,
  lookAheadBase: 4,
  lookAheadPerSpeed: 0.45,
  lookAheadMax: 24,
  followLagPos: 0.12,
  followLagRot: 0.22,
  driftOffsetGain: 6,
};

export const DRONE: CameraConfig = {
  ...AERIAL,
  pitchDeg: 80,
  heightBase: 95,
  heightPerSpeed: 0.3,
  heightMax: 130,
  lookAheadBase: 0,
  lookAheadPerSpeed: 0,
  lookAheadMax: 0,
  driftOffsetGain: 0,
};

/**
 * Cámara aérea. La decisión clave: sigue el VECTOR VELOCIDAD, no el yaw del
 * auto. Si siguiera el yaw, cuando el auto se cruza la cámara pega un latigazo
 * y marea; siguiendo la velocidad, el auto gira dentro de un encuadre estable.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  config: CameraConfig = AERIAL;

  private heading = 0;
  private targetPos = new THREE.Vector3();
  private smoothPos = new THREE.Vector3();
  private height = AERIAL.heightBase;
  private lateral = 0;
  private trauma = 0;
  private shakeTime = 0;
  private comboZoom = 1;
  shakeEnabled = true;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(AERIAL.fov, aspect, 1, 2200);
  }

  reset(car: CarState): void {
    this.heading = car.yaw;
    this.targetPos.set(car.posX, 0, car.posZ);
    this.smoothPos.copy(this.targetPos);
    this.height = this.config.heightBase;
    this.lateral = 0;
    this.trauma = 0;
    this.update(car, 1, 0.016);
  }

  addTrauma(v: number): void {
    this.trauma = Math.min(1, this.trauma + v);
  }

  setConfig(c: CameraConfig): void {
    this.config = c;
    this.camera.fov = c.fov;
    this.camera.updateProjectionMatrix();
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(car: CarState, comboTier: number, dt: number): void {
    const c = this.config;

    // ── Rumbo: velocidad a alta velocidad, yaw a baja (si no, gira al parar) ──
    const velHeading = Math.atan2(car.velX, car.velZ);
    const blend = smoothstep(3, 7, car.speed);
    const desired = car.yaw + normalizeAngle(velHeading - car.yaw) * blend;
    this.heading += normalizeAngle(desired - this.heading) * (1 - Math.exp(-dt / c.followLagRot));

    const hx = Math.sin(this.heading);
    const hz = Math.cos(this.heading);

    // ── Look-ahead: el auto queda abajo del encuadre y ves a dónde vas ──
    const lookAhead = Math.min(c.lookAheadMax, c.lookAheadBase + car.speed * c.lookAheadPerSpeed);

    // ── Offset lateral durante el drift: abre el espacio hacia donde apunta ──
    const targetLateral = Math.sin(car.driftAngleSigned) * c.driftOffsetGain;
    this.lateral = damp(this.lateral, targetLateral, 4, dt);

    this.targetPos.set(
      car.posX + hx * lookAhead + hz * this.lateral,
      0,
      car.posZ + hz * lookAhead - hx * this.lateral,
    );
    const k = 1 - Math.exp(-dt / c.followLagPos);
    this.smoothPos.lerp(this.targetPos, k);

    // ── Altura: sube con la velocidad y con el combo ──
    this.comboZoom = damp(this.comboZoom, 1 + 0.06 * Math.min(comboTier, 5), 3, dt);
    const targetHeight = Math.min(c.heightMax, c.heightBase + car.speed * c.heightPerSpeed) * this.comboZoom;
    this.height = damp(this.height, targetHeight, 3, dt);

    const pitch = (c.pitchDeg * Math.PI) / 180;
    const back = this.height / Math.tan(pitch);

    this.camera.position.set(
      this.smoothPos.x - hx * back,
      this.height,
      this.smoothPos.z - hz * back,
    );
    this.camera.lookAt(this.smoothPos);

    // ── Screenshake basado en trauma (no random puro: se ve barato) ──
    this.shakeTime += dt;
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - 1.5 * dt);
      if (this.shakeEnabled) {
        const s = this.trauma * this.trauma;
        const t = this.shakeTime * 34;
        this.camera.position.x += Math.sin(t * 1.7) * s * 0.6;
        this.camera.position.z += Math.sin(t * 2.3 + 1.7) * s * 0.6;
        this.camera.position.y += Math.sin(t * 3.1 + 0.4) * s * 0.3;
        this.camera.rotateZ(Math.sin(t * 2.9) * s * 0.016);
      }
    }
  }

  /** Escala para convertir tamaño en mundo → píxeles (partículas). */
  projScale(canvasHeight: number): number {
    return (canvasHeight * 0.5) / Math.tan((this.camera.fov * Math.PI) / 360);
  }

  get zoomFactor(): number {
    return clamp(this.height / AERIAL.heightBase, 0.5, 2);
  }
}
