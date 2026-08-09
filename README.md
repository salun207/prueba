# NEON APEX

Juego de drift arcade en tercera persona. Circuitos al atardecer, cámara de persecución,
y toda la plata sale de driftear. Corre en el navegador, sin instalación y sin conexión.

**Jugar ya:** https://claude.ai/code/artifact/1424160b-aec9-439c-94e0-8a0d310ca62d

```bash
npm install
npm run dev           # http://localhost:5173
npm test              # 41 tests de física, economía, circuitos y saves
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

## Circuitos

Tres, y se abren con **reputación (★)**, que se gana drifteando:

| Circuito | Se abre con | Qué es |
|---|---|---|
| **Escuela Apex** | desde el arranque | Circuito de drift: pista de 21 m, curvas largas y muros de goma cerca para raspar. No hay nada que te choque de frente — es donde se aprende a encadenar. |
| **Harbor District** | 150 ★ | La ciudad portuaria abierta: grilla, avenida diagonal, rotonda, contenedores y tráfico. |
| **Cañón Kaida** | 600 ★ | 13 m de ancho y horquillas encadenadas entre paredes de roca. Un error y perdés el combo. |

Los dos circuitos cerrados se generan con un radio que varía con el ángulo
(`r(θ) = R0 + A1·sin(2θ) + A2·sin(3θ)`): sale una pista cerrada y suave por
construcción, con curvones largos y horquillas cerradas, sin dibujar nada a mano.

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

## Qué tan fácil es driftear

Ajustado para que enganche antes:

- El contravolante asistido pasó de 0.42 a **0.6** en estándar, y al soltar el volante
  el auto se autocentra al doble de fuerza.
- Los neumáticos pierden grip antes (`falloff` bajó ~0.08 en todo el roster) y el freno
  de mano suelta más el tren trasero.
- La ventana que puntúa se abrió: de 12°–95° a **10°–105°**, desde 23 km/h en vez de 29, y
  la ventana para encadenar curvas pasó de 1.2 s a **1.6 s**.
- El anti-trompo actúa antes y amortigua más fuerte.

Si querés que sea más difícil, en Opciones está el preset **pro**: menos ayuda y +35% de
pago.

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

## Texturas y autos

Todo procedural, generado en canvas al iniciar: asfalto con árido, fisuras y parches de
reparación; hormigón con juntas; pasto y tierra con matas y piedras; fachadas con grilla
de ventanas (algunas encendidas); rayas de obra en las barreras; chapa corrugada con
óxido en los contenedores. Las fachadas usan un shader que escala las UV según el tamaño
real de cada edificio, para que las ventanas midan lo mismo en uno de 12 m y en uno de 40.

Las **fotos de los autos** del garage son el mismo modelo 3D que manejás, renderizado en
3/4 con luz de estudio a un render target y guardado como imagen. No hay fotos externas:
la foto ES el auto, con tu color de pintura.

## Estética

Atardecer, no noche de neón. Cielo de degradado ámbar → violeta
con el sol dibujado en el shader, sombras largas, y separación por **tono**: la calle es
gris frío y todo lo que la rodea es tierra cálida, para que el asfalto se lea aunque
media cuadra esté en sombra.

## Qué hay adentro

**Física** (`src/sim/`, sin dependencias de render). Modelo de bicicleta de 2 ejes con
curva de neumático de `falloff` ajustable, transferencia de peso, círculo de fricción,
wheelspin y asistencias siempre activas. Timestep fijo de 1/120 s, determinista.

**Score.** Banking: los puntos se acumulan derrapando y se cobran al salir limpio.
8 tiers de combo hasta ×12, ventana de gracia de 1.6 s para encadenar curvas, bonus de
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
- **Verticalidad**: la simulación es plana, así que no hay peraltes, saltos ni la
  autopista elevada de la ciudad.
- **Replays y fotomodo.**
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
