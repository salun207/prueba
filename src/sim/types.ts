/** Tipos de la simulación. Este módulo (y todo `sim/`) no importa three.js. */

export interface InputState {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1..1  (izquierda negativo)
  handbrake: boolean;
  shiftUp: boolean;
  shiftDown: boolean;
}

export function createInput(): InputState {
  return { throttle: 0, brake: 0, steer: 0, handbrake: false, shiftUp: false, shiftDown: false };
}

export type AssistLevel = 'casual' | 'standard' | 'pro';

export interface CarSpec {
  // Chasis
  mass: number;
  inertiaYaw: number;
  lengthFront: number;
  lengthRear: number;
  trackWidth: number;
  cgHeight: number;
  bodyLength: number; // para colisiones y visual
  bodyWidth: number;

  // Neumáticos
  tireStiffnessFront: number;
  tireStiffnessRear: number;
  peakGripFront: number;
  peakGripRear: number;
  tireFalloff: number;

  // Motor / transmisión
  torqueCurve: [number, number][];
  redline: number;
  idleRpm: number;
  gearRatios: number[];
  finalDrive: number;
  drivetrainEfficiency: number;
  wheelRadius: number;
  engineBrakeTorque: number;
  shiftTime: number;

  // Dirección
  maxSteerAngle: number;
  steerSpeed: number;
  steerReturnSpeed: number;
  steerSpeedFalloff: number;

  // Frenos
  brakeTorqueFront: number;
  brakeTorqueRear: number;
  handbrakeGripMultiplier: number;
  brakeBias: number; // 0..1, fracción delantera

  // Diferencial: 0 = abierto, 1 = bloqueado. Estabiliza el drift.
  diffLock: number;

  // Aero / resistencias
  dragCoefficient: number;
  rollingResistance: number;
  downforceCoefficient: number;
}

export interface CarState {
  posX: number;
  posZ: number;
  velX: number;
  velZ: number;
  yaw: number;
  yawRate: number;

  rpm: number;
  gear: number;
  shiftCooldown: number;

  // Derivados
  speed: number;
  slipAngleFront: number;
  slipAngleRear: number;
  driftAngle: number; // rad, siempre positivo
  driftAngleSigned: number;
  lateralG: number;
  longG: number;
  isDrifting: boolean;
  rearSlipVelocity: number;
  frontSlipVelocity: number;
  surfaceGrip: number; // multiplicador de la superficie actual, suavizado

  // Visual
  visualRoll: number;
  visualPitch: number;
  steerVisual: number;
  wheelSpin: number; // rad, rotación acumulada de las ruedas

  // Interno
  prevAccelLong: number;
  rescueTimer: number;
}

export function createCarState(x = 0, z = 0, yaw = 0): CarState {
  return {
    posX: x,
    posZ: z,
    velX: 0,
    velZ: 0,
    yaw,
    yawRate: 0,
    rpm: 900,
    gear: 1,
    shiftCooldown: 0,
    speed: 0,
    slipAngleFront: 0,
    slipAngleRear: 0,
    driftAngle: 0,
    driftAngleSigned: 0,
    lateralG: 0,
    longG: 0,
    isDrifting: false,
    rearSlipVelocity: 0,
    frontSlipVelocity: 0,
    surfaceGrip: 1,
    visualRoll: 0,
    visualPitch: 0,
    steerVisual: 0,
    wheelSpin: 0,
    prevAccelLong: 0,
    rescueTimer: 0,
  };
}

export function resetCarState(s: CarState, x: number, z: number, yaw: number): void {
  s.posX = x;
  s.posZ = z;
  s.velX = 0;
  s.velZ = 0;
  s.yaw = yaw;
  s.yawRate = 0;
  s.rpm = 900;
  s.gear = 1;
  s.shiftCooldown = 0;
  s.speed = 0;
  s.driftAngle = 0;
  s.driftAngleSigned = 0;
  s.isDrifting = false;
  s.rearSlipVelocity = 0;
  s.frontSlipVelocity = 0;
  s.visualRoll = 0;
  s.visualPitch = 0;
  s.steerVisual = 0;
  s.prevAccelLong = 0;
  s.rescueTimer = 0;
}
