/**
 * Perfiles de manejo por modo de juego.
 *
 * Es el mismo modelo de física en los dos modos — no hay dos autos distintos —
 * pero un juego de tráfico y uno de drift piden sensaciones opuestas: en la
 * autopista querés un auto plantado que va a donde apuntás a 200 km/h, y en el
 * circuito querés que el tren trasero se suelte y se pueda sostener. Todo eso
 * sale de reescalar un puñado de constantes de goma y de guiñada.
 */
export interface HandlingProfile {
  /** Escala del grip trasero. */
  rearGrip: number;
  /** Escala del grip delantero. */
  frontGrip: number;
  /** Cuánto cae la goma pasado el pico. 0 = meseta (nunca se suelta de golpe). */
  falloffScale: number;
  /** Escala de la amortiguación de guiñada. */
  yawDamp: number;
  /** Escala de la pérdida de ángulo de dirección con la velocidad. */
  steerFalloff: number;
  /**
   * Autoalineación: torque que apunta el auto hacia su propia velocidad, en
   * múltiplos de la inercia. Es la estabilidad "de arcade" que hace que el auto
   * no se cruce solo a alta velocidad.
   */
  selfAlign: number;
  /** Si el freno de mano suelta el tren trasero. */
  handbrake: boolean;
}

export const HANDLING: Record<'drift' | 'traffic', HandlingProfile> = {
  // Drift: el tren trasero se suelta, pero con algo de meseta en la goma para
  // que la pérdida sea progresiva y se pueda sostener. La queja de que "el
  // manejo es raro" venía de una caída demasiado abrupta pasado el pico.
  drift: {
    rearGrip: 1,
    frontGrip: 1.04,
    falloffScale: 0.82,
    yawDamp: 1.12,
    steerFalloff: 1,
    selfAlign: 0.5,
    handbrake: true,
  },
  // Tráfico: plantado. Se esquiva con reflejos, no peleando el auto.
  traffic: {
    rearGrip: 1.26,
    frontGrip: 1.14,
    falloffScale: 0.35,
    yawDamp: 2.3,
    steerFalloff: 1.9,
    selfAlign: 4.2,
    handbrake: false,
  },
};

export type DriveMode = keyof typeof HANDLING;
