import { clamp, normalizeAngle, smoothstep, DEG } from '../lib/math';
import type { AssistLevel, CarSpec, CarState, InputState } from './types';

const COUNTER_GAIN: Record<AssistLevel, number> = { casual: 0.88, standard: 0.6, pro: 0.3 };
const SPIN_THRESHOLD: Record<AssistLevel, number> = { casual: DEG(100), standard: DEG(105), pro: DEG(125) };
// El torque de guiñada de la goma trasera en pleno derrape ronda los
// 8.000 N·m: un cap de 0.35·I (≈550 N·m) no frenaba nada. Estos valores
// sí compiten con la goma sin volver imposible el trompo.
const SPIN_CAP: Record<AssistLevel, number> = { casual: 4.5, standard: 3.2, pro: 1.4 };

/**
 * Contravolante asistido. Devuelve un ángulo de dirección (rad) que se SUMA al
 * del jugador. Nunca es total: el jugador siempre tiene autoridad final, y si
 * contravolantea a propósito en contra (feint / transición) la asistencia se
 * hace a un lado.
 */
export function counterSteerAssist(
  car: CarState,
  spec: CarSpec,
  input: InputState,
  level: AssistLevel,
): number {
  if (car.speed < 6) return 0;

  const signedDrift = car.driftAngleSigned;
  // Un piloto sostiene contravolante proporcional al ángulo de derrape,
  // más un término amortiguador sobre la velocidad de guiñada.
  const ideal = clamp(
    signedDrift * 0.85 - car.yawRate * 0.12,
    -spec.maxSteerAngle,
    spec.maxSteerAngle,
  );

  const k = COUNTER_GAIN[level];
  // input.steer: +1 = derecha → ángulo de rueda negativo (ver CarPhysics).
  const playerSteerAngle = -input.steer;
  const opposes = Math.sign(playerSteerAngle) === -Math.sign(ideal) && Math.abs(input.steer) > 0.35;
  if (opposes) return ideal * k * 0.25;
  // Pilar 1: si el jugador suelta todo, el auto se endereza solo en ~1.2 s.
  // Es el equivalente al autocentrado del volante, y es lo que hace que
  // mantener el drift se sienta como balancear y no como pelear.
  const released = Math.abs(input.steer) < 0.05;
  return ideal * k * (released ? 2.1 : 1);
}

/**
 * Anti-trompo: torque de guiñada correctivo cuando el ángulo se pasa de rosca.
 * Devuelve N·m (ya escalado por la inercia del auto).
 */
export function antiSpinTorque(car: CarState, spec: CarSpec, level: AssistLevel): number {
  const threshold = SPIN_THRESHOLD[level];
  if (car.driftAngle <= threshold || car.speed < 2.5) return 0;
  const excess = car.driftAngle - threshold;
  const cap = SPIN_CAP[level];
  const magnitude = Math.min(excess * 9 * spec.inertiaYaw, cap * spec.inertiaYaw);
  return Math.sign(car.driftAngleSigned) * magnitude;
}

/**
 * Amortiguación extra de guiñada cuando el ángulo se pasa. El torque correctivo
 * solo no alcanza contra los ~8.000 N·m de la goma trasera; matar la rotación
 * directamente sí. Es lo que hace que el trompo requiera una cagada grande.
 */
const SPIN_DAMP: Record<AssistLevel, number> = { casual: 5.5, standard: 4.3, pro: 1.6 };

export function spinDampingMultiplier(car: CarState, level: AssistLevel): number {
  const threshold = SPIN_THRESHOLD[level];
  const t = smoothstep(threshold - DEG(25), threshold + DEG(20), car.driftAngle);
  return 1 + t * SPIN_DAMP[level];
}

/**
 * Grip de rescate: casi parado y de costado, el grip trasero sube para que el
 * auto se enderece rápido. Nada peor que quedarse patinando en el lugar.
 */
export function rescueGripMultiplier(car: CarState, dt: number): number {
  if (car.speed < 5 && car.driftAngle > DEG(35)) {
    car.rescueTimer = 0.5;
  } else if (car.rescueTimer > 0) {
    car.rescueTimer -= dt;
  }
  return car.rescueTimer > 0 ? 1.6 : 1.0;
}

/** Solo en Casual: recorta el acelerador si el ángulo se va de control. */
export function throttleAssist(car: CarState, throttle: number, level: AssistLevel): number {
  if (level !== 'casual') return throttle;
  if (car.driftAngle > DEG(75) && throttle > 0.7) return 0.7;
  return throttle;
}

export { normalizeAngle };
