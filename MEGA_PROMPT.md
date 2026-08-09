# MEGA PROMPT — "NEON APEX" (working title)

## Juego de drift arcade, cámara aérea, mapa ciudad, con capa tycoon de garage

> **Cómo usar este documento:** esto es el brief completo para el developer (humano o
> agente). Está escrito para poder ser pegado entero como prompt de implementación, o
> leído sección por sección durante el desarrollo. Todo número que aparece acá es un
> **valor inicial de tuning, no una constante sagrada**: se espera que se ajuste con
> playtesting, pero se arranca exactamente con estos valores para tener una base
> reproducible.
>
> **Revisión 2 — qué cambió respecto de este documento.** El juego se construyó a partir
> de este brief y después se rehizo con feedback de jugador. Tres secciones ya NO
> describen la implementación:
>
> - **§7 Cámara aérea → tercera persona.** La cámara es de persecución (6.6 m atrás,
>   2.35 m de alto, FOV que abre con la velocidad). Lo que se conservó es el principio:
>   el rumbo sigue el vector velocidad, no el yaw, para que el drift se lea. Ver
>   `src/render/CameraRig.ts`.
> - **§13 Capa tycoon → borrada entera.** Sin ingreso pasivo, sponsors, staff, salas,
>   bahías, ganancias offline ni prestige. La plata sale de driftear y de nada más, con
>   un multiplicador de estilo que premia manejar bien. Ver §13-bis abajo y
>   `src/meta/Economy.ts`.
> - **§10 Estética nocturna de neón → atardecer.** Cielo ámbar a violeta, sombras largas,
>   separación de superficies por tono.
>
> **Revisión 3.** Además:
>
> - **§9 pasa a ser el mapa 2.** El primero es ahora un circuito cerrado de drift
>   ("Escuela Apex"), generado con `r(θ) = R0 + A1·sin(2θ) + A2·sin(3θ)`: una pista
>   cerrada y suave por construcción, con curvatura variable, muros de goma al borde y
>   nada que te choque de frente. Los circuitos se desbloquean con reputación. Ver
>   `src/data/maps/circuit.ts` y `src/data/maps/index.ts`.
> - **§5.7 aflojó.** El contravolante asistido subió a 0.6 (estándar), el `falloff` de
>   todo el roster bajó ~0.08 y la ventana que puntúa se abrió a 10°–105° con 1.6 s de
>   gracia. Driftear tenía que enganchar antes.
> - **§10 texturas.** Todo procedural en canvas: asfalto con árido y fisuras, hormigón
>   con juntas, pasto, tierra, fachadas con grilla de ventanas y UV escaladas por el
>   tamaño real de cada instancia. Ver `src/render/Textures.ts`.
>
> El resto del documento (física, scoring, arquitectura) sigue vigente.
>
> **Regla legal innegociable:** el juego se inspira en el *feel* y en las ideas de diseño
> de Drift Legends y CarX Drift Racing. **No se usa ni un solo asset, modelo, textura,
> sonido, logo, nombre de auto, nombre de marca, fuente, ni pista de esos juegos.** Todos
> los autos son diseños originales con nombres inventados. Todos los assets son
> generados proceduralmente, hechos a mano en este proyecto, o de licencia libre con
> atribución documentada en `CREDITS.md`. Ver §23.

---

# ÍNDICE

0. [Pitch en 60 segundos](#0-pitch-en-60-segundos)
1. [Rol, objetivo y criterios de éxito](#1-rol-objetivo-y-criterios-de-éxito)
2. [Stack técnico](#2-stack-técnico)
3. [Pilares de diseño](#3-pilares-de-diseño)
4. [Los tres loops de juego](#4-los-tres-loops-de-juego)
5. [Física del auto (el corazón del juego)](#5-física-del-auto-el-corazón-del-juego)
6. [Input y controles](#6-input-y-controles)
7. [Cámara aérea](#7-cámara-aérea)
8. [Sistema de puntuación y combo](#8-sistema-de-puntuación-y-combo)
9. [Mapa 1 — la ciudad](#9-mapa-1--la-ciudad)
10. [Dirección de arte](#10-dirección-de-arte)
11. [VFX](#11-vfx)
12. [Audio](#12-audio)
13. [CAPA TYCOON — Garage Empire](#13-capa-tycoon--garage-empire)
14. [Economía y progresión](#14-economía-y-progresión)
15. [Tuning del auto](#15-tuning-del-auto)
16. [Roster de autos](#16-roster-de-autos)
17. [UI / UX / HUD](#17-ui--ux--hud)
18. [Modos de juego](#18-modos-de-juego)
19. [Guardado y esquemas de datos](#19-guardado-y-esquemas-de-datos)
20. [Arquitectura de código](#20-arquitectura-de-código)
21. [Performance](#21-performance)
22. [Roadmap por milestones con criterios de aceptación](#22-roadmap-por-milestones-con-criterios-de-aceptación)
23. [Legal, originalidad y anti-patrones](#23-legal-originalidad-y-anti-patrones)
24. [Definition of Done](#24-definition-of-done)
25. [Apéndices: tablas de constantes](#25-apéndices-tablas-de-constantes)

---

# 0. Pitch en 60 segundos

**NEON APEX** es un juego de drift arcade de cámara aérea. Manejás un auto de tracción
trasera por una ciudad nocturna abierta, y cada derrape que mantenés suma puntos: cuanto
más ángulo, más velocidad y más cerca de las paredes, más multiplicador. Soltar el drift
"cobra" (banking) los puntos acumulados; chocar los pierde.

La vuelta de tuerca es la **capa tycoon**: los puntos de drift no son solo un score, son
**Hype**. El Hype atrae sponsors, y los sponsors pagan **por segundo, incluso mientras no
estás manejando**. Con esa plata mejorás el garage, contratás staff, comprás bahías,
subís autos de nivel — y cada mejora hace que el próximo run genere más Hype. Es el bucle
de "manejo 3 minutos → mi garage produce mientras tomo café → vuelvo y todo rinde más".

Un run de drift dura 90 segundos. Una sesión de tycoon dura 30 segundos. El juego está
diseñado para que nunca puedas parar en un punto natural.

**Referencias de feel (no de assets):** Drift Legends (simplicidad de control, drift
generoso, scoring legible), CarX (peso del auto, transferencia de masa, sensación de que
el auto "se acuesta" en la curva), Absolute Drift (cámara aérea, minimalismo, mapa como
patio de juegos), Adventure Capitalist / Idle Miner (estructura de la capa tycoon).

---

# 1. Rol, objetivo y criterios de éxito

## 1.1 Tu rol

Sos el developer principal. Construís el juego completo: física, render, UI, economía,
guardado, audio y assets procedurales. No hay artista, no hay diseñador de sonido, no hay
game designer aparte. Todo se resuelve con código, geometría procedural y síntesis.

## 1.2 Objetivo

Un juego jugable en navegador, sin instalación, que corre a 60 FPS en una notebook
integrada de 2019, sin dependencias externas de assets, y que se pueda dejar abierto en
una pestaña como un idle game.

## 1.3 Criterios de éxito (medibles, no opinables)

| # | Criterio | Cómo se verifica |
|---|---|---|
| S1 | Un jugador que nunca jugó un juego de drift logra su primer drift de 3+ segundos en menos de 90 segundos de juego | Playtest con 5 personas, se cronometra |
| S2 | El auto es controlable con **una sola tecla de dirección a la vez** — no requiere contravolante de precisión milimétrica | Se puede completar el circuito tutorial con inputs digitales |
| S3 | 60 FPS estables con 200 props en pantalla, 2000 partículas de humo vivas y 4000 segmentos de marca de goma | Overlay de perf en build de dev |
| S4 | Frame de física determinista: mismo input + misma semilla = mismo resultado | Test automatizado de replay |
| S5 | Un jugador que vuelve después de 8 horas recibe ganancias offline y ve un modal de bienvenida con la cifra | Test manual manipulando el reloj |
| S6 | Save/load robusto: cerrar la pestaña en cualquier momento nunca pierde más de 5 segundos de progreso | Autosave con debounce, test de kill abrupto |
| S7 | Cero requests de red en runtime. El juego funciona con el WiFi apagado | DevTools → Network vacío después de cargar |
| S8 | El bundle total pesa < 3 MB | `du -h dist/` |

---

# 2. Stack técnico

## 2.1 Stack primario (el que se implementa)

- **TypeScript** en modo `strict`. Nada de `any` salvo en boundaries justificados.
- **Three.js** (r160+) para render 3D. La cámara es aérea pero el mundo es 3D real:
  eso da sombras, luces de neón, y permite inclinar el auto (roll/pitch) cuando derrapa,
  que es el 40% de la sensación de peso.
- **Física propia, escrita a mano.** NO usar Rapier, Ammo, Cannon ni Havok para el auto.
  Un motor de física genérico da un drift malo y peleás contra él para siempre. El
  modelo está especificado completo en §5 y es ~400 líneas.
  - Excepción permitida: colisiones estáticas mundo-auto se resuelven con un
    broadphase de grid uniforme + narrowphase SAT sobre OBBs. También propio, ~200 líneas.
- **Vite** como bundler y dev server.
- **Web Audio API** para todo el audio, sintetizado en runtime. Sin archivos de audio.
- **Canvas 2D** para el HUD y la UI (overlay), o DOM+CSS para menús complejos.
  Recomendación: **DOM + CSS para menús/tycoon** (mucho más rápido de iterar, accesible,
  scrollable) y **Canvas/WebGL para el HUD in-game** (0 layout thrash durante el run).
- **localStorage** para el save, con IndexedDB como fallback si el save supera 4 MB.
- **Sin backend.** Sin cuentas, sin login, sin telemetría remota. Todo local.

## 2.2 Dependencias permitidas

```
three           ^0.160
typescript      ^5.4
vite            ^5.0
vitest          ^1.0   (tests)
```

Nada más. Si necesitás una utilidad (easing, seeded RNG, pooling, quadtree), la escribís
en `src/lib/`. Son 30 líneas cada una y evitan 200 KB de bundle.

## 2.3 Stack alternativo (si el proyecto migra a nativo)

Si en algún momento se porta a mobile nativo: **Unity 6 + URP**, física del auto igual de
custom (no WheelCollider — WheelCollider da un drift horrible), scriptable objects para
los datos de autos/upgrades, Addressables para los mapas. La arquitectura de este
documento (§20) está pensada para ser portable: la capa `sim/` no toca Three.js.

## 2.4 Targets

| Plataforma | Resolución | FPS objetivo | Notas |
|---|---|---|---|
| Desktop web | 1920×1080 | 60 | Target principal |
| Desktop web (integrada vieja) | 1280×720 | 60 | Con calidad "Media" |
| Mobile web | 844×390 (landscape) | 60 | Controles touch, calidad "Baja", DPR capado a 2 |
| Tablet | 1180×820 | 60 | |

Portrait no se soporta: se muestra un overlay "girá el dispositivo".

---

# 3. Pilares de diseño

Cuando haya una decisión ambigua durante el desarrollo, se resuelve con estos cuatro
pilares, en orden de prioridad. El pilar 1 gana sobre el 2, el 2 sobre el 3, etc.

### Pilar 1 — El drift se sostiene solo

El auto quiere derrapar. Una vez que rompiste tracción trasera, mantener el drift debe
sentirse como **balancear**, no como **pelear**. Si el jugador suelta todos los controles
en medio de un drift, el auto se endereza suavemente en ~1.2 s sin trompear.

Consecuencia práctica: hay una **asistencia de contravolante** (§5.7) que siempre está
activa, incluso en la dificultad más alta. En la dificultad alta es más débil, nunca cero.

### Pilar 2 — Legibilidad desde arriba

Cámara aérea significa que el jugador ve poco del auto y mucho del mundo. Todo tiene que
leerse desde arriba: el ángulo del auto, la dirección de las ruedas, la velocidad, dónde
termina la calle, dónde hay un muro. Se usan **contornos, sombras proyectadas y color**,
no detalle de textura.

Consecuencia práctica: los autos tienen un **techo de color saturado y único**, y una
sombra dura debajo. Las paredes tienen un borde superior de color claro. El asfalto es
oscuro y de bajo contraste para que las marcas de goma y el humo destaquen.

### Pilar 3 — Todo run vale algo

Nunca un run termina con cero. Aunque choques 5 veces, te llevás Hype, XP y algo de
plata. La penalidad de un choque es **perder el combo**, no perder la sesión. No hay
game over. No hay "run fallido".

### Pilar 4 — El garage siempre está laburando

En cualquier momento que el jugador abra el juego, tiene algo que cobrar y algo que
mejorar. El costo de la próxima mejora relevante nunca está a más de ~2 runs o ~8 minutos
de idle de distancia.

---

# 4. Los tres loops de juego

## 4.1 Loop momento a momento (2–8 segundos)

```
Entrás a la curva rápido
  → tocás handbrake o hacés un feint (contravolante rápido)
  → el tren trasero se suelta
  → contravolanteás y modulás acelerador
  → el multiplicador sube mientras el ángulo se mantiene en la ventana buena
  → pasás cerca de un muro/columna → bonus de proximidad
  → salís del drift limpio → BANK: los puntos entran al total
```

**Feedback en cada paso:** el HUD reacciona en el mismo frame. El multiplicador pulsa. El
humo se intensifica. El pitch del motor cambia. La cámara se aleja un poco. Nada tiene
más de 50 ms de latencia percibida.

## 4.2 Loop de sesión (60–180 segundos)

```
Elegís modo (Free Roam / Contrato / Time Attack)
  → run de 90 s
  → resumen: Puntos, Hype ganado, $ ganado, XP, estrellas del contrato
  → 1 tap → volver al garage
```

## 4.3 Loop meta / tycoon (días)

```
Hype ganado en el run → sube el nivel de Hype global
  → el Hype global desbloquea sponsors
  → sponsors generan $/segundo (también offline, hasta un tope)
  → $ se gasta en: upgrades del auto, bahías del garage, staff, autos nuevos
  → upgrades → más Hype por run → más sponsors → ...
  → cuando la curva se aplana: PRESTIGE ("Vender el imperio") → Legacy Points → bonus permanentes
```

---

# 5. Física del auto (el corazón del juego)

Esta es la sección más importante del documento. Si esto está bien, el juego es bueno
aunque todo lo demás sea feo. Si está mal, no lo salva nada.

## 5.1 Principios del modelo

- Modelo de **bicicleta de 2 ejes** en el plano XZ (mundo 3D, física 2D + visual roll/pitch).
- Fuerzas laterales por eje con una **curva de slip tipo Pacejka simplificada**, saturada.
- **Transferencia de peso** longitudinal y lateral que modula el grip disponible por eje.
- Todo en **SI**: metros, kilos, newtons, segundos, radianes. La UI convierte a km/h.
- **Timestep fijo de 1/120 s** con acumulador. El render interpola entre estados.
- Determinista: sin `Math.random()` en la sim (usar RNG con semilla), sin dependencia de `dt` variable.

## 5.2 Estado del auto

```ts
interface CarState {
  // Mundo (plano XZ, Y es arriba)
  pos: Vec2;            // m
  vel: Vec2;            // m/s, en espacio mundo
  yaw: number;          // rad, 0 = +Z
  yawRate: number;      // rad/s

  // Tren motriz
  rpm: number;          // rev/min
  gear: number;         // -1 = R, 0 = N, 1..6
  wheelSpeedRear: number; // m/s equivalente en el contacto (para slip ratio)
  clutchEngaged: number;  // 0..1

  // Derivados (recalculados cada tick, expuestos para HUD/VFX/score)
  speed: number;        // m/s, |vel|
  slipAngleFront: number;
  slipAngleRear: number;
  driftAngle: number;   // rad, ángulo entre yaw y dirección de velocidad
  lateralG: number;
  isDrifting: boolean;
  rearSlipVelocity: number; // m/s, cuánto patina la goma trasera (para humo/marcas)
  frontSlipVelocity: number;

  // Visual (no afecta sim)
  visualRoll: number;   // rad
  visualPitch: number;  // rad
  steerVisual: number;  // rad, ángulo visible de las ruedas delanteras
}
```

## 5.3 Parámetros del auto (los que definen cada modelo del roster)

```ts
interface CarSpec {
  // Chasis
  mass: number;              // kg          [ej. 1250]
  inertiaYaw: number;        // kg·m²       [ej. 1600]
  lengthFront: number;       // m, CG→eje delantero  [ej. 1.20]
  lengthRear: number;        // m, CG→eje trasero    [ej. 1.40]
  trackWidth: number;        // m, ancho de vía      [ej. 1.55]
  cgHeight: number;          // m           [ej. 0.52]

  // Neumáticos
  tireStiffnessFront: number;  // "B" de la curva  [ej. 11.0]
  tireStiffnessRear: number;   //                  [ej. 9.5]
  peakGripFront: number;       // μ           [ej. 1.55]
  peakGripRear: number;        // μ           [ej. 1.38]
  tireFalloff: number;         // cuánto cae el grip después del pico, 0..1 [ej. 0.35]

  // Motor / transmisión
  torqueCurve: [number, number][];  // [rpm, N·m] — se interpola linealmente
  redline: number;           // rpm         [ej. 7200]
  idleRpm: number;           // rpm         [ej. 900]
  gearRatios: number[];      // [3.55, 2.05, 1.45, 1.00, 0.82, 0.68]
  finalDrive: number;        // [ej. 3.90]
  drivetrainEfficiency: number; // [0.88]
  wheelRadius: number;       // m [0.33]
  engineBrakeTorque: number; // N·m a redline con acelerador cero [ej. 90]

  // Dirección
  maxSteerAngle: number;     // rad [ej. 0.62 ≈ 35.5°]
  steerSpeed: number;        // rad/s de cambio del volante [ej. 4.5]
  steerReturnSpeed: number;  // rad/s al soltar [ej. 6.5]
  steerSpeedFalloff: number; // reduce el steer máximo a alta velocidad [ej. 0.55]

  // Frenos
  brakeTorqueFront: number;  // N·m [ej. 2400]
  brakeTorqueRear: number;   // N·m [ej. 1400]
  handbrakeGripMultiplier: number; // multiplica μ trasero al usar handbrake [ej. 0.30]

  // Aero / resistencias
  dragCoefficient: number;   // 0.5·ρ·Cd·A, resultado en N/(m/s)² [ej. 0.42]
  rollingResistance: number; // N/(m/s) [ej. 12.0]
  downforceCoefficient: number; // N/(m/s)² [ej. 0.05]
}
```

## 5.4 Curva de neumático

No usar Pacejka completa (5 coeficientes mágicos). Usar esta versión, que es monótona,
estable, y **tiene un falloff controlable** — que es lo que define si el auto es
"drifteable" o no.

```ts
/**
 * Fuerza lateral normalizada dado el ángulo de deriva.
 * @param slipAngle  rad
 * @param stiffness  B — pendiente inicial, "cuán rápido agarra"
 * @param falloff    0 = meseta (grip constante después del pico, muy arcade/perdonador)
 *                   1 = cae fuerte (realista, castigador)
 * @returns          -1..1, se multiplica por μ·Fz
 */
function tireForceNormalized(slipAngle: number, stiffness: number, falloff: number): number {
  const x = stiffness * slipAngle;
  // Curva base: satura suavemente en ±1
  const base = Math.tanh(x);
  // Falloff: después del pico (|x| > 1.4) el grip decae hacia un piso
  const over = Math.max(0, Math.abs(x) - 1.4);
  const decay = 1 - falloff * (1 - Math.exp(-over * 0.55));
  return base * decay;
}
```

**Este `falloff` es la perilla más importante del juego.** Valores:

| falloff | Sensación | Uso |
|---|---|---|
| 0.10 | El auto se queda derrapando solo, casi imposible trompear | Autos de "escuela", nivel 1 |
| 0.35 | Drift generoso pero controlable — **DEFAULT** | Mayoría del roster |
| 0.55 | Requiere modular acelerador, trompea si te pasás | Autos tier alto |
| 0.75 | Simulación cruda | Solo modo "Pro", nunca default |

## 5.5 El tick de física, paso a paso

Orden exacto de operaciones. No cambiarlo — el orden importa para la estabilidad.

```ts
const DT = 1 / 120;

function stepPhysics(car: CarState, spec: CarSpec, input: Input, dt: number) {

  // ─── 1. DIRECCIÓN ───────────────────────────────────────────────────────
  // El steer máximo baja con la velocidad para que no sea nervioso a 200 km/h
  const speedFactor = 1 / (1 + spec.steerSpeedFalloff * car.speed / 25);
  const targetSteer = input.steer * spec.maxSteerAngle * speedFactor;

  // Asistencia de contravolante (ver §5.7) — se suma al input del jugador
  const assist = counterSteerAssist(car, spec, input);
  const desiredSteer = clamp(targetSteer + assist, -spec.maxSteerAngle, spec.maxSteerAngle);

  const steerRate = (Math.abs(input.steer) > 0.05) ? spec.steerSpeed : spec.steerReturnSpeed;
  car.steerVisual = moveTowards(car.steerVisual, desiredSteer, steerRate * dt);
  const steer = car.steerVisual;

  // ─── 2. VELOCIDAD EN ESPACIO LOCAL ──────────────────────────────────────
  // vLong = hacia adelante, vLat = hacia la izquierda del auto
  const cos = Math.cos(car.yaw), sin = Math.sin(car.yaw);
  const vLong =  car.vel.x * sin + car.vel.z * cos;
  const vLat  =  car.vel.x * cos - car.vel.z * sin;

  // ─── 3. ÁNGULOS DE DERIVA POR EJE ───────────────────────────────────────
  // Se agrega un epsilon al denominador para evitar explosión a baja velocidad
  const vSafe = Math.max(Math.abs(vLong), 1.5);
  const slipFront = Math.atan2(vLat + car.yawRate * spec.lengthFront, vSafe) - steer * Math.sign(vLong);
  const slipRear  = Math.atan2(vLat - car.yawRate * spec.lengthRear,  vSafe);
  car.slipAngleFront = slipFront;
  car.slipAngleRear  = slipRear;

  // ─── 4. CARGA VERTICAL Y TRANSFERENCIA DE PESO ──────────────────────────
  const L = spec.lengthFront + spec.lengthRear;
  const weight = spec.mass * 9.81;
  const staticFront = weight * spec.lengthRear / L;
  const staticRear  = weight * spec.lengthFront / L;

  // Transferencia longitudinal por aceleración/frenado (usa la acel. del tick anterior)
  const transferLong = spec.mass * car._prevAccelLong * spec.cgHeight / L;
  // Downforce (reparte 50/50)
  const downforce = spec.downforceCoefficient * car.speed * car.speed;

  let FzFront = Math.max(0, staticFront - transferLong + downforce * 0.5);
  let FzRear  = Math.max(0, staticRear  + transferLong + downforce * 0.5);

  // ─── 5. FUERZAS LATERALES ───────────────────────────────────────────────
  let gripRear = spec.peakGripRear;
  if (input.handbrake) gripRear *= spec.handbrakeGripMultiplier;
  // El acelerador a fondo también consume grip lateral trasero (friction circle simplificado)
  const throttleGripLoss = 1 - 0.28 * input.throttle * (car.gear > 0 ? 1 : 0);
  gripRear *= throttleGripLoss;

  const FyFront = -tireForceNormalized(slipFront, spec.tireStiffnessFront, spec.tireFalloff)
                  * spec.peakGripFront * FzFront;
  const FyRear  = -tireForceNormalized(slipRear,  spec.tireStiffnessRear,  spec.tireFalloff)
                  * gripRear * FzRear;

  // ─── 6. FUERZA LONGITUDINAL ─────────────────────────────────────────────
  const engineTorque = sampleTorqueCurve(spec.torqueCurve, car.rpm) * input.throttle;
  const ratio = spec.gearRatios[car.gear - 1] ?? 0;
  const driveForce = (car.gear > 0)
    ? engineTorque * ratio * spec.finalDrive * spec.drivetrainEfficiency / spec.wheelRadius
    : 0;

  const engineBrake = (1 - input.throttle) * spec.engineBrakeTorque
                      * (car.rpm / spec.redline) * ratio * spec.finalDrive / spec.wheelRadius;

  const brakeForce = input.brake * (spec.brakeTorqueFront + spec.brakeTorqueRear) / spec.wheelRadius;
  const handbrakeForce = input.handbrake ? spec.brakeTorqueRear * 1.6 / spec.wheelRadius : 0;

  const drag = spec.dragCoefficient * vLong * Math.abs(vLong);
  const rolling = spec.rollingResistance * vLong;

  let FxTotal = driveForce
              - Math.sign(vLong) * (brakeForce + handbrakeForce + engineBrake)
              - drag - rolling;

  // A velocidad casi nula sin acelerador, frenar del todo (evita el "crawl" infinito)
  if (Math.abs(vLong) < 0.3 && input.throttle < 0.05) {
    FxTotal = 0;
    car.vel.x *= 0.85; car.vel.z *= 0.85;
  }

  // ─── 7. INTEGRACIÓN ─────────────────────────────────────────────────────
  const FyTotalLocal = FyFront * Math.cos(steer) + FyRear;

  // Ecuaciones en el marco del cuerpo, que ROTA con el auto:
  //    v̇_long = Fx/m + ψ̇·v_lat
  //    v̇_lat  = Fy/m − ψ̇·v_long
  // Los dos términos con ψ̇ vienen de derivar los versores del marco. Van los
  // DOS o ninguno (ver la nota de abajo).
  const specificLong = FxTotal / spec.mass;          // lo que mediría un acelerómetro
  const accelLong = specificLong + car.yawRate * vLat;
  const accelLat  = FyTotalLocal / spec.mass - car.yawRate * vLong;

  // La transferencia de peso usa la fuerza real sobre el chasis, no el término
  // del marco rotante.
  car._prevAccelLong = specificLong;

  const newVLong = vLong + accelLong * dt;
  const newVLat  = vLat  + accelLat  * dt;

  // Torque de guiñada
  const torqueYaw = FyFront * Math.cos(steer) * spec.lengthFront - FyRear * spec.lengthRear;
  // Amortiguación de guiñada — CRÍTICO para que no oscile. Sin esto el auto tiembla.
  const yawDamping = -car.yawRate * spec.inertiaYaw * 0.55;
  car.yawRate += (torqueYaw + yawDamping) / spec.inertiaYaw * dt;
  car.yaw += car.yawRate * dt;

  // De vuelta a mundo
  const c2 = Math.cos(car.yaw), s2 = Math.sin(car.yaw);
  car.vel.x = newVLong * s2 + newVLat * c2;
  car.vel.z = newVLong * c2 - newVLat * s2;

  car.pos.x += car.vel.x * dt;
  car.pos.z += car.vel.z * dt;

  // ─── 8. DERIVADOS ───────────────────────────────────────────────────────
  car.speed = Math.hypot(car.vel.x, car.vel.z);
  car.driftAngle = (car.speed > 2)
    ? Math.abs(normalizeAngle(Math.atan2(car.vel.x, car.vel.z) - car.yaw))
    : 0;
  car.lateralG = accelLat / 9.81;
  car.rearSlipVelocity  = Math.abs(Math.sin(slipRear))  * car.speed;
  car.frontSlipVelocity = Math.abs(Math.sin(slipFront)) * car.speed;
  car.isDrifting = car.driftAngle > DEG(10) && car.speed > 8;

  // ─── 9. MOTOR Y CAJA ────────────────────────────────────────────────────
  updateDrivetrain(car, spec, input, dt);

  // ─── 10. VISUAL (no afecta la sim) ──────────────────────────────────────
  const targetRoll  = clamp(-car.lateralG * 0.055, -0.11, 0.11);   // se acuesta en la curva
  const targetPitch = clamp(-accelLong * 0.006, -0.05, 0.05);      // cabecea al frenar
  car.visualRoll  = damp(car.visualRoll,  targetRoll,  9.0, dt);
  car.visualPitch = damp(car.visualPitch, targetPitch, 9.0, dt);
}
```

**Nota sobre los dos términos con `yawRate` (los dos bugs #1 del modelo de bicicleta):**

- Si te olvidás de `- car.yawRate * vLong` en `accelLat`, el auto camina en línea recta
  mientras rota: nunca dobla de verdad. Es el error que todo el mundo comete primero.
- Si te olvidás de `+ car.yawRate * vLat` en `accelLong`, el modelo **inventa energía**:
  el auto acelera solo mientras derrapa. Es más difícil de ver porque a primera vista se
  siente "rápido y divertido", hasta que notás que un drift sostenido sin acelerador te
  lleva de 80 a 200 km/h. Este error pasó desapercibido en la primera implementación de
  este mismo documento y solo apareció con el test de "no inventa energía" (§20.3).

La forma de detectarlo: derrapá sin acelerador y mirá la velocidad. Tiene que bajar
siempre. Un test automatizado que lo verifique vale más que diez horas de tuneo a ojo.

## 5.6 Motor y caja de cambios

```ts
function updateDrivetrain(car, spec, input, dt) {
  if (car.gear > 0) {
    // RPM derivado de la velocidad de rueda (caja "conectada", sin embrague real)
    const ratio = spec.gearRatios[car.gear - 1] * spec.finalDrive;
    const vLong = car.vel.x * Math.sin(car.yaw) + car.vel.z * Math.cos(car.yaw);
    const targetRpm = Math.abs(vLong) / spec.wheelRadius * ratio * 60 / (2 * Math.PI);
    car.rpm = damp(car.rpm, clamp(targetRpm, spec.idleRpm, spec.redline * 1.02), 14, dt);
  } else {
    car.rpm = damp(car.rpm, spec.idleRpm + input.throttle * 4500, 6, dt);
  }

  // Cambios automáticos (default). Manual disponible en opciones.
  if (car.shiftCooldown > 0) { car.shiftCooldown -= dt; return; }

  const upAt   = spec.redline * 0.93;
  const downAt = spec.redline * 0.42;
  if (car.rpm > upAt && car.gear < spec.gearRatios.length) {
    car.gear++; car.shiftCooldown = 0.22;
  } else if (car.rpm < downAt && car.gear > 1) {
    car.gear--; car.shiftCooldown = 0.18;
  }
}
```

**Corte de acelerador en el cambio:** durante `shiftCooldown` el `driveForce` se
multiplica por 0. Eso genera un microtransfer de peso hacia adelante que **ayuda a iniciar
el drift** — es un truco real y se siente muy bien. Documentarlo, no "arreglarlo".

## 5.7 Asistencias (lo que hace que el juego sea jugable)

Todas las asistencias son **modificaciones al input o a la sim**, nunca teleports ni
correcciones de posición. Se exponen en Opciones con 3 presets: **Casual / Estándar / Pro**.

### 5.7.1 Asistencia de contravolante

```ts
function counterSteerAssist(car, spec, input): number {
  if (car.speed < 6) return 0;
  const signedDrift = normalizeAngle(Math.atan2(car.vel.x, car.vel.z) - car.yaw);
  // Cuánto contravolante "querría" un piloto
  const ideal = clamp(-signedDrift * 0.85 - car.yawRate * 0.12, -spec.maxSteerAngle, spec.maxSteerAngle);
  // Fuerza de la asistencia según preset
  const k = { casual: 0.75, standard: 0.42, pro: 0.18 }[settings.assistLevel];
  // La asistencia se DESVANECE si el jugador está metiendo steer en contra a propósito
  const playerOpposes = Math.sign(input.steer) === -Math.sign(ideal) && Math.abs(input.steer) > 0.35;
  return ideal * k * (playerOpposes ? 0.25 : 1);
}
```

Puntos clave:
- Nunca es 1.0. El jugador siempre tiene autoridad final.
- Si el jugador contravolantea en contra (para hacer un feint o un transition), la
  asistencia se hace a un lado. Esto es lo que permite que jugadores buenos hagan cosas
  avanzadas sin que el juego los pelee.

### 5.7.2 Anti-trompo

Dos mecanismos, porque **uno solo no alcanza**:

1. **Torque correctivo:** si `driftAngle > 100°` y `speed > 2.5 m/s`, un torque de guiñada
   proporcional a `(driftAngle - 100°)`, capado a `3.2 * inertiaYaw` N·m.
2. **Amortiguación progresiva de guiñada:** a partir de `100° - 25°` la amortiguación se
   multiplica hasta ×4.4, con `smoothstep`.

Los números importan: el torque de guiñada de la goma trasera en pleno derrape ronda los
**8.000 N·m**. Un cap "conservador" de `0.35 * inertiaYaw` (≈550 N·m) es el 7% de eso y no
frena absolutamente nada — el auto trompea igual y el jugador siente que la asistencia no
existe. Calculá siempre el torque de la goma antes de elegir el cap.

Presets: Casual `cap 4.5 / damp ×5 / umbral 95°`, Estándar `3.2 / ×3.4 / 100°`,
Pro `1.4 / ×1.3 / 125°`.

**Qué pasa si igual trompeás:** el auto termina rodando marcha atrás y eso está bien —
es una penalidad justa, se pierde el combo, y se sale acelerando. No hay que "arreglarlo".

### 5.7.3 Asistencia de acelerador (solo Casual)

En Casual, si el `driftAngle` supera 75° y el jugador tiene el acelerador a fondo, el
throttle efectivo se reduce a 0.7 durante ese frame. Evita el trompo por sobreacelerar.

### 5.7.4 Grip de rescate

Si el auto está por debajo de 4 m/s y con más de 40° de deriva (o sea, casi parado y de
costado), el grip trasero sube 60% durante 0.5 s para que el auto se enderece y el jugador
salga rápido. Nada peor que quedarse patinando en el lugar.

## 5.8 Colisiones

- **Broadphase:** grid uniforme de celdas de 8 m sobre todo el mapa. Cada obstáculo
  estático se registra en las celdas que toca al cargar el nivel. El auto consulta las 9
  celdas alrededor.
- **Narrowphase:** SAT entre el OBB del auto (4.3 × 1.8 m típico) y OBBs/AABBs de los
  obstáculos.
- **Respuesta:**
  ```
  penetración → se empuja el auto fuera por el eje de mínima penetración
  vNormal = vel · n
  if (vNormal < 0):
     vel -= n * vNormal * (1 + restitution)      // restitution = 0.25
     vel *= 0.92                                  // pérdida de energía tangencial
     yawRate *= 0.55                              // el choque mata la rotación
  ```
- **Clasificación de impacto** (para el score y el audio):
  - `scrape`: |vNormal| < 3 m/s → NO rompe el combo, resta 15% del multiplicador actual,
    chispas, sonido de raspón. **Esto es intencional: raspar la pared es una técnica.**
  - `hit`: 3–9 m/s → rompe el combo, banking parcial (se cobra el 40% de lo acumulado).
  - `crash`: > 9 m/s → rompe el combo, se pierde lo acumulado, shake fuerte, 0.6 s de
    control reducido.
- **Objetos destructibles** (conos, carteles, cajas, tachos): no frenan al auto, solo
  aplican -8% de velocidad, salen volando con física simple (rigid body de 1 s de vida,
  con pool de 64), y dan **+50 Hype cada uno**. Reaparecen al reiniciar el run.

## 5.9 Superficies

Cada polígono del mundo tiene un `surfaceId`. La superficie multiplica el grip.

| Superficie | Multiplicador μ | Marca de goma | Humo | Notas |
|---|---|---|---|---|
| `asphalt` | 1.00 | sí, oscura | blanco denso | Default |
| `wet_asphalt` | 0.78 | no | spray fino | Charcos, cerca de la costanera |
| `concrete` | 0.94 | sí, clara | blanco | Estacionamientos, subsuelos |
| `paint` (líneas, cruces peatonales) | 0.86 | leve | leve | Detalle sabroso, pero sutil |
| `grass` | 0.55 | no | marrón/polvo | Plazas — castiga pero no te mata |
| `dirt` | 0.62 | no | marrón denso | Obra en construcción |
| `metal` (rejillas, puentes) | 0.88 | no | chispas | |

Transición de superficie: se interpola el μ efectivo en 0.15 s para que no haya un salto
que descontrole el auto de golpe.

## 5.10 Cómo tunear esto sin volverse loco

Implementar desde el día 1 un **panel de debug** (tecla `` ` ``) con sliders en vivo para
TODOS los campos de `CarSpec`, más:
- Toggle de vectores de fuerza dibujados sobre el auto (Fy front/rear, Fx, velocidad).
- Gráfico en tiempo real de `slipAngleRear` vs fuerza lateral.
- Botón "copiar spec como JSON" para pegar el resultado en el archivo de datos.
- Botón de reset de posición.
- Slow-mo (0.25×) para ver la transición de drift.

Sin esto vas a tardar 10 veces más en llegar a un buen feel.

---

# 6. Input y controles

## 6.1 Mapeo

| Acción | Teclado | Gamepad | Touch |
|---|---|---|---|
| Acelerar | `W` / `↑` | RT (analógico) | Botón derecho, zona grande abajo-derecha |
| Frenar / Reversa | `S` / `↓` | LT (analógico) | Botón izquierdo de la zona derecha |
| Girar izq/der | `A`/`D`, `←`/`→` | Stick izquierdo X | Volante virtual o slider horizontal (opción) |
| Handbrake | `Espacio` | A / X (Xbox/PS) | Botón grande abajo-izquierda |
| Mirar atrás / zoom out | `Shift` | LB | Pinch |
| Reset auto | `R` | Y / △ (hold 0.5 s) | Botón en HUD (hold) |
| Cambiar cámara | `C` | RB | — |
| Pausa | `Esc` | Start | Botón esquina |
| Cambio manual +/- (si activado) | `E` / `Q` | RB / LB | Botones |

## 6.2 Suavizado de input digital

El teclado es binario, el juego necesita analógico. **No mapear directo.**

```ts
// Steer con teclado
const raw = (keyRight ? 1 : 0) - (keyLeft ? 1 : 0);
const attack  = 4.2;  // 1/s — cuán rápido llega a full lock
const release = 7.0;  // 1/s — cuán rápido vuelve a cero
const rate = (raw !== 0 && Math.sign(raw) === Math.sign(steerInput)) ? attack : release;
steerInput = moveTowards(steerInput, raw, rate * dt);
```

**Regla:** con gamepad se usa el valor analógico directo, con deadzone radial de 0.12 y
curva de respuesta `sign(x) * |x|^1.35` (más precisión cerca del centro).

## 6.3 Buffer de input

El handbrake tiene un **buffer de 100 ms**: si lo apretás hasta 100 ms antes de que el
auto llegue a una condición válida, se ejecuta igual. Esto perdona el timing y hace que el
juego se sienta responsive.

## 6.4 Vibración

Gamepad: rumble proporcional a `rearSlipVelocity` (motor de baja frecuencia) y a impactos
(motor de alta frecuencia, pulso de 120 ms). Se puede desactivar.

---

# 7. Cámara

> **Revisión 2:** la cámara es de TERCERA PERSONA, no aérea. Lo de abajo queda como
> registro del diseño original; el principio que sobrevivió es el de §7.2.1 (seguir el
> vector velocidad, no el yaw), que es igual de crítico en persecución: con 28% de sesgo
> hacia el yaw, el auto entra cruzado en el cuadro y ves el ángulo que mantenés.
>
> Config real: 6.6 m atrás, 2.35 m de alto, mira 7 m adelante, FOV 64° que abre a 80° con
> la velocidad, sondeo contra obstáculos para acercarse cuando hay una pared atrás.
> Tres presets con `C`. Ver `src/render/CameraRig.ts`.

## 7.1 Concepto original (aéreo, ya no vigente)

Cámara **top-down con inclinación**, no cenital pura. Una cenital pura (90°) se ve plana y
no deja ver la altura de los edificios. La cámara vive a **62° de inclinación desde la
horizontal**, mirando al auto. Proyección **perspectiva** con FOV bajo (32°) — eso da algo
parecido a ortográfica pero con paralaje, que es lo que le da sabor.

```
        cámara
          \
           \  62°
            \
   ──────────●────────── suelo (auto)
```

## 7.2 Parámetros y comportamiento

```ts
interface CameraConfig {
  pitchDeg: 62;
  fov: 32;
  heightBase: 34;        // m sobre el auto, a velocidad 0
  heightPerSpeed: 0.55;  // m por cada m/s → a 40 m/s (144 km/h) → 34 + 22 = 56 m
  heightMax: 62;
  lookAheadBase: 4;      // m adelante del auto
  lookAheadPerSpeed: 0.42;
  lookAheadMax: 22;
  followLagPos: 0.14;    // s de constante de tiempo (damping crítico)
  followLagRot: 0.25;    // s — la rotación va MÁS lenta que la posición
  driftOffsetGain: 6.0;  // m de offset lateral en la dirección del derrape
}
```

**Comportamientos obligatorios:**

1. **Rotación:** la cámara sigue el **vector velocidad**, NO el yaw del auto. Esto es la
   decisión clave de una cámara de drift: si sigue el yaw, cuando el auto se cruza la
   cámara pega un latigazo y el jugador se marea. Siguiendo la velocidad, el auto se ve
   girar dentro de un encuadre estable, que es exactamente lo que querés ver.
   - Excepción: por debajo de 5 m/s la cámara sigue el yaw (si no, gira random al parar).
   - Blend entre ambos modos entre 3 y 7 m/s.
2. **Look-ahead:** el punto que mira la cámara está adelantado en la dirección de la
   velocidad. A más velocidad, más adelante. El auto queda "abajo" del encuadre, y ves a
   dónde vas.
3. **Offset de drift:** durante un drift, la cámara se desplaza lateralmente hacia el lado
   contrario al derrape (`driftOffsetGain * sin(driftAngle)`), lo que abre el espacio
   hacia donde el auto está apuntando. Se siente cinematográfico y es funcional.
4. **Zoom por combo:** el `heightBase` se multiplica por `1 + 0.06 * min(comboTier, 5)`.
   Combo alto = más aire = se siente épico y ves más pared.
5. **Screenshake:** solo en impactos y en el banking de un combo grande. Trauma-based:
   `trauma += impactForce`, `shake = trauma²`, `trauma -= 1.5 * dt`. Usar ruido Perlin, no
   random puro (random puro se ve barato). Máximo 0.9° de rotación y 0.6 m de traslación.
   **Toggle de accesibilidad para desactivarlo.**
6. **Anti-oclusión:** si un edificio queda entre la cámara y el auto, ese edificio se
   renderiza con alpha 0.25 y sin sombras (fade en 0.15 s). Se detecta con un raycast
   cámara→auto cada 4 frames.

## 7.3 Cámaras alternativas (tecla `C`)

- **Aérea (default)** — la de arriba.
- **Aérea alta / "drone"** — pitch 78°, altura 70 m, sin look-ahead. Buena para explorar
  y para ver el layout del mapa.
- **Cinemática de replay** — solo en el resumen post-run: órbita lenta alrededor del punto
  de máximo combo, con motion blur suave.

No hay cámara de capó ni de perseguidor bajo. El juego es aéreo, y eso es una decisión de
diseño, no una limitación.

---

# 8. Sistema de puntuación y combo

## 8.1 Fórmula

Los puntos se acumulan **por frame** mientras hay un drift válido:

```ts
function scoreThisFrame(car, world, dt): number {
  if (!isValidDrift(car)) return 0;

  const speedKmh = car.speed * 3.6;

  // Factor de velocidad — lineal con piso y techo
  const fSpeed = clamp(speedKmh / 100, 0.30, 2.20);

  // Factor de ángulo — campana. Pico en 52°, ventana útil 12°–95°
  const a = degrees(car.driftAngle);
  const fAngle = (a < 12 || a > 95) ? 0 : Math.pow(Math.sin(Math.PI * (a - 12) / 83), 0.7);

  // Bonus de proximidad a paredes — el gran diferenciador de skill
  const d = world.nearestWallDistance(car.pos);  // m, del borde del auto
  const fProx = d < 2.5 ? 1 + 0.9 * (1 - d / 2.5) : 1.0;   // hasta ×1.9

  // Multiplicador de combo (ver 8.3)
  const fCombo = car.comboMultiplier;

  // Bonus de zona (§9.6) — algunas partes de la ciudad valen más
  const fZone = world.zoneMultiplierAt(car.pos);

  return BASE_RATE * fSpeed * fAngle * fProx * fCombo * fZone * dt;
}

const BASE_RATE = 120;  // puntos por segundo en condiciones neutras
```

## 8.2 ¿Cuándo un drift es válido?

```ts
function isValidDrift(car): boolean {
  return car.driftAngle > DEG(12)
      && car.driftAngle < DEG(100)
      && car.speed > 8              // 28.8 km/h
      && car.rearSlipVelocity > 2.0 // la goma tiene que estar patinando de verdad
      && !car.isAirborne
      && world.surfaceAt(car.pos).scorable;  // el pasto no cuenta
}
```

**Anti-farming:** girar en círculos en un estacionamiento vacío tiene que dar poco. Dos
medidas:
1. **Decaimiento por repetición:** el mundo está dividido en celdas de 20 m. Cada celda
   tiene un `heatValue`. Driftear en una celda sube su heat; el heat baja 0.15/s. El
   score se multiplica por `1 / (1 + heat * 0.6)`, con heat capado a 3. Volver a la misma
   esquina 4 veces seguidas rinde ~30% de lo normal. Vuelve a full en ~20 s.
2. **Requisito de progresión:** el multiplicador de combo solo sube si el auto **avanza**.
   Hay que recorrer al menos 12 m de distancia neta cada 2 segundos de combo, si no el
   combo entra en "stall" y deja de subir (pero no se rompe).

## 8.3 El combo

```
Los puntos NO entran al total mientras derrapás. Van a un "banco pendiente".
El multiplicador sube mientras el drift se mantiene.
Al terminar el drift LIMPIO → los puntos pendientes × multiplicador final entran al total (BANK).
Al chocar → se pierde (parcial o total, según §5.8).
```

**Curva del multiplicador:**

```ts
// Sube con el tiempo de drift continuo, con escalones visibles
const t = car.driftDuration;  // s
const tiers = [
  { at: 0.0, mult: 1.0,  label: "" },
  { at: 1.5, mult: 1.5,  label: "NICE" },
  { at: 3.0, mult: 2.0,  label: "GOOD" },
  { at: 5.0, mult: 3.0,  label: "GREAT" },
  { at: 8.0, mult: 4.5,  label: "AMAZING" },
  { at: 12.0, mult: 6.5, label: "INSANE" },
  { at: 18.0, mult: 9.0, label: "LEGENDARY" },
  { at: 26.0, mult: 12.0, label: "APEX" },
];
```

Entre escalones el multiplicador **interpola linealmente** (para que el número suba
constantemente y se sienta vivo), pero el `label` y el efecto visual saltan de golpe al
cruzar cada umbral. Ese salto es la dopamina.

**Ventana de gracia (chain):** al salir de un drift tenés **1.2 segundos** para entrar en
otro drift sin perder el multiplicador. Esto permite encadenar curvas ("transitions") y es
LA mecánica que hace que un mapa de ciudad brille: un jugador bueno cruza 6 cuadras sin
soltar el combo. Durante la ventana de gracia, el HUD muestra una barra que se vacía.

**Bonus de transición:** cambiar el sentido del drift (de derecha a izquierda o viceversa)
dentro de la ventana de gracia y con más de 25° de ángulo en ambos lados da **+500 puntos
planos + 0.25 al multiplicador**. El feint/transition tiene que ser rentable, si no la
gente hace círculos.

## 8.4 Bonus discretos (se muestran como texto flotante)

| Evento | Puntos | Condición |
|---|---|---|
| `TRANSITION` | 500 | Cambio de lado del drift, ver arriba |
| `WALL RIDE` | 300/s | Drift a < 0.8 m de una pared por > 0.5 s |
| `THREADING` | 800 | Pasar entre dos obstáculos con < 1.5 m de margen total, en drift |
| `NEAR MISS` | 200 | Pasar a < 1.2 m de un objeto/tráfico a > 60 km/h |
| `FULL LOCK` | 400 | Mantener > 70° de ángulo por > 1.5 s |
| `TOUGE` | 250/curva | Encadenar 3+ curvas del circuito de montaña sin romper |
| `CONE KILL` | 50 | Por cono/objeto destruido en drift |
| `DONUT` | 300 | 360° completo de rotación en drift, máximo 3 seguidos (después decae) |
| `LONG DRIFT` | 1000 | Un solo drift de más de 15 segundos |
| `SPEED DEMON` | 600 | Driftear a más de 140 km/h por > 1 s |

## 8.5 Conversión a recursos (el puente con el tycoon)

Al terminar el run:

```ts
const finalScore = totalBanked;

// HYPE — la moneda de progresión "social"
const hype = Math.floor(finalScore / 100) * hypeMultiplier;

// CASH — la moneda del tycoon
const cash = Math.floor(Math.pow(finalScore, 0.78) * 0.55) * cashMultiplier;
//   ^ exponente < 1 → runs enormes rinden mucho, pero con retornos decrecientes.
//     Esto es lo que hace que la capa idle siga siendo relevante para jugadores buenos.

// XP del auto
const xp = Math.floor(finalScore / 250) + contractBonusXp;

// Fragmentos de reputación (para desbloquear autos)
const rep = Math.floor(finalScore / 5000);
```

Ejemplos concretos con multiplicadores en 1.0:

| Score del run | Hype | Cash | XP |
|---|---|---|---|
| 5.000 (principiante) | 50 | 461 | 20 |
| 25.000 (decente) | 250 | 1.647 | 100 |
| 120.000 (bueno) | 1.200 | 5.585 | 480 |
| 800.000 (excelente) | 8.000 | 24.500 | 3.200 |
| 5.000.000 (roto) | 50.000 | 107.700 | 20.000 |

Notá que un run 40× mejor da 40× de Hype pero solo ~6.6× de Cash. El Hype premia el skill
directamente; el Cash está diseñado para que el idle sea siempre una fuente
complementaria válida.

---

# 9. Mapa 1 — la ciudad

## 9.1 Concepto

**"HARBOR DISTRICT"** — un distrito portuario nocturno de una ciudad ficticia. Lluvia
reciente, asfalto reflejando neón, grúas de contenedores al fondo, autopista elevada
cruzando por arriba. Mundo abierto pequeño y denso, no grande y vacío.

**Tamaño:** 900 × 900 metros. Eso es lo suficientemente grande para que un run de 90 s no
lo recorra entero, y lo suficientemente chico para que se pueda diseñar a mano cada
esquina y correr bien.

## 9.2 Filosofía de layout

La ciudad **no es una grilla uniforme de Manhattan**. Una grilla perfecta es aburrida para
driftear: todas las esquinas son iguales, todas son de 90°. El layout combina:

- **Grilla principal** (40% del mapa): manzanas de 90 × 70 m, calles de 14 m de ancho.
  Esquinas de 90° con radios de curva de 8 m. Es el terreno de aprendizaje.
- **Diagonal** (una avenida en diagonal a 30° que corta la grilla): genera **esquinas
  agudas de 60° y obtusas de 120°**, que son mucho más interesantes. Es la mejor calle
  del mapa y hay que tratarla como tal.
- **Rotonda central** (radio interior 22 m, exterior 40 m): un donut gigante, perfecto
  para combos largos sostenidos. Con una fuente/monumento en el medio como referencia visual.
- **Zona portuaria** (esquina SE): superficie abierta de hormigón con contenedores
  apilados formando un laberinto reconfigurable. Pasillos de 9–16 m. Terreno de proximidad
  pura, mucho bonus de pared.
- **Estacionamiento en espiral** (edificio de 4 niveles, NE): rampa helicoidal de radio
  18 m que se puede driftear entera. Es un truco visual espectacular en cámara aérea
  (el auto sube por la espiral y la cámara lo sigue).
- **Costanera** (borde S y E): un paseo largo y curvo pegado al agua, con barandas.
  Curvas de radio 60–120 m, para drifts de alta velocidad. Superficie `wet_asphalt`.
- **Autopista elevada** (cruza el mapa N–S por arriba): accesible por 2 rampas. Es un
  óvalo alargado con curvas peraltadas. Zona de máxima velocidad. El multiplicador de
  zona es alto acá.
- **Obra en construcción** (NW): tierra, rampas de tierra, saltos chicos, montículos.
  Superficie `dirt`. Rompe la monotonía del asfalto.
- **Túnel** (bajo la zona central, 180 m de largo, en curva de S): eco en el audio,
  iluminación de sodio naranja, luces que barren el auto. Espectacular en aéreo con la
  "tapa" del túnel renderizada semitransparente para que se siga viendo el auto.

## 9.3 Grafo de conectividad

El mapa se diseña como un **grafo donde cada nodo es una esquina/intersección y cada
arista es un tramo de calle.** Regla dura: **desde cualquier nodo tenés que poder llegar a
otro nodo interesante en menos de 6 segundos de manejo.** Nada de rectas largas y vacías.

Sub-reglas:
- Ninguna recta supera los 120 m salvo en la autopista y la costanera.
- Toda esquina tiene al menos 2 líneas válidas de drift (interna y externa).
- Hay al menos 4 "circuitos" cerrados naturales que se pueden encadenar infinitamente
  sin repetir el mismo giro dos veces seguidas.
- Ningún callejón sin salida sin señalización visual clara (barrera pintada + luz roja).

## 9.4 Densidad de props

Por cada 100 × 100 m de zona urbana:
- 8–14 autos estacionados (colisionables, estáticos)
- 20–35 conos / tachos / cajas (destructibles)
- 6–10 postes de luz (colisionables, delgados, castigan pero se esquivan)
- 2–4 carteles de neón (destructibles, dan mucho Hype y explotan lindo)
- 4–8 macetas / bancos (colisionables bajos)
- 1–2 hidrantes (destructibles → chorro de agua que **moja el asfalto en un radio de 6 m
  durante 20 s**, bajando el grip localmente. Detalle jugoso y emergente.)

## 9.5 Tráfico (opcional pero muy recomendado)

Autos de IA en un carril, a 30–50 km/h, siguiendo splines predefinidas.
- Densidad configurable (Off / Bajo / Medio / Alto) — default **Bajo**.
- Solo circulan por las calles de grilla, no por la autopista ni el puerto.
- Frenan si detectan al jugador a menos de 12 m en su carril (no son kamikazes).
- Dan bonus de `NEAR MISS`. Chocarlos cuenta como `hit` (rompe combo).
- Es la fuente de tensión más barata y efectiva del mapa. Un drift esquivando tráfico vale
  10 veces más como experiencia que uno en una calle vacía.

## 9.6 Zonas de multiplicador

El mapa está pintado con un mapa de zonas (polígonos) que multiplican el score:

| Zona | Multiplicador | Justificación |
|---|---|---|
| Calles de grilla | ×1.0 | Base |
| Avenida diagonal | ×1.25 | Geometría más difícil |
| Rotonda central | ×1.15 | |
| Puerto / contenedores | ×1.4 | Muy apretado, alto riesgo |
| Estacionamiento espiral | ×1.5 | Técnico y estrecho |
| Autopista elevada | ×1.3 | Alta velocidad, sin escapatoria |
| Túnel | ×1.35 | Estrecho + baja visibilidad |
| Costanera | ×1.2 | Mojado |
| Obra / tierra | ×1.1 | |
| Plazas / pasto | ×0.4 | Desincentiva cortar camino |

Las zonas se muestran en el minimapa con un tinte de color y un badge cuando entrás.

## 9.7 Generación del mapa

**El mapa NO se modela en Blender.** Se define en datos y se genera proceduralmente:

```ts
interface MapDefinition {
  bounds: { w: 900, h: 900 };
  roads: RoadSegment[];      // splines con ancho, superficie, banking
  blocks: BuildingBlock[];   // polígonos extruidos con altura y paleta
  props: PropPlacement[];    // tipo, posición, rotación, escala
  zones: ScoreZone[];        // polígonos con multiplicador
  spawns: SpawnPoint[];
  trafficSplines: Spline[];
  lights: LightDef[];
}
```

- **Calles:** se generan como mesh a partir de splines (extrusión de sección transversal
  con cordón, vereda y línea central). Una función `buildRoadMesh(spline, profile)`.
- **Edificios:** prisma extruido desde un polígono, con:
  - fachada generada por shader (grilla de ventanas, algunas prendidas — el patrón se
    calcula con un hash de la posición del edificio, determinista),
  - remate de techo con antenas/tanques procedurales,
  - cartel de neón en 1 de cada 5.
- **Props:** instanced meshes. Un `InstancedMesh` por tipo de prop. 300 conos = 1 draw call.
- **Todo el mapa vive en un solo archivo `maps/harbor.ts`** (~1500 líneas de datos) más
  el generador. Se debe poder editar una calle cambiando 3 números.

**Editor:** implementar un modo editor (`?editor=1`) que permita mover props, dibujar
splines de calle y pintar zonas con el mouse, y exportar el resultado como el archivo de
datos. Esto se paga solo en 2 días.

## 9.8 Iluminación

- **Hora:** noche fija. La noche resuelve mil problemas: oculta la falta de detalle,
  hace que el neón brille, hace que los faros y las luces de freno del auto sean legibles
  desde arriba, y le da identidad.
- **Ambiente:** hemisférica azul-violeta muy tenue (`#141826` abajo, `#2a2140` arriba).
- **Direccional:** una luna débil desde el NW, sombra dura de baja resolución (1024) solo
  para el auto y props cercanos. Cascade shadow no hace falta con cámara aérea acotada.
- **Luces de calle:** NO usar luces reales de Three.js (mataría el rendimiento). Usar:
  - Un **mapa de lightmap emisivo** pintado en el shader del suelo (charcos de luz
    circulares calculados desde un array de posiciones de luz, máximo 32 activas por celda
    de grid, resueltas en el fragment shader).
  - Sprites de bloom para el bulbo de cada luz.
- **Neón:** materiales emisivos + un pase de bloom (UnrealBloomPass, threshold 0.85,
  strength 0.7, radius 0.4).
- **Reflejos húmedos:** el shader del suelo mezcla un reflejo falso: se sample el color
  del cielo/edificios con una normal perturbada por una textura de ondas procedural,
  modulado por un `wetness` por vértice. Es barato y se ve carísimo.

---

# 10. Dirección de arte

## 10.1 Estilo

**Low-poly estilizado con luz cinematográfica.** No realismo, no pixel art, no cel-shading
puro. Formas simples y limpias, materiales lisos con un poco de metalness, e iluminación
que hace todo el trabajo pesado.

Palabras clave: nocturno, neón, húmedo, contrastado, limpio, saturado.

## 10.2 Paleta

```
Fondo/ambiente:   #0B0D14  #141826  #1E2438
Asfalto:          #1A1D24  (con variación de ruido ±6%)
Cordones/veredas: #2E3440
Líneas pintadas:  #C8CDD8 (blanco sucio), #D9A441 (amarillo)
Neón cyan:        #22E1FF   ← acento primario
Neón magenta:     #FF2E88   ← acento secundario
Neón ámbar:       #FFA332
Neón verde:       #39FF88
Rojo peligro:     #FF3B30
Humo:             #E8ECF5 con alpha
Marcas de goma:   #000000 con alpha 0.55
UI texto:         #FFFFFF / #9AA3B5 (secundario)
```

**Regla de contraste:** el auto del jugador siempre tiene el color más saturado y claro de
la pantalla. Nunca se pierde de vista.

## 10.3 Los autos

Cada auto es un mesh de **300–800 triángulos**, construido proceduralmente o modelado
como un conjunto de primitivas deformadas. Nada de modelos de 50k tris.

Anatomía obligatoria (todo esto se lee desde arriba):
- Carrocería con silueta clara y distinta por arquetipo.
- **Techo de color plano y saturado** (es lo que más se ve).
- Parabrisas oscuro con un highlight especular.
- 4 ruedas que **rotan visualmente según la velocidad** y las delanteras que **giran con
  el volante** (esto es enorme para la legibilidad del drift).
- Luces: faros (cono de luz proyectado en el suelo, un sprite aditivo), luces de freno
  (se prenden al frenar), luz de marcha atrás, guiños opcionales.
- Alerón trasero (varía por auto).
- **Sombra dura proyectada** — no shadow map, un blob de sombra (quad con textura de
  gradiente radial suave) proyectado bajo el auto, que se deforma con el ángulo. Es más
  barato y se lee mejor que una sombra real.

## 10.4 Customización visual (alimenta al tycoon)

- **Pintura:** color base + tipo (mate / brillante / metalizado / perlado / cromado).
  Slider de hue/sat/lightness o paleta de 24 colores preset.
- **Vinilos:** capas de decals proceduralmente generados (rayas, llamas, camuflaje,
  gradientes, patrones geométricos). Cada capa tiene color, posición, escala, rotación y
  espejado. 8 capas máximo. Se renderiza a una textura offscreen una sola vez.
- **Llantas:** 12 diseños, generados proceduralmente (número de rayos, grosor, offset,
  color, color de la pinza de freno).
- **Kit de carrocería:** 3 niveles (stock / street / wide-body). El wide-body cambia el
  `trackWidth` real en la física (+0.12 m) → más estable. La customización toca el
  gameplay.
- **Neón bajo el auto:** color configurable, se refleja en el asfalto húmedo. Puro sabor,
  pero es lo primero que la gente quiere.
- **Humo de color:** el humo de las gomas puede ser de color (se compran "gomas de color"
  en la tienda). Es cosmético, es barato de implementar y la gente lo ama.

---

# 11. VFX

Todos por GPU, con pooling, sin allocations en el hot path.

## 11.1 Humo de neumático

- **Sistema:** un solo `Points`/`InstancedMesh` con buffer de 2048 partículas, actualizado
  en el vertex shader con un `BufferAttribute` de spawn time/pos/vel. La CPU solo escribe
  el slot de la partícula nueva.
- **Emisión:** `rate = clamp(rearSlipVelocity * 8, 0, 90)` partículas por segundo, desde la
  posición de cada rueda trasera (con un jitter de 0.15 m).
- **Vida:** 1.4 s. La partícula **crece** de 0.4 m a 3.2 m, **rota** lentamente,
  **se desvanece** con una curva `1 - t²`, y **se eleva** 0.6 m/s con drag.
- **Velocidad inicial:** heredada de la velocidad de la rueda × -0.25 (sale hacia atrás)
  + componente lateral del slip.
- **Color:** blanco base, teñido por la superficie y por la luz de neón más cercana. Un
  humo blanco iluminado por un neón cyan es la imagen icónica del juego.
- **Densidad por escalón de combo:** a combo alto, +40% de emisión. Recompensa visual.

## 11.2 Marcas de goma

- **Sistema:** una tira de triángulos (`ribbon`) por rueda trasera. Cada 0.12 m de
  desplazamiento se agrega un par de vértices. Buffer circular de 4096 segmentos por rueda.
  Al llenarse, los más viejos se sobrescriben (y se desvanecen antes de desaparecer).
- **Opacidad:** proporcional a `clamp(rearSlipVelocity / 12, 0, 1)`.
- **Ancho:** 0.22 m, con variación según la carga vertical.
- **Render:** un solo draw call, material transparente, `depthWrite: false`,
  `polygonOffset` para evitar z-fighting con el asfalto.
- **Persistencia:** las marcas duran todo el run. Al final de un run bueno el mapa está
  todo garabateado, y eso es un trofeo visual. Se limpian al reiniciar.

## 11.3 Otros efectos

| Efecto | Implementación |
|---|---|
| Chispas (roce con pared) | 30 partículas por impacto, aditivas, gravedad, vida 0.5 s, rebote simple |
| Polvo (tierra/pasto) | Igual que el humo pero color marrón, vida más corta, menos elevación |
| Spray de agua (mojado) | Partículas finas, alpha bajo, salen hacia los costados en abanico |
| Explosión de cartel de neón | 12 fragmentos + un flash de luz de 0.15 s + partículas de vidrio |
| Trail de velocidad | A > 130 km/h, líneas radiales sutiles en los bordes de pantalla |
| Flash de banking | Al cobrar un combo, un pulso radial de color desde el auto, 0.3 s |
| Speed lines en el suelo | Textura de rayas que se desplaza bajo el auto a alta velocidad |
| Motion blur | Post-proceso radial suave, solo a > 120 km/h, intensidad 0.3 máx |

## 11.4 Post-procesado (pipeline)

```
Render escena
  → Bloom (threshold 0.85, strength 0.7)
  → Aberración cromática (muy sutil, 0.0015, aumenta con la velocidad)
  → Viñeta (0.35)
  → Grano de film (0.025)
  → Color grading (LUT procedural: sombras hacia azul, luces hacia magenta)
  → FXAA
```

En calidad "Baja" se apagan bloom, aberración, grano y motion blur. FXAA se mantiene.

---

# 12. Audio

> **Revisión 2:** la primera implementación de esta sección salió chillona y molesta. Dos
> correcciones que valen más que todo lo que sigue:
>
> 1. **El motor no puede ser sierra + waveshaper.** Da un zumbador. Se reemplazó por una
>    `PeriodicWave` con armónicos que caen como 1/n^1.25, filtro cerrado y ganancia baja.
>    El motor acompaña, no tapa.
> 2. **El chirrido de goma con Q=18 es un silbido.** Bajó a Q=3.5 con una capa de rumor
>    grave que le da cuerpo, y con techo de ganancia.
> 3. **Las recompensas son la melodía.** Cada premio toca la nota siguiente de una escala
>    pentatónica y sube; encadenar suena a que subís algo. Es el truco de los juegos de
>    monedas y es lo que engancha de verdad. Los buses de recompensa van MÁS FUERTE que
>    los de motor y goma, no al revés.

**Todo sintetizado con Web Audio API.** Sin archivos. Esto suena a limitación pero es una
ventaja: bundle de 0 KB de audio, y el motor puede tener un pitch perfectamente continuo,
que es lo único que importa en un juego de autos.

## 12.1 Motor

```
Grafo:
  osc1 (sawtooth, freq = rpm/60 * cylinders/2)  ─┐
  osc2 (square,   freq = f1 * 0.5)               ├→ mixer → lowpass (freq = 400 + rpm*0.35)
  osc3 (sawtooth, freq = f1 * 1.5, detune ±8c)  ─┤              ↓
  noise (filtrado, para el "aire")              ─┘        distortion (waveshaper)
                                                                ↓
                                                        gain (según throttle+rpm)
                                                                ↓
                                                          panner + reverb send
```

- El pitch sigue `car.rpm` **continuamente** (sin steps).
- El `throttle` controla: ganancia (0.35 → 1.0), cantidad de distorsión, y apertura del
  lowpass. Motor a fondo = brillante y sucio. Motor en corte = oscuro y suave.
- **Overrun / backfire:** al soltar el acelerador arriba de 4500 rpm, se dispara un burst
  de ruido filtrado (pop) con probabilidad 0.4, más un flash de luz naranja en el escape.
  Esto es 15 líneas de código y es el efecto más satisfactorio del juego entero.
- **Cambio de marcha:** micro-corte de ganancia de 80 ms + un click.
- **Turbo (autos con turbo):** un ruido rosa filtrado con banda estrecha, pitch sube con
  rpm+throttle; al soltar, **blow-off valve** (burst de ruido descendente).

## 12.2 Neumáticos

- **Chirrido de drift:** ruido blanco → bandpass con Q alto (18) y frecuencia central
  `600 + rearSlipVelocity * 45` Hz. Ganancia proporcional al slip. Se le suma un LFO leve
  de 7 Hz para que no suene estático.
- **Superficie:** en tierra/pasto, el bandpass baja de Q (ruido más sordo) y se agrega
  ruido de baja frecuencia.
- Chirrido delantero separado, más agudo y más bajo en volumen.

## 12.3 Impactos

Sintetizados: un burst de ruido con envolvente exponencial muy corta (5 ms de ataque,
120–400 ms de caída según la fuerza), filtrado en banda según el material (metal = agudo
con resonancia, hormigón = medio sordo, plástico/cono = seco y corto).

## 12.4 Ambiente y UI

- **Ambiente:** loop de ruido rosa muy filtrado (ciudad lejana) + sirenas ocasionales
  sintetizadas + viento. Volumen bajísimo, solo para que no haya silencio.
- **Túnel:** al entrar, se sube el send de reverb (convolución con un impulso sintético
  de 1.8 s) y se aplica un lowpass. Al salir, se revierte en 0.4 s.
- **UI:** clicks, hovers y confirmaciones con osciladores cortos (senoidal + envolvente).
  Un "cha-ching" de dos tonos para cobrar plata en el tycoon (**crítico**: este sonido lo
  vas a escuchar 500 veces, tiene que ser corto, agradable y con variación de pitch).
- **Música:** synthwave generativa. Un secuenciador simple con:
  - Bajo (sawtooth + lowpass con envolvente), patrón de 16 pasos en una escala menor.
  - Pad de acordes (3 osciladores detuneados, ataque lento).
  - Arpegio (square, delay con feedback).
  - Batería sintetizada (kick = sine con pitch envelope; snare = ruido + banda; hi-hat =
    ruido con highpass).
  - **La música reacciona al juego:** el filtro del bajo se abre con el multiplicador de
    combo, y se agrega una capa de arpegio a partir del tier 3. Al banquear un combo
    grande, un riser + un impacto.
  - 4 progresiones de acordes distintas, se alternan.

## 12.5 Mezcla

| Bus | Volumen default | Ducking |
|---|---|---|
| Master | 0.8 | — |
| Motor | 0.55 | -3 dB durante impactos |
| Neumáticos | 0.45 | — |
| Impactos | 0.7 | — |
| Ambiente | 0.2 | -6 dB durante drift |
| UI | 0.6 | — |
| Música | 0.35 | -4 dB durante impactos |

Todos los buses configurables. **Silenciar al perder foco de la pestaña** (obligatorio).
Botón de mute global siempre visible (tecla `M`).

---

# 13. ECONOMÍA — la plata sale de driftear

> Esta sección reemplaza a la capa tycoon del brief original. El tycoon se implementó
> completo (sponsors, staff, salas, bahías, ingreso pasivo, offline, prestige) y se
> borró después de probarlo: inflaba la plata hasta volver irrelevante el manejo, que es
> justo lo contrario de lo que tiene que hacer un juego de drift.

## 13.1 La regla

```
plata = puntos × 0.045 × estilo × asistencias
```

Y nada más. No hay ingreso pasivo, ni timers, ni recompensas por volver, ni moneda
premium. Si el juego está cerrado, no pasa nada.

**Por qué el score entra lineal.** En la versión con idle, el cash usaba `score^0.78`
para que los runs enormes no dejaran atrás al ingreso pasivo. Sin idle ese exponente no
tiene sentido: castiga exactamente lo que querés premiar. Ahora 10× de score son 10× de
plata, sin techo.

## 13.2 Multiplicador de estilo

Es lo que separa "manejar mucho" de "manejar bien". Con el mismo score, un run prolijo
paga más del doble que uno sucio.

| Concepto | Efecto | Tope |
|---|---|---|
| Combo máximo | +10% por punto de multiplicador | — |
| Curvas encadenadas | +3% cada una | 12 |
| Transiciones | +2% cada una | 15 |
| Wall rides | +3% cada uno | 10 |
| Run sin chocar | **+35%** | — |
| Choques | −5% cada uno | −30% |

Piso duro en ×0.4: un run desastroso paga poco, nunca cero (Pilar 3).

## 13.3 Asistencias que pagan

| Preset | Pago | Rep |
|---|---|---|
| Casual | ×0.8 | ×0.7 |
| Estándar | ×1.0 | ×1.0 |
| Pro | **×1.35** | **×1.5** |

Es el único incentivo de progresión que no es "esperá más": bajás las ayudas, ganás más.

## 13.4 Dos monedas

- **Plata ($)** — compra todo: mejoras y autos.
- **Reputación (★)** — `score × estilo / 6000`. Solo abre los dos autos de arriba de todo.

Se borraron Hype (era el nivel del imperio idle) y Partes (era fricción sin segunda
fuente). Dos monedas alcanzan.

## 13.5 Ritmo objetivo

| Compra | Costo | Runs aproximados |
|---|---|---|
| Primera mejora | $1.500 | 1 run de principiante |
| Segundo auto (Barrow) | $9.000 | 5–8 runs de principiante |
| Auto del medio (Kite 300ZT) | $48.000 | 3–5 runs buenos |
| Tier S (Sable Formula D) | $5.5 M | endgame, ~100 runs buenos |

Verificado con un test que compara los precios contra lo que paga un run típico
(`src/meta/meta.test.ts`, "el ritmo de progresión es razonable").

## 13.6 Feedback: mostrar el cálculo

Dos lugares, y los dos importan:

1. **En vivo, durante el run:** un contador `+$X` abajo a la izquierda que sube mientras
   derrapás. Es el recordatorio permanente de de dónde sale la plata.
2. **En la pantalla de resultados:** el desglose línea por línea del multiplicador de
   estilo, con cada bonus y cada penalización por separado. El jugador tiene que poder
   leer exactamente por qué le pagaron lo que le pagaron; si no, el multiplicador es
   magia y no enseña nada.

# 14. Economía y progresión

## 14.1 Curvas de costo

Todos los upgrades usan la misma forma:

```ts
cost(level) = baseCost * Math.pow(growth, level)
```

| Categoría | growth | Racional |
|---|---|---|
| Upgrades de auto | 1.28 | Suben rápido, se sienten valiosos |
| Sponsors | 1.16 | Suben lento, siempre vale subirlos |
| Staff | 1.18–1.35 | Varía por rol |
| Bahías | 6.00 | Saltos enormes — son hitos |
| Salas del garage | 1.45 | |
| Autos nuevos | fijo por auto | Son decisiones, no incrementos |

## 14.2 Ritmo objetivo

| Fase | Tiempo de juego | Hype total | Qué está pasando |
|---|---|---|---|
| Tutorial | 0–5 min | 0–100 | Primer drift, primer combo, primer $ |
| Arranque | 5–30 min | 100–2K | Primeros upgrades, primer sponsor, segunda bahía a la vista |
| Despegue | 30 min–3 h | 2K–50K | Segundo auto, staff, se siente el ingreso pasivo |
| Consolidación | 3–12 h | 50K–1M | Garage lleno, sponsors medios, contratos difíciles |
| Meseta | 12–25 h | 1M–10M | Los costos se van de escala → se sugiere prestige |
| Post-prestige | 25 h+ | reinicia | Todo va 3–5× más rápido, se llega más lejos |

## 14.3 Reglas de balance

- **Nunca un muro sin salida.** Si el jugador no puede pagar nada en 15 minutos de idle
  + 3 runs, el balance está roto. Test automático que lo verifique.
- **Un run excelente vale ~20–40 minutos de idle** en la fase temprana, y ~5–10 minutos en
  la fase tardía. El idle se vuelve más dominante con el tiempo, lo cual es correcto:
  premia jugar bien temprano, y premia volver seguido después.
- **La primera compra de una categoría nueva siempre es barata.** El primer sponsor cuesta
  $500 cuando el jugador ya tiene $2.000. Enganchar primero, escalar después.
- Formateo de números: `1.23K`, `456M`, `7.8B`, `12.3T`, `45.6Qa`, luego notación con
  sufijos de letras (`aa`, `ab`, `ac`, ...). Siempre 3 dígitos significativos.

---

# 15. Tuning del auto

El tuning **afecta la física de verdad** (modifica el `CarSpec` en runtime). No es
cosmético ni un simple `+5% stat`.

## 15.1 Upgrades (se compran con $ y ⚙, tienen niveles)

| Upgrade | Nivel máx | Efecto por nivel | Trade-off |
|---|---|---|---|
| **Motor** | 20 | +4% torque en toda la curva | Más difícil de controlar |
| **Turbo** | 12 | +3% torque arriba de 4000 rpm, +lag | Respuesta menos lineal |
| **Escape** | 10 | +1.5% torque, +sonido, +2% Hype | — |
| **Peso** | 15 | -1.2% masa (mín 65% del original) | Menos estable en recta |
| **Suspensión** | 15 | -2% transferencia de peso, +1% grip | — |
| **Neumáticos** | 20 | +2% μ en ambos ejes | ¡Ojo! Más grip = más difícil derrapar |
| **Diferencial** | 10 | -3% diferencia de velocidad entre ruedas traseras → drift más estable | — |
| **Dirección** | 10 | +1.5° de ángulo máximo (hasta +15°) | Enorme para drift de mucho ángulo |
| **Frenos** | 10 | +4% torque de freno | — |
| **Caja** | 8 | -6% tiempo de cambio, relaciones más cortas | — |
| **Jaula antivuelco** | 5 | -10% daño de choque, +2% rigidez | +15 kg |
| **Aero** | 10 | +8% downforce, +3% drag | Menos velocidad punta |

## 15.2 Setup (gratis, ajustable siempre, con sliders)

Esto es lo que separa a un jugador casual de uno que entiende. **Todo gratis, se puede
cambiar entre runs, y se pueden guardar 5 presets por auto.**

| Parámetro | Rango | Efecto |
|---|---|---|
| Ángulo de dirección | 30°–65° | Más ángulo = drifts más extremos posibles, más difícil de controlar |
| Balance de frenos | 40%–80% delantero | Más adelante = más estable; más atrás = el auto rota al frenar |
| Bloqueo del diferencial | 0%–100% | Más bloqueo = drift más predecible y sostenido |
| Presión de gomas del. | 1.6–2.6 bar | Baja = más grip delantero (mejor para contravolantear) |
| Presión de gomas tras. | 1.6–2.6 bar | Alta = menos grip trasero = más fácil derrapar |
| Rigidez susp. del. | 0–100 | |
| Rigidez susp. tras. | 0–100 | Más rígido atrás = el tren trasero se suelta antes |
| Altura | 60–140 mm | Más bajo = más estable, menos apto para tierra |
| Reparto de peso | 48%–58% del. | |
| Relación final | 2.8–4.8 | Corta = acelera rápido; larga = más velocidad punta |

**UX crítica:** cada slider muestra en tiempo real **cómo afecta a tres barras resumen**:
`ESTABILIDAD` / `ÁNGULO` / `ACELERACIÓN`. Y hay un botón **"SETUP RECOMENDADO"** que aplica
un preset bueno, para que el 80% de los jugadores no tenga que entender nada.

## 15.3 Niveles del auto

Cada auto tiene XP y sube de nivel (máx 30). Cada nivel da:
- +0.5% a todas las stats
- Cada 5 niveles: 1 punto de perk, gastable en un mini-árbol por auto
  (más Hype, más cash, más grip, más torque, mejor freno, combo más rápido)
- Nivel 30: skin exclusivo del auto + el auto se marca como "Legendario"
  (sobrevive al prestige)

---

# 16. Roster de autos

**Todos los nombres, marcas y diseños son originales.** Nada de "Nissan Silvia" ni
"Toyota AE86". Se evocan arquetipos reconocibles sin usar propiedad intelectual ajena.

| Tier | Nombre (original) | Arquetipo evocado | Precio | Masa | Torque pico | Falloff | Carácter |
|---|---|---|---|---|---|---|---|
| D | **Kite 240** | Coupé japonés 80s, liviano | Gratis (inicial) | 1.020 kg | 175 N·m | 0.28 | Lento pero perdona todo. La escuela |
| D | **Barrow Wedge** | Hatchback cuña europeo | $12.000 | 940 kg | 160 N·m | 0.30 | Ágil, chiquito, entra en todos lados |
| C | **Kite 300ZT** | Coupé turbo 90s | $85.000 | 1.240 kg | 310 N·m | 0.34 | El caballito de batalla. El auto "default" |
| C | **Ferro Corsa** | Sedán deportivo italiano | $140.000 | 1.310 kg | 295 N·m | 0.36 | Equilibrado, buen sonido |
| B | **Sable RX-Zero** | Rotativo | $520.000 | 1.180 kg | 280 N·m @ alto rpm | 0.40 | Necesita revoluciones. Suena distinto a todo |
| B | **Kestrel GT** | Muscle americano moderno | $780.000 | 1.620 kg | 620 N·m | 0.38 | Bruto, torque desde abajo, pesado, glorioso |
| B | **Vanta S8** | Coupé alemán | $1.1 M | 1.480 kg | 480 N·m | 0.42 | Preciso, rápido, exigente |
| A | **Ronin Type-R** | Deportivo japonés moderno | $4.5 M | 1.350 kg | 550 N·m | 0.45 | Rápido y filoso |
| A | **Kestrel Widebody** | Muscle preparado | $7 M | 1.550 kg | 850 N·m | 0.44 | Monstruo de humo |
| A | **Aurora V12** | GT de lujo | $12 M | 1.700 kg | 780 N·m | 0.46 | Elegante, larguísimo, drifts amplios |
| S | **Sable Formula D** | Auto de competición pro | $45 M | 1.150 kg | 900 N·m | 0.52 | Ángulo de dirección brutal (70°) |
| S | **Meridian Zenith** | Hipercar | Sponsor 8 | 1.280 kg | 1.100 N·m | 0.55 | Absurdo. El premio |
| S | **Phantom 01** | Prototipo eléctrico | Prestige (100 ◆) | 1.400 kg | 1.400 N·m instantáneo | 0.50 | Torque instantáneo, sin caja, silencioso salvo un zumbido |

**Regla de diseño del roster:** cada auto tiene que sentirse **distinto en la primera
curva**, no en la hoja de stats. Si dos autos se sienten iguales, uno de los dos está mal
tuneado o sobra.

**Cómo se consiguen:** compra con $, desbloqueo por Rep (★), recompensa de sponsor,
recompensa de prestige. Nunca por azar.

---

# 17. UI / UX / HUD

## 17.1 HUD durante el run

Layout (1920×1080, todo escalado con un factor de UI configurable 0.8×–1.4×):

```
┌───────────────────────────────────────────────────────────────────────┐
│ ⏱ 1:23        [ SCORE  1.284.500 ]                    [ minimapa   ] │
│                                                        [   90×90 px ] │
│                                                                       │
│                                                                       │
│                          (juego)                                      │
│                                                                       │
│                                                                       │
│         ╔═══════════════════════╗                                     │
│         ║   +48.250   ×4.5      ║ ← banco pendiente + multiplicador   │
│         ║   ▓▓▓▓▓▓▓▓▓░░░░       ║ ← barra de gracia / progreso a tier │
│         ║      GREAT!           ║                                     │
│         ╚═══════════════════════╝                                     │
│                                              ┌──────────┐             │
│  [ ⚡ 12.4K  $ 3.2M ]                        │  128 km/h│             │
│                                              │  ▮▮▮▮▮▯▯ │ ← rpm       │
│                                              │    3ª    │             │
│                                              └──────────┘             │
└───────────────────────────────────────────────────────────────────────┘
```

**Reglas del HUD:**
- El elemento del combo está **cerca del centro-abajo**, no en una esquina. El jugador
  está mirando el auto; el número tiene que estar en su visión periférica inmediata.
- El multiplicador **pulsa y crece** cada vez que sube de tier. La escala va de 1.0 a 1.35
  y vuelve en 0.25 s con easing `back.out`.
- El banco pendiente sube con un contador que **rueda** (no salta).
- Al banquear: el número **vuela** desde el banco hasta el SCORE de arriba, con un trail,
  y el SCORE hace un flash. Este micro-momento es el más importante del HUD.
- Los bonus discretos (`TRANSITION!`, `WALL RIDE!`) aparecen como **texto flotante en el
  mundo** (billboard sobre el auto), suben 1.5 m y se desvanecen en 1 s. Máximo 4 en
  pantalla, con cola.
- **Ángulo de drift:** un arco fino alrededor del auto que muestra el ángulo actual, verde
  dentro de la ventana buena, amarillo cerca del límite, rojo fuera. Opcional (default:
  ON para los primeros 10 runs, después OFF automáticamente).
- Minimapa: rotativo, muestra el auto, las zonas de multiplicador tintadas, y el objetivo
  del contrato activo.

## 17.2 Pantalla de resultados

Aparece 1 s después de terminar el run, con la cámara en modo cinemático.

```
                    RUN COMPLETO

              SCORE    2.847.300
              ─────────────────────
              Mejor combo         ×9.0  LEGENDARY
              Drift más largo     24.8 s
              Distancia driftada  1.842 m
              Choques             2
              Conos               31
              ─────────────────────
              ⚡ HYPE      +28.473
              $ CASH      +112.400
              XP          +11.389   [barra que sube]
              ★ REP       +569

              CONTRATOS
              ✓ "Combo ×6"           +$45.000 +12⚙
              ✓ "Puerto 80K"         +$80.000 +5★
              ○ "Sin chocar 150K"    (2 choques)

              [ REPETIR ]   [ GARAGE ]   [ MAPA ]
```

**Timing:** los números aparecen **secuencialmente** con 120 ms entre cada uno y un sonido
corto ascendente. Se puede saltear tocando cualquier tecla. La barra de XP siempre se
anima. Si sube de nivel, un flash + fanfarria.

## 17.3 Pantalla del garage

Vista isométrica del galpón, navegable. Elementos interactivos clickeables in-world
(las bahías, la oficina, la tienda, el dyno). Con un menú lateral como fallback.

Tabs: `AUTOS` · `UPGRADES` · `SETUP` · `PINTURA` · `SPONSORS` · `STAFF` · `GARAGE` · `CONTRATOS` · `LEGACY`

**Barra superior persistente:** `$ cash` · `⚡ hype` · `★ rep` · `⚙ parts` · `$/s actual` ·
botón grande **[ MANEJAR ]** siempre visible, en cualquier pantalla, a un clic.

## 17.4 Principios de UX

1. **Nunca más de 2 clics para manejar.** Desde cualquier pantalla.
2. **Todo lo comprable muestra el efecto antes de comprar**: "Motor Nv.7 → Nv.8: 310 → 322 N·m".
3. **Los botones que no podés pagar no se ocultan**: se muestran en gris con el precio y
   cuánto te falta. Saber qué te espera es motivador.
4. **Los cambios se ven inmediatamente.** Comprás un turbo, el auto en el garage tiene un
   intercooler nuevo. Comprás la sala de trofeos, se llena de trofeos.
5. **Nada de confirmaciones para compras baratas.** Confirmación solo para: prestige,
   vender un auto, despedir staff, borrar el save.
6. **Accesibilidad:** escala de UI, toggle de screenshake, toggle de flashes,
   daltonismo (3 paletas alternativas), subtítulos para eventos de audio importantes,
   navegación completa por teclado y por gamepad, contraste mínimo AA en todo el texto.

## 17.5 Onboarding

**Los primeros 90 segundos definen si el jugador se queda.**

```
0:00  Fade in. El auto ya está andando (no arrancás parado). Música ya sonando.
0:03  Texto grande y breve: "ACELERÁ" (W). Nada más en pantalla.
0:08  Curva marcada en el suelo con flechas de neón. "FRENÁ Y GIRÁ"
0:14  Primer drift accidental. El HUD del combo aparece con un fade. "+2.400"
0:20  "MANTENÉ EL DERRAPE" — la curva siguiente es larga y peraltada, sale sola.
0:32  Primer banking. Flash. "×2.0 GOOD!" El número vuela al score.
0:45  "USÁ EL FRENO DE MANO PARA INICIAR" (Espacio) — con una curva cerrada preparada.
1:00  Se abre el mapa. "ANDÁ DONDE QUIERAS." Sin más instrucciones.
1:30  Termina el run. Resultado. "$2.400 GANADOS."
1:35  Transición al garage. Ya hay un upgrade comprable de $2.000. Se compra.
1:45  "TU GARAGE GENERA $15/SEGUNDO INCLUSO SI NO ESTÁS JUGANDO."
1:50  Botón [ MANEJAR ] pulsando.
```

**Cero muros de texto. Cero pantallas de tutorial. Cero "presioná OK para continuar".**
Todo se enseña manejando.

---

# 18. Modos de juego

| Modo | Descripción | Duración | Desbloqueo |
|---|---|---|---|
| **Free Roam** | La ciudad sin timer. Driftea donde quieras, el score se acumula. Se cobra al salir | Ilimitado | Inicio |
| **Run cronometrado** | 90 s, maximizar score. El modo principal para contratos | 90 s | Inicio |
| **Contrato** | Objetivo específico en la ciudad, con marcadores | Variable | Inicio |
| **Time Attack** | Un circuito marcado en la ciudad, hay que completar N vueltas con el mayor score | 2–4 min | Nivel 5 |
| **Gymkhana** | Un recorrido con obstáculos, conos, donuts marcados. Muy técnico | 2 min | Nivel 10 |
| **Persecución** | Un "rival" (auto de IA con física real) hace un run fantasma; tenés que superarlo | 90 s | Nivel 15 |
| **Tandem** | Seguís a un auto de IA lo más cerca posible mientras derrapás. Score por proximidad + sincronía | 60 s | Nivel 20 |
| **Endurance** | Run de 10 minutos. Las gomas se desgastan y el grip baja. Multiplicadores enormes | 10 min | Nivel 25 |
| **Ghost diario** | Un layout de conos fijo, semilla del día, tabla local de récords | 90 s | Nivel 8 |

**Todos los modos alimentan la misma economía.** Ninguno es un callejón separado.

---

# 19. Guardado y esquemas de datos

## 19.1 Esquema del save

```ts
interface SaveGame {
  version: 3;                    // para migraciones
  createdAt: number;
  lastSeenAt: number;            // para offline earnings
  playtimeSeconds: number;

  currencies: {
    cash: number;                // usar number; si supera 1e15, migrar a { mantissa, exponent }
    hypeTotal: number;           // acumulado histórico — nunca baja salvo prestige
    hypeCurrent: number;
    rep: number;
    parts: number;
    legacy: number;
  };

  player: { level: number; xp: number; };

  cars: Array<{
    id: string;                  // "kite_300zt"
    instanceId: string;          // uuid — podés tener 2 del mismo modelo
    level: number; xp: number;
    upgrades: Record<string, number>;   // { engine: 7, tires: 3, ... }
    setup: Record<string, number>;      // valores de los sliders
    setupPresets: Array<{ name: string; values: Record<string, number> }>;
    cosmetics: {
      paintColor: string; paintType: string;
      wheelId: string; wheelColor: string; caliperColor: string;
      bodyKit: number; neonColor: string | null; smokeColor: string | null;
      decals: Array<{ id: string; x: number; y: number; scale: number; rot: number; color: string; mirrored: boolean }>;
    };
    perks: string[];
    isLegendary: boolean;
    inBay: number | null;        // índice de bahía o null si está guardado
  }>;
  activeCarInstanceId: string;

  garage: {
    bays: number;
    rooms: Record<string, number>;     // { workshop: 4, dyno: 2, ... }
  };
  sponsors: Record<string, number>;    // { koen_tyres: 12, vertex: 5 }
  staff: Record<string, number>;

  contracts: {
    active: Contract[];
    daily: Contract | null;
    dailyStreak: number;
    lastDailyClaim: number;
  };

  progress: {
    unlockedMaps: string[];
    unlockedModes: string[];
    prestigeCount: number;
    legacyNodes: Record<string, number>;
  };

  records: {
    bestScore: number; bestCombo: number; longestDrift: number;
    totalDriftDistance: number; totalRuns: number; totalCrashes: number;
    perMap: Record<string, { bestScore: number; bestCombo: number }>;
  };

  settings: Settings;
  stats: Record<string, number>;   // telemetría local para balanceo
}
```

## 19.2 Reglas de guardado

- **Autosave** al terminar cada run, cada compra, y cada 30 s de idle (con debounce de 2 s).
- **Escritura atómica:** escribir a `save_tmp`, verificar que parsea, mover a `save`.
  Mantener `save_backup` de la versión anterior.
- **Migraciones:** cada bump de `version` tiene una función `migrate_N_to_N1(save)`.
  Nunca romper saves viejos.
- **Export/Import:** botón para copiar el save como string base64 y para pegarlo. Es la
  única forma de que el jugador no pierda todo si borra el caché. **Obligatorio.**
- **Anti-cheat:** ninguno. Es un juego single player offline. Si alguien quiere editar su
  save, que lo edite. No perder ni una hora en esto. (Sí validar que el save no esté
  corrupto y no produzca NaN — un NaN en el cash rompe todo el juego.)

## 19.3 Datos de contenido

Todo el contenido (autos, upgrades, sponsors, staff, salas, mapas, contratos) vive en
archivos TypeScript tipados bajo `src/data/`, **no en JSON**. Razón: type safety,
autocompletado, y podés poner comentarios y funciones. Ejemplo:

```ts
// src/data/cars.ts
export const CARS: Record<string, CarDefinition> = {
  kite_300zt: {
    id: 'kite_300zt',
    displayName: 'Kite 300ZT',
    tier: 'C',
    price: 85_000,
    unlock: { type: 'cash' },
    spec: { mass: 1240, torqueCurve: [[1000, 180], [3000, 290], [4800, 310], [6500, 285], [7200, 240]], /* ... */ },
    visual: { bodyMesh: 'coupe_90s', defaultPaint: '#22E1FF', /* ... */ },
    audio: { cylinders: 6, turbo: true, exhaustNote: 'inline6' },
  },
  // ...
};
```

---

# 20. Arquitectura de código

## 20.1 Estructura de carpetas

```
src/
├─ main.ts                    # bootstrap, game loop, orquestación
├─ core/
│  ├─ Loop.ts                 # fixed timestep + interpolación
│  ├─ EventBus.ts             # pub/sub tipado
│  ├─ Time.ts                 # tiempo de juego, escala, pausa
│  ├─ Rng.ts                  # RNG con semilla (mulberry32)
│  └─ Pool.ts                 # object pooling genérico
├─ sim/                       # ⚠️ CERO imports de three.js acá
│  ├─ CarPhysics.ts           # §5 — el tick de física
│  ├─ TireModel.ts
│  ├─ Drivetrain.ts
│  ├─ Assists.ts
│  ├─ Collision.ts            # broadphase grid + SAT
│  ├─ ScoreSystem.ts          # §8
│  ├─ Traffic.ts
│  └─ types.ts
├─ render/
│  ├─ Renderer.ts             # setup de three, post-proceso
│  ├─ CameraRig.ts            # §7
│  ├─ CarView.ts              # mesh del auto, ruedas, luces
│  ├─ WorldBuilder.ts         # genera el mapa desde MapDefinition
│  ├─ materials/              # shaders custom (asfalto, fachadas, humo)
│  └─ vfx/
│     ├─ SmokeSystem.ts
│     ├─ TireMarks.ts
│     ├─ Sparks.ts
│     └─ FloatingText.ts
├─ audio/
│  ├─ AudioEngine.ts
│  ├─ EngineSound.ts
│  ├─ TireSound.ts
│  ├─ ImpactSound.ts
│  └─ MusicGenerator.ts
├─ meta/                      # la capa tycoon
│  ├─ Economy.ts              # ingreso pasivo, multiplicadores
│  ├─ Sponsors.ts
│  ├─ Staff.ts
│  ├─ GarageRooms.ts
│  ├─ Contracts.ts            # generación procedural
│  ├─ Prestige.ts
│  └─ OfflineEarnings.ts
├─ ui/
│  ├─ Hud.ts                  # canvas, in-game
│  ├─ screens/                # DOM
│  │  ├─ GarageScreen.ts
│  │  ├─ UpgradeScreen.ts
│  │  ├─ SetupScreen.ts
│  │  ├─ PaintScreen.ts
│  │  ├─ SponsorScreen.ts
│  │  ├─ StaffScreen.ts
│  │  ├─ ContractScreen.ts
│  │  ├─ ResultsScreen.ts
│  │  └─ PrestigeScreen.ts
│  ├─ components/             # botones, barras, contadores animados
│  └─ format.ts               # formateo de números grandes
├─ data/
│  ├─ cars.ts  upgrades.ts  sponsors.ts  staff.ts  rooms.ts  legacy.ts
│  └─ maps/harbor.ts
├─ save/
│  ├─ SaveManager.ts
│  └─ migrations.ts
├─ input/
│  ├─ InputManager.ts         # teclado + gamepad + touch → InputState unificado
│  └─ TouchControls.ts
└─ lib/                       # matemática, easing, helpers
```

## 20.2 Reglas de arquitectura (no negociables)

1. **`sim/` no importa nada de `render/`, `ui/`, `audio/` ni `three`.** La simulación
   corre headless. Esto permite: tests unitarios, replays, ghosts, y portear a otro
   engine sin reescribir la física. Verificar con un lint rule (`no-restricted-imports`).
2. **El render lee del estado de sim, nunca lo escribe.**
3. **Fixed timestep con acumulador:**
   ```ts
   let acc = 0;
   const DT = 1/120;
   function frame(now) {
     const rawDelta = Math.min((now - last) / 1000, 0.25);  // cap anti-spiral-of-death
     acc += rawDelta;
     while (acc >= DT) { sim.step(DT); acc -= DT; }
     render(acc / DT);   // alpha para interpolar
   }
   ```
4. **Cero allocations en el loop de física y en el update de VFX.** Vectores
   pre-alocados, scratch objects, pools. Verificar con el profiler de memoria: la línea de
   heap debe ser plana durante un run.
5. **Todo evento de gameplay pasa por el EventBus** (`drift:start`, `drift:bank`,
   `collision`, `bonus:transition`, `cash:earned`). Audio, VFX y UI se suscriben. Nada de
   llamadas directas cruzadas.
6. **La economía es pura.** `Economy.calculateIncome(save): number` no tiene efectos
   secundarios y es 100% testeable.

## 20.3 Tests

| Qué | Cómo |
|---|---|
| Física determinista | Grabar 600 frames de input, correr 2 veces, comparar hashes del estado |
| **No inventa energía** | **Derrapar sin acelerador 2 s: la velocidad tiene que bajar siempre** |
| Anti-trompo | Aguantar handbrake + full lock 0.75 s: el ángulo no pasa de ~115° |
| Auto-enderezado | Drift normal + soltar todo: vuelve a < 5° en menos de 2 s |
| Curva de neumático | Monótona hasta el pico, sin NaN en el rango completo |
| Sin NaN | Fuzzing: 10.000 ticks con inputs random extremos, assert `isFinite` en todo el estado |
| Economía | Simular 100 estados de progresión, assert que siempre hay compras a <30s/<5m/<30m |
| Save/load | Round-trip de un save completo, deep equal |
| Migraciones | Un save de ejemplo por cada versión anterior, todos cargan |
| Formateo de números | 1 → "1", 1234 → "1.23K", 1e15 → "1.00Qa", etc. |
| Score | Un input scriptado da exactamente el score esperado |

---

# 21. Performance

## 21.1 Presupuesto por frame (16.6 ms a 60 FPS)

| Sistema | Presupuesto |
|---|---|
| Física (2 ticks típicos) | 1.2 ms |
| Colisiones | 0.6 ms |
| Score + meta | 0.2 ms |
| Actualización de VFX (CPU) | 1.0 ms |
| Audio | 0.4 ms |
| Cull + preparación de draw calls | 1.5 ms |
| GPU (render + post) | 8.0 ms |
| UI | 0.8 ms |
| Margen | 2.9 ms |

## 21.2 Técnicas obligatorias

- **Instancing** para todos los props repetidos. Objetivo: **< 120 draw calls** en total.
- **Frustum culling** propio con un quadtree del mapa (Three lo hace por objeto; con
  instancing hay que hacerlo por chunk).
- **LOD por distancia:** los edificios lejanos pierden el detalle del techo; los props a
  más de 150 m no se renderizan (con cámara aérea, 150 m es fuera de pantalla igual).
- **Sombras:** un solo shadow map de 1024, cubriendo solo un área de 60×60 m alrededor del
  auto. Todo lo demás usa el blob de sombra.
- **Texturas:** ninguna cargada de disco. Todas generadas a canvas al iniciar (ruido,
  gradientes, patrones de ventana, marcas de goma). Total < 8 MB de VRAM.
- **`powerPreference: 'high-performance'`**, antialias off (usamos FXAA en post).
- **DPR capado:** `Math.min(devicePixelRatio, 2)` en desktop, `1.5` en mobile.
- **Auto-calidad:** si el FPS promedio de 3 s baja de 50, bajar un escalón de calidad
  automáticamente (y avisar con un toast discreto). Si sube de 58 por 30 s, subir.

## 21.3 Presets de calidad

| | Baja | Media | Alta | Ultra |
|---|---|---|---|---|
| Partículas de humo | 400 | 900 | 2048 | 4096 |
| Segmentos de marca | 800 | 2000 | 4096 | 8192 |
| Sombras | off | blob | 1024 | 2048 |
| Bloom | off | on | on | on |
| Reflejos húmedos | off | off | on | on |
| Motion blur | off | off | on | on |
| Grano + aberración | off | off | on | on |
| Distancia de props | 80 m | 120 m | 150 m | 220 m |
| Tráfico | off | bajo | medio | medio |

---

# 22. Roadmap por milestones con criterios de aceptación

Cada milestone es **jugable** y termina con algo que se puede mostrar. Nada de "3 semanas
de infraestructura".

## M0 — El cubo que derrapa (2–3 días)

**Objetivo:** validar el feel de la física antes de invertir en nada más.

- Escena vacía con un plano infinito de asfalto y una grilla de referencia.
- Un **cubo** (literalmente `BoxGeometry`) con la física completa de §5.
- Cámara aérea con seguimiento de velocidad (§7).
- Input de teclado con suavizado.
- Panel de debug con todos los sliders y los vectores de fuerza dibujados.
- Marcas de goma básicas.

**Criterio de aceptación:** una persona que no sabe nada del proyecto agarra el teclado y
en 2 minutos está haciendo drifts largos y sonriendo. **Si esto no pasa, NO seguir. Volver
a tunear.** Este milestone puede tardar el doble de lo estimado y está perfecto — es el
único que realmente importa.

## M1 — Mundo mínimo (4–5 días)

- Generador de calles desde splines + generador de edificios extruidos.
- 4 cuadras de ciudad, con superficies distintas.
- Colisiones (broadphase + SAT), respuesta de choque con las 3 clasificaciones.
- Props destructibles (conos).
- Modelo de auto de verdad (low-poly, con ruedas que giran).
- Humo de neumático.

**Criterio:** se puede andar 5 minutos por el mundo sin atravesar nada ni quedarse trabado.

## M2 — Score y combo (3 días)

- Sistema completo de §8: banking, tiers, ventana de gracia, transiciones.
- HUD in-game.
- Bonus discretos con texto flotante.
- Anti-farming (heat map de celdas).
- Pantalla de resultados.

**Criterio:** dos jugadores comparan scores y discuten estrategias. El score refleja
skill real, no tiempo invertido.

## M3 — La ciudad completa (7–10 días)

- Mapa Harbor District entero (§9): grilla, diagonal, rotonda, puerto, espiral, costanera,
  autopista, túnel, obra.
- Iluminación nocturna, neón, reflejos húmedos.
- Zonas de multiplicador.
- Editor de mapa (`?editor=1`).
- Tráfico básico.

**Criterio:** un run de 90 s se puede hacer 10 veces con rutas distintas y todas se
sienten diferentes.

## M4 — Audio (3–4 días)

- Motor sintetizado con pitch continuo, backfires, turbo.
- Neumáticos, impactos, ambiente, túnel.
- Música generativa reactiva al combo.
- Mezcla y panel de volúmenes.

**Criterio:** jugar con auriculares es notoriamente mejor que jugar en mute.

## M5 — El garage y la economía (7–10 días)

- Save/load completo con migraciones y export/import.
- Todas las monedas y conversiones (§8.5).
- Upgrades del auto que **afectan la física**.
- Setup con sliders y presets.
- Sponsors, staff, salas del garage.
- Ingreso pasivo + ganancias offline con modal de bienvenida.
- Pantalla del garage isométrica que crece visualmente.

**Criterio:** un jugador juega 45 minutos seguidos alternando runs y compras sin
aburrirse. Verificable con el test de "siempre hay 3 cosas comprables".

## M6 — Contenido y variedad (7–10 días)

- Roster completo de 13 autos, cada uno con feel propio.
- Customización visual (pintura, vinilos, llantas, kits, neón).
- Contratos procedurales + contrato diario + rachas.
- Modos: Time Attack, Gymkhana, Ghost diario.
- Sistema de niveles del auto + perks.

**Criterio:** hay 10+ horas de progresión sin que se sienta repetitivo.

## M7 — Prestige y pulido (5–7 días)

- Prestige + árbol de Legacy.
- Eventos temporales.
- Onboarding de 90 segundos (§17.5).
- Accesibilidad completa.
- Auto-calidad y presets.
- Controles touch.
- Pase de balance con datos reales de playtest.

**Criterio:** todo el checklist de §24 en verde.

## M8 — Post-lanzamiento (continuo)

- Mapa 2: **"Mount Kaida"** — un touge de montaña, curvas encadenadas, horquillas,
  guardarraíles, niebla, cámara con más zoom. Contrasta totalmente con la ciudad.
- Mapa 3: **"Silo Complex"** — un complejo industrial abandonado, de día, polvoriento.
- Modo Tandem y Persecución.
- Replays guardables y compartibles como string.
- Fotomodo.

---

# 23. Legal, originalidad y anti-patrones

## 23.1 Qué está terminantemente prohibido

- Usar cualquier asset (modelo, textura, sonido, música, fuente, ícono, UI) de Drift
  Legends, CarX Drift Racing, Assetto Corsa, Forza, Need for Speed, Initial D, o cualquier
  otro juego comercial.
- Usar nombres, logos o siluetas reconocibles de marcas de autos reales (Nissan, Toyota,
  BMW, etc.). Los autos son **diseños originales inspirados en arquetipos de época**, con
  nombres inventados.
- Usar nombres o marcas de sponsors reales.
- Copiar el layout exacto de un mapa de otro juego.
- Copiar código de otro proyecto sin licencia compatible.

## 23.2 Qué sí está bien (y es lo que hacemos)

- Inspirarse en el **feel**, la **estructura de progresión** y las **ideas de diseño**.
  Las mecánicas de juego no son propiedad intelectual protegible.
- Evocar arquetipos ("coupé japonés de los 90 con faros escamoteables") sin copiar un
  modelo específico.
- Todo asset generado proceduralmente por nuestro código.
- Assets de licencia libre (CC0, MIT) documentados en `CREDITS.md` con fuente y licencia.

## 23.3 Anti-patrones de diseño (qué NO hacer)

| Anti-patrón | Por qué no | Qué hacer en su lugar |
|---|---|---|
| Barra de energía / vidas | Bloquea el juego, frustra | Jugar siempre gratis e ilimitado |
| Timers de espera para construir | Aburre, empuja a pagar | Todo instantáneo, el gate es el costo |
| Anuncios con recompensa | Rompe el flow, es mendigar | "×2 completando un run" |
| Loot boxes / gacha | Predatorio | Todo se compra directo, precio visible |
| Pop-ups de "¡compra ahora!" | Molesto | Cero pop-ups no solicitados |
| Notificaciones push agresivas | Invasivo | Ninguna notificación |
| Dificultad artificial (rubber banding hostil) | Injusto | Dificultad por diseño de nivel |
| Grinding sin variación | Aburre | Contratos procedurales + modos |
| Física "de goma" que castiga | Rompe el Pilar 1 | Asistencias siempre activas |
| Cámara que da náuseas | Inaceptable | Cámara sigue velocidad, shake toggleable |
| Menús de 5 niveles de profundidad | Fricción | Máximo 2 clics para manejar |
| Tutorial de 10 minutos con texto | Nadie lo lee | Onboarding de 90 s manejando |

---

# 24. Definition of Done

El juego está terminado cuando **todos** estos ítems están en verde:

### Feel
- [ ] Un jugador nuevo hace un drift de 3+ s en < 90 s de juego
- [ ] Se puede mantener un drift de 20 s en la rotonda sin trompear, con inputs digitales
- [ ] El auto se auto-endereza en ~1.2 s al soltar todo, sin trompo
- [ ] Los 13 autos se sienten distintos en la primera curva
- [ ] Cada tier de combo tiene un feedback audiovisual claro y distinto

### Técnico
- [ ] 60 FPS estables en el escenario de estrés (200 props, 2000 partículas, 4000 marcas)
- [ ] Heap plano durante un run (sin allocations en el hot path)
- [ ] Física determinista: test de replay pasa
- [ ] Cero NaN bajo fuzzing de 10.000 ticks
- [ ] Cero requests de red en runtime
- [ ] Bundle < 3 MB
- [ ] Todos los tests de §20.3 pasan
- [ ] `sim/` no importa `three` (lint rule activa)

### Contenido
- [ ] Mapa Harbor District completo con las 9 zonas
- [ ] 13 autos con specs, visuales y audio propios
- [ ] 12 categorías de upgrade × ~14 niveles promedio
- [ ] 10 sponsors × 25 niveles
- [ ] 8 roles de staff
- [ ] 7 salas de garage + 8 bahías
- [ ] 10 tipos de contrato procedural
- [ ] 9 nodos de árbol de Legacy
- [ ] 9 modos de juego

### Meta
- [ ] Test de "siempre hay 3 cosas comprables" pasa en 100 estados simulados
- [ ] Ganancias offline funcionan con modal de bienvenida
- [ ] Prestige funciona y conserva lo correcto
- [ ] Save/load robusto + export/import + migraciones desde v1
- [ ] Un jugador llega a prestige en ~20 h de juego mixto

### UX
- [ ] Onboarding de 90 s sin una sola pantalla de texto bloqueante
- [ ] Máximo 2 clics para manejar desde cualquier pantalla
- [ ] Toda compra muestra el efecto antes de comprar
- [ ] Controles funcionan con teclado, gamepad y touch
- [ ] Todas las opciones de accesibilidad de §17.4.6 implementadas
- [ ] Contraste AA en todo el texto

---

# 25. Apéndices: tablas de constantes

## A. Spec de referencia — Kite 300ZT (el auto "default", tunear todo contra este)

```ts
{
  mass: 1240,
  inertiaYaw: 1580,
  lengthFront: 1.22,
  lengthRear: 1.38,
  trackWidth: 1.52,
  cgHeight: 0.50,

  tireStiffnessFront: 11.5,
  tireStiffnessRear: 9.2,
  peakGripFront: 1.58,
  peakGripRear: 1.34,
  tireFalloff: 0.34,

  torqueCurve: [[900, 150], [2000, 240], [3200, 295], [4800, 310], [6000, 300], [7200, 250]],
  redline: 7200,
  idleRpm: 900,
  gearRatios: [3.32, 2.05, 1.44, 1.00, 0.82, 0.68],
  finalDrive: 3.90,
  drivetrainEfficiency: 0.88,
  wheelRadius: 0.325,
  engineBrakeTorque: 85,

  maxSteerAngle: 0.63,          // 36°
  steerSpeed: 4.6,
  steerReturnSpeed: 6.8,
  steerSpeedFalloff: 0.55,

  brakeTorqueFront: 2400,
  brakeTorqueRear: 1350,
  handbrakeGripMultiplier: 0.30,

  dragCoefficient: 0.42,
  rollingResistance: 12.0,
  downforceCoefficient: 0.05,
}
```

## B. Constantes globales

```ts
export const PHYSICS_DT        = 1/120;
export const MAX_FRAME_DELTA   = 0.25;
export const GRAVITY           = 9.81;

export const DRIFT_MIN_ANGLE   = DEG(12);
export const DRIFT_MAX_ANGLE   = DEG(100);
export const DRIFT_MIN_SPEED   = 8.0;      // m/s
export const DRIFT_MIN_SLIP    = 2.0;      // m/s
export const CHAIN_GRACE       = 1.2;      // s
export const SCORE_BASE_RATE   = 120;

export const SPIN_ASSIST_ANGLE = DEG(100);
export const RESCUE_SPEED      = 4.0;
export const RESCUE_ANGLE      = DEG(40);

export const HEAT_CELL_SIZE    = 20;       // m
export const HEAT_DECAY        = 0.15;     // /s
export const HEAT_MAX          = 3.0;

export const COLLISION_CELL    = 8;        // m
export const RESTITUTION       = 0.25;
export const SCRAPE_THRESHOLD  = 3.0;      // m/s
export const CRASH_THRESHOLD   = 9.0;      // m/s

export const OFFLINE_CAP_BASE  = 2 * 3600; // s
export const OFFLINE_EFF_BASE  = 0.40;
export const PRESTIGE_MIN_HYPE = 10e6;
```

## C. Curva de tiers de combo (referencia rápida)

| Tiempo (s) | Mult | Label | Color | Efecto |
|---|---|---|---|---|
| 0.0 | ×1.0 | — | blanco | — |
| 1.5 | ×1.5 | NICE | cyan | pulso chico |
| 3.0 | ×2.0 | GOOD | cyan | pulso + partículas |
| 5.0 | ×3.0 | GREAT | verde | pulso + humo +20% |
| 8.0 | ×4.5 | AMAZING | ámbar | + capa de música |
| 12.0 | ×6.5 | INSANE | magenta | + zoom de cámara |
| 18.0 | ×9.0 | LEGENDARY | magenta brillante | + aberración cromática |
| 26.0 | ×12.0 | APEX | blanco puro + arcoíris | + slow-mo de 0.3 s al banquear |

## D. Umbrales de nivel del jugador

`xpParaNivel(n) = 500 * n^1.65`

| Nivel | XP acumulada | Desbloquea |
|---|---|---|
| 1 | 0 | — |
| 5 | 9.900 | Time Attack |
| 8 | 22.400 | Ghost diario |
| 10 | 34.300 | Gymkhana |
| 15 | 71.800 | Persecución |
| 20 | 122.000 | Tandem |
| 25 | 184.000 | Endurance |
| 30 | 257.000 | Mapa Mount Kaida |
| 40 | 429.000 | Mapa Silo Complex |
| 50 | 640.000 | Título "Apex Legend" |

---

# CIERRE — cómo arrancar mañana

1. `npm create vite@latest . -- --template vanilla-ts`, agregar three, vitest.
2. Implementar **M0 y nada más**: cubo + física §5 + cámara §7 + panel de debug.
3. Tunear hasta que el cubo sea divertido. **Este paso decide el juego.** Puede llevar
   3 días o 10; no importa, no seguir hasta que esté.
4. Recién ahí, M1.

Si en algún momento hay que elegir entre "más contenido" y "el auto se siente mejor",
**siempre gana el auto**.
