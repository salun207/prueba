import { clamp, damp, moveTowards, normalizeAngle, DEG } from '../lib/math';
import { sampleTorqueCurve, tireForceNormalized } from './TireModel';
import {
  antiSpinTorque, counterSteerAssist, rescueGripMultiplier, spinDampingMultiplier, throttleAssist,
} from './Assists';
import type { AssistLevel, CarSpec, CarState, InputState } from './types';

/**
 * Modelo de bicicleta de 2 ejes en el plano XZ.
 *
 * Convenciones (todo SI, ángulos en rad):
 *   yaw = 0  →  el auto mira a +Z
 *   forward  = (sin yaw, cos yaw)
 *   left     = (cos yaw, -sin yaw)
 *   yaw creciente = el auto gira a la IZQUIERDA
 *   input.steer: +1 = derecha, -1 = izquierda
 *   ángulo de rueda δ positivo = giro a la izquierda
 */

export interface PhysicsContext {
  /** Multiplicador de grip de la superficie bajo el auto (1.0 = asfalto seco). */
  surfaceGrip: number;
  assistLevel: AssistLevel;
  /** Escala global de torque (upgrades/staff). */
  torqueScale: number;
  /** Escala global de grip (upgrades/setup). */
  gripScale: number;
}

export function stepCar(
  car: CarState,
  spec: CarSpec,
  input: InputState,
  ctx: PhysicsContext,
  dt: number,
): void {
  // ─── 0. SUPERFICIE (transición suave: un salto de μ descontrola el auto) ───
  car.surfaceGrip = damp(car.surfaceGrip, ctx.surfaceGrip, 6.7, dt);

  // ─── 1. DIRECCIÓN ─────────────────────────────────────────────────────────
  const speedFactor = 1 / (1 + spec.steerSpeedFalloff * (car.speed / 25));
  const playerSteer = -input.steer * spec.maxSteerAngle * speedFactor;
  const assist = counterSteerAssist(car, spec, input, ctx.assistLevel);
  const desiredSteer = clamp(playerSteer + assist, -spec.maxSteerAngle, spec.maxSteerAngle);

  const steerRate = Math.abs(input.steer) > 0.05 ? spec.steerSpeed : spec.steerReturnSpeed;
  car.steerVisual = moveTowards(car.steerVisual, desiredSteer, steerRate * dt);
  const steer = car.steerVisual;

  // ─── 2. VELOCIDAD EN ESPACIO LOCAL ────────────────────────────────────────
  const cos = Math.cos(car.yaw);
  const sin = Math.sin(car.yaw);
  const vLong = car.velX * sin + car.velZ * cos;
  const vLat = car.velX * cos - car.velZ * sin;

  // ─── 3. ÁNGULOS DE DERIVA POR EJE ─────────────────────────────────────────
  // El epsilon del denominador evita que el modelo explote a baja velocidad.
  const vSafe = Math.max(Math.abs(vLong), 1.5);
  const dirLong = vLong >= 0 ? 1 : -1;
  const slipFront = Math.atan2(vLat + car.yawRate * spec.lengthFront, vSafe) - steer * dirLong;
  const slipRear = Math.atan2(vLat - car.yawRate * spec.lengthRear, vSafe);
  car.slipAngleFront = slipFront;
  car.slipAngleRear = slipRear;

  // ─── 4. CARGA VERTICAL Y TRANSFERENCIA DE PESO ────────────────────────────
  const L = spec.lengthFront + spec.lengthRear;
  const weight = spec.mass * 9.81;
  const staticFront = (weight * spec.lengthRear) / L;
  const staticRear = (weight * spec.lengthFront) / L;
  const transferLong = (spec.mass * car.prevAccelLong * spec.cgHeight) / L;
  const downforce = spec.downforceCoefficient * car.speed * car.speed;

  const FzFront = Math.max(0, staticFront - transferLong + downforce * 0.5);
  const FzRear = Math.max(0, staticRear + transferLong + downforce * 0.5);

  // ─── 5. FUERZAS LATERALES ─────────────────────────────────────────────────
  const surface = car.surfaceGrip * ctx.gripScale;
  const rescue = rescueGripMultiplier(car, dt);
  const throttle = throttleAssist(car, input.throttle, ctx.assistLevel);

  let gripRear = spec.peakGripRear * surface * rescue;
  if (input.handbrake) gripRear *= spec.handbrakeGripMultiplier;
  // Círculo de fricción simplificado: el acelerador a fondo consume grip lateral.
  gripRear *= 1 - 0.28 * throttle * (car.gear > 0 ? 1 : 0);

  const gripFront = spec.peakGripFront * surface;
  // El diferencial bloqueado hace el tren trasero más predecible.
  const rearStiffness = spec.tireStiffnessRear * (1 + spec.diffLock * 0.22);

  const FyFront =
    -tireForceNormalized(slipFront, spec.tireStiffnessFront, spec.tireFalloff) * gripFront * FzFront;
  const FyRear =
    -tireForceNormalized(slipRear, rearStiffness, spec.tireFalloff) * gripRear * FzRear;

  // ─── 6. FUERZA LONGITUDINAL ───────────────────────────────────────────────
  const gearRatio = car.gear > 0 ? spec.gearRatios[car.gear - 1] : car.gear < 0 ? -3.1 : 0;
  const shifting = car.shiftCooldown > 0;
  const engineTorque = sampleTorqueCurve(spec.torqueCurve, car.rpm) * throttle * ctx.torqueScale;

  let driveForce = 0;
  let wheelspin = 0;
  if (car.gear !== 0 && !shifting) {
    driveForce =
      (engineTorque * Math.abs(gearRatio) * spec.finalDrive * spec.drivetrainEfficiency) /
      spec.wheelRadius;
    if (car.gear < 0) driveForce *= -0.45;
    // Límite por tracción: pasado el grip disponible, la rueda patina.
    const maxLong = gripRear * FzRear * 1.15 + 200;
    if (Math.abs(driveForce) > maxLong) {
      wheelspin = Math.abs(driveForce) / maxLong - 1;
      driveForce = Math.sign(driveForce) * maxLong;
    }
  }

  const engineBrake =
    (1 - throttle) *
    spec.engineBrakeTorque *
    (car.rpm / spec.redline) *
    Math.abs(gearRatio) *
    spec.finalDrive /
    spec.wheelRadius;

  const brakeForce =
    (input.brake * (spec.brakeTorqueFront * spec.brakeBias + spec.brakeTorqueRear * (1 - spec.brakeBias)) * 2) /
    spec.wheelRadius;
  const handbrakeForce = input.handbrake ? (spec.brakeTorqueRear * 1.6) / spec.wheelRadius : 0;

  const drag = spec.dragCoefficient * vLong * Math.abs(vLong);
  const rolling = spec.rollingResistance * vLong;

  let FxTotal =
    driveForce - dirLong * (brakeForce + handbrakeForce + engineBrake) - drag - rolling;

  // A velocidad casi nula sin acelerador, frenar del todo (nada de "crawl" infinito).
  if (Math.abs(vLong) < 0.3 && throttle < 0.05 && car.gear >= 0) {
    FxTotal = 0;
    car.velX *= 0.85;
    car.velZ *= 0.85;
  }

  // ─── 7. INTEGRACIÓN ───────────────────────────────────────────────────────
  const FyTotalLocal = FyFront * Math.cos(steer) + FyRear;

  // Ecuaciones en el marco del cuerpo (que rota con el auto):
  //   v̇_long = Fx/m + ψ̇·v_lat
  //   v̇_lat  = Fy/m − ψ̇·v_long
  // Los dos términos con ψ̇ son la parte de la rotación del marco. Sin el de
  // v̇_lat el auto rota pero camina derecho; sin el de v̇_long el modelo INVENTA
  // energía y el auto acelera solo mientras derrapa.
  const specificLong = FxTotal / spec.mass;
  const accelLong = specificLong + car.yawRate * vLat;
  const accelLat = FyTotalLocal / spec.mass - car.yawRate * vLong;

  // El peso se transfiere con la fuerza real sobre el chasis, no con el
  // término del marco rotante (un acelerómetro a bordo mediría Fx/m).
  car.prevAccelLong = specificLong;
  car.longG = specificLong / 9.81;

  const newVLong = vLong + accelLong * dt;
  const newVLat = vLat + accelLat * dt;

  const torqueYaw = FyFront * Math.cos(steer) * spec.lengthFront - FyRear * spec.lengthRear;
  // Amortiguación de guiñada: sin esto el auto oscila y tiembla.
  const yawDamping =
    -car.yawRate * spec.inertiaYaw * (0.55 + spec.diffLock * 0.12) *
    spinDampingMultiplier(car, ctx.assistLevel);
  const spinAssist = antiSpinTorque(car, spec, ctx.assistLevel);
  car.yawRate += ((torqueYaw + yawDamping + spinAssist) / spec.inertiaYaw) * dt;
  car.yaw = normalizeAngle(car.yaw + car.yawRate * dt);

  const c2 = Math.cos(car.yaw);
  const s2 = Math.sin(car.yaw);
  car.velX = newVLong * s2 + newVLat * c2;
  car.velZ = newVLong * c2 - newVLat * s2;

  car.posX += car.velX * dt;
  car.posZ += car.velZ * dt;

  // ─── 8. DERIVADOS ─────────────────────────────────────────────────────────
  car.speed = Math.hypot(car.velX, car.velZ);
  if (car.speed > 2) {
    car.driftAngleSigned = normalizeAngle(Math.atan2(car.velX, car.velZ) - car.yaw);
    car.driftAngle = Math.abs(car.driftAngleSigned);
  } else {
    car.driftAngleSigned = 0;
    car.driftAngle = 0;
  }
  car.lateralG = accelLat / 9.81;
  car.rearSlipVelocity = Math.abs(Math.sin(slipRear)) * car.speed + wheelspin * 9;
  car.frontSlipVelocity = Math.abs(Math.sin(slipFront)) * car.speed;
  car.isDrifting = car.driftAngle > DEG(10) && car.speed > 8;

  // ─── 9. MOTOR Y CAJA ──────────────────────────────────────────────────────
  updateDrivetrain(car, spec, input, newVLong, wheelspin, dt);

  // ─── 10. VISUAL (no afecta la sim) ────────────────────────────────────────
  // El auto se acuesta hacia AFUERA de la curva: en un giro a la izquierda
  // (lateralG > 0) el lado izquierdo sube.
  const targetRoll = clamp(car.lateralG * 0.055, -0.11, 0.11);
  const targetPitch = clamp(-specificLong * 0.006, -0.05, 0.05);
  car.visualRoll = damp(car.visualRoll, targetRoll, 9, dt);
  car.visualPitch = damp(car.visualPitch, targetPitch, 9, dt);
  car.wheelSpin += ((newVLong / spec.wheelRadius) * (1 + wheelspin * 2)) * dt;
}

function updateDrivetrain(
  car: CarState,
  spec: CarSpec,
  input: InputState,
  vLong: number,
  wheelspin: number,
  dt: number,
): void {
  // Marcha atrás: freno mantenido casi parado.
  if (car.gear >= 0 && input.brake > 0.5 && vLong < 0.6 && input.throttle < 0.1) {
    car.gear = -1;
  } else if (car.gear < 0 && input.throttle > 0.5 && vLong > -0.2) {
    car.gear = 1;
  }

  if (car.gear !== 0) {
    const ratio = Math.abs(car.gear > 0 ? spec.gearRatios[car.gear - 1] : -3.1) * spec.finalDrive;
    const wheelRps = (Math.abs(vLong) * (1 + wheelspin * 1.6)) / (spec.wheelRadius * 2 * Math.PI);
    const targetRpm = clamp(wheelRps * ratio * 60, spec.idleRpm, spec.redline * 1.02);
    // Con el embrague cortado en el cambio, el motor cae libre.
    const blend = car.shiftCooldown > 0 ? spec.idleRpm + input.throttle * 2500 : targetRpm;
    car.rpm = damp(car.rpm, blend, 14, dt);
  } else {
    car.rpm = damp(car.rpm, spec.idleRpm + input.throttle * 4500, 6, dt);
  }

  if (car.shiftCooldown > 0) {
    car.shiftCooldown -= dt;
    return;
  }
  if (car.gear <= 0) return;

  const upAt = spec.redline * 0.93;
  const downAt = spec.redline * 0.42;
  if (car.rpm > upAt && car.gear < spec.gearRatios.length) {
    car.gear++;
    car.shiftCooldown = spec.shiftTime;
  } else if (car.rpm < downAt && car.gear > 1) {
    car.gear--;
    car.shiftCooldown = spec.shiftTime * 0.8;
  }
}
