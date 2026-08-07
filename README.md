# NEON APEX

Juego de drift arcade con cámara aérea, mapa de ciudad nocturna y capa tycoon de garage.
Corre en el navegador, sin instalación y sin conexión.

**Jugar ya:** https://claude.ai/code/artifact/1424160b-aec9-439c-94e0-8a0d310ca62d

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 34 tests de física, economía y contratos
npm run build      # typecheck + bundle
npm run smoke      # prueba en Chromium headless (requiere playwright)
npm run build:single  # todo en un solo HTML autocontenido (dist-single/)
```

## Controles

| Acción | Teclado | Gamepad |
|---|---|---|
| Acelerar / Frenar | `W` `S` (o flechas) | RT / LT |
| Girar | `A` `D` | Stick izquierdo |
| Freno de mano | `Espacio` | A / X |
| Reset del auto | `R` | Y / △ |
| Cambiar cámara | `C` | RB |
| Pausa | `Esc` | Start |

También hay controles táctiles: mitad inferior de la pantalla, izquierda = freno de mano,
centro = volante (arrastrar), derecha = freno y acelerador.

## Qué hay implementado

**Física** (`src/sim/`, sin dependencias de render). Modelo de bicicleta de 2 ejes con
curva de neumático de `falloff` ajustable, transferencia de peso, círculo de fricción,
wheelspin, caja automática con corte en el cambio, y asistencias siempre activas
(contravolante, anti-trompo con amortiguación progresiva, grip de rescate). Timestep fijo
de 1/120 s y determinista.

**Score.** Banking: los puntos se acumulan mientras derrapás y se cobran al salir limpio.
8 tiers de combo hasta ×12, ventana de gracia de 1.2 s para encadenar curvas, bonus de
transición, wall ride, threading, full lock, donut, near miss, y anti-farming por heat map
de celdas de 20 m.

**Ciudad.** "Harbor District", 900 × 900 m generados proceduralmente: grilla, avenida
diagonal a 30°, rotonda, laberinto de contenedores en el puerto, costanera mojada, obra en
tierra, plazas y túnel. ~780 obstáculos y ~550 destructibles, con multiplicadores por zona.
Tráfico opcional con bonus de near miss.

**Tycoon.** 10 sponsors, 8 roles de staff, 7 salas de garage, 8 bahías, ingreso pasivo
(`0.9 · hype^0.62 · multiplicadores`), ganancias offline con modal de bienvenida,
contratos procedurales + diario con racha, y prestige con árbol de Legacy de 9 nodos.

**Autos.** 13 modelos originales con specs distintas, 12 categorías de upgrade que afectan
la física de verdad, 7 parámetros de setup gratis, pintura, llantas, kits (el widebody
ensancha la vía real) y neón.

**Render y audio.** Three.js con post-procesado propio (bloom, viñeta, grano, aberración,
curva filmica), humo y chispas por GPU, marcas de goma en un draw call, y todo el audio
sintetizado con Web Audio: motor de pitch continuo, backfires, turbo, gomas, impactos y
música synthwave generativa que reacciona al combo.

## Qué NO está implementado todavía

Honestidad sobre el alcance frente al brief:

- **Modos**: solo Free Roam y run cronometrado de 90 s. Faltan Time Attack, Gymkhana,
  Persecución, Tandem, Endurance y Ghost diario.
- **Verticalidad**: la simulación es plana. Por eso no están la autopista elevada ni el
  estacionamiento en espiral (necesitan colisión multinivel).
- **Garage isométrico**: la capa tycoon funciona completa, pero la pantalla es de menús,
  no la vista del galpón que crece visualmente.
- **Mapas 2 y 3** (Mount Kaida, Silo Complex), replays, fotomodo y vinilos por capas.
- **Performance real**: el smoke test corre sobre SwiftShader (software), así que no mide
  FPS representativos. Los presets de calidad y el auto-ajuste están implementados, pero
  el objetivo de 60 FPS todavía no se verificó sobre una GPU real.

## Documentación

[`MEGA_PROMPT.md`](./MEGA_PROMPT.md) — el brief completo de diseño e implementación:
fórmulas de física, cámara, scoring, diseño del mapa, economía, arquitectura, roadmap y
criterios de aceptación. Incluye las dos trampas del modelo de bicicleta que costaron
debugging real acá (§5.5).

## Originalidad

Inspirado en el *feel* de Drift Legends y CarX y en la estructura de los idle/tycoon.
**Cero assets de terceros**: no hay un solo archivo de imagen, modelo ni sonido en el
repo. Todos los autos, mapas, texturas y sonidos son originales o generados
proceduralmente en runtime. Ninguna marca real. Ver §23 del mega prompt.
