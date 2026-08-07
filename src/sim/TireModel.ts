/**
 * Curva de neumático. No es Pacejka completa a propósito: esta versión es
 * monótona hasta el pico, estable, y tiene un `falloff` explícito — que es la
 * perilla que decide si un auto es drifteable o castigador.
 */
export function tireForceNormalized(slipAngle: number, stiffness: number, falloff: number): number {
  const x = stiffness * slipAngle;
  const base = Math.tanh(x);
  // Después del pico (|x| > 1.4) el grip decae hacia un piso controlado por falloff.
  const over = Math.max(0, Math.abs(x) - 1.4);
  const decay = 1 - falloff * (1 - Math.exp(-over * 0.55));
  return base * decay;
}

/** Interpola la curva de torque (pares [rpm, N·m] ordenados). */
export function sampleTorqueCurve(curve: [number, number][], rpm: number): number {
  if (curve.length === 0) return 0;
  if (rpm <= curve[0][0]) return curve[0][1];
  const last = curve[curve.length - 1];
  if (rpm >= last[0]) return last[1];
  for (let i = 1; i < curve.length; i++) {
    const [r1, t1] = curve[i];
    if (rpm <= r1) {
      const [r0, t0] = curve[i - 1];
      const t = (rpm - r0) / (r1 - r0);
      return t0 + (t1 - t0) * t;
    }
  }
  return last[1];
}
