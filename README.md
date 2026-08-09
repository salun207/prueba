# NEON APEX

Juego de drift arcade en tercera persona. Ciudad portuaria al atardecer, cámara de
persecución, y toda la plata sale de driftear. Corre en el navegador, sin instalación y
sin conexión.

**Jugar ya:** https://claude.ai/code/artifact/1424160b-aec9-439c-94e0-8a0d310ca62d

```bash
npm install
npm run dev           # http://localhost:5173
npm test              # 38 tests de física, economía y saves
npm run build         # typecheck + bundle
npm run build:single  # todo en un solo HTML autocontenido (dist-single/)
npm run smoke         # prueba en Chromium headless (requiere playwright)
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

Táctil: mitad inferior de la pantalla — izquierda freno de mano, centro volante
(arrastrar), derecha freno y acelerador.

## Cómo se gana plata

Manejando, y nada más. **No hay ingreso pasivo, ni sponsors, ni staff, ni ganancias
offline, ni prestige.** Si el juego está cerrado, no pasa nada.

```
plata = puntos × 0.045 × estilo × asistencias
```

El **estilo** es el multiplicador que premia manejar bien, no manejar mucho:

| Concepto | Efecto |
|---|---|
| Combo máximo | +10% por punto de multiplicador |
| Curvas encadenadas | +3% cada una (tope 12) |
| Transiciones | +2% cada una (tope 15) |
| Wall rides | +3% cada uno (tope 10) |
| Run sin chocar | **+35%** |
| Choques | −5% cada uno (tope −30%) |

Y las **asistencias** cambian el pago: casual −20%, estándar normal, pro **+35%**. Bajar
las ayudas es el incentivo honesto para mejorar, en vez de que te regalen plata por
esperar.

El resultado: con el mismo score, un run prolijo y encadenado paga más del doble que uno
sucio. La pantalla de resultados muestra el desglose línea por línea, así siempre sabés
por qué te pagaron lo que te pagaron. Durante el run, el contador abajo a la izquierda
muestra en vivo la plata que ya te ganaste.

Los dos autos de arriba de todo se abren con **reputación (★)**, que también se gana
solo drifteando.

## Cámara en tercera persona

La decisión que define el encuadre: el rumbo de la cámara sigue casi todo el **vector
velocidad** y solo un 28% el yaw del auto. Si siguiera el yaw, el auto se vería siempre
de culata y el drift no se leería; siguiendo la velocidad, el auto entra cruzado en el
cuadro y ves el ángulo que estás manteniendo.

Tres cámaras con `C`: Persecución (default), Corta y Cinemática. El FOV se abre con la
velocidad, la cámara retrocede con el combo, y hace un sondeo contra el mundo para
meterse cerca del auto cuando hay una pared atrás.

## Audio

La primera versión sonaba chillona. Se rehízo con dos reglas:

1. **Motor y gomas son ambiente.** Armónicos con caída suave (`PeriodicWave` con
   amplitudes 1/n^1.25 en vez de sierra + distorsión), filtros cerrados y ganancia baja.
   El chirrido de goma pasó de Q=18 (silbido) a Q=3.5 con una capa grave que le da cuerpo.
2. **Las recompensas son la melodía.** Cada premio toca la nota siguiente de una escala
   pentatónica y sube. Encadenar 20 conos suena a que estás subiendo algo, no a ruido.
   Los tiers tocan acordes ascendentes y cobrar el combo resuelve con un arpegio y un
   golpe grave.

Todo sigue siendo sintetizado en runtime: cero archivos de audio.

## Estética

Atardecer en el puerto industrial, no noche de neón. Cielo de degradado ámbar → violeta
con el sol dibujado en el shader, sombras largas, y separación por **tono**: la calle es
gris frío y todo lo que la rodea es tierra cálida, para que el asfalto se lea aunque
media cuadra esté en sombra.

## Qué hay adentro

**Física** (`src/sim/`, sin dependencias de render). Modelo de bicicleta de 2 ejes con
curva de neumático de `falloff` ajustable, transferencia de peso, círculo de fricción,
wheelspin y asistencias siempre activas. Timestep fijo de 1/120 s, determinista.

**Score.** Banking: los puntos se acumulan derrapando y se cobran al salir limpio.
8 tiers de combo hasta ×12, ventana de gracia de 1.2 s para encadenar curvas, bonus de
transición, wall ride, threading, full lock, donut, near miss, y anti-farming por heat map.

**Ciudad.** "Harbor District", 900 × 900 m procedurales: grilla, avenida diagonal a 30°,
rotonda, laberinto de contenedores, costanera mojada, obra en tierra y túnel.

**Autos.** 13 modelos originales, 12 categorías de mejora que cambian la física de verdad,
7 parámetros de setup gratis, pintura, llantas y kits (el widebody ensancha la vía real).

**Desafíos.** 3 activos + 1 diario, generados proceduralmente y escalados a tu
rendimiento. Pagan plata extra; si no los hacés, no perdés nada.

## Qué NO está implementado

- **Modos**: solo el run cronometrado de 2 minutos. Faltan Time Attack, Gymkhana,
  persecución y tandem.
- **Verticalidad**: la simulación es plana, así que no están la autopista elevada ni el
  estacionamiento en espiral.
- **Mapas 2 y 3**, replays y fotomodo.
- **Performance real**: el smoke test corre sobre SwiftShader (software), así que no mide
  FPS representativos. Los presets de calidad y el auto-ajuste están implementados, pero
  el objetivo de 60 FPS todavía no se verificó sobre una GPU real.

## Documentación

[`MEGA_PROMPT.md`](./MEGA_PROMPT.md) — el brief de diseño e implementación: fórmulas de
física, scoring, diseño del mapa, arquitectura y criterios de aceptación. Incluye las dos
trampas del modelo de bicicleta que costaron debugging real acá (§5.5).

## Originalidad

Inspirado en el *feel* de Drift Legends y CarX. **Cero assets de terceros**: no hay un solo
archivo de imagen, modelo ni sonido en el repo. Todos los autos, mapas, texturas y sonidos
son originales o generados proceduralmente en runtime. Ninguna marca real.
