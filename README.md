# NEON APEX

Juego de manejo arcade en tercera persona con **dos modos**: **Tráfico** — autopista
infinita esquivando autos a toda velocidad — y **Drift** — circuitos cerrados encadenando
derrapes. Se elige en el menú y comparten garage, plata y reputación. Corre en el
navegador, sin instalación y sin conexión.

**Jugar ya:** https://claude.ai/code/artifact/1424160b-aec9-439c-94e0-8a0d310ca62d

```bash
npm install
npm run dev           # http://localhost:5173
npm test              # 51 tests de física, autopista, economía, circuitos y saves
npm run build         # typecheck + bundle
npm run build:single  # todo en un solo HTML autocontenido (dist-single/)
npm run smoke         # prueba en Chromium headless (requiere playwright)
```

## Controles

| Acción | Teclado | Gamepad |
|---|---|---|
| Acelerar / Frenar | `W` `S` (o flechas) | RT / LT |
| Girar | `A` `D` | Stick izquierdo |
| Freno de mano (solo drift) | `Espacio` | A / X |
| Reset del auto | `R` | Y / △ |
| Cambiar cámara | `C` | RB |
| Pausa | `Esc` | Start |

Táctil: mitad inferior de la pantalla — izquierda freno de mano, centro volante
(arrastrar), derecha freno y acelerador.

## Modo Tráfico

Una autopista **infinita**: el camino se describe con una función analítica de la
distancia (`centerX(z) = sin(z/620)·74 + sin(z/233 + 1.7)·21`) y la geometría se recicla
por cinta transportadora alrededor del jugador. No hay mapa que se termine ni hay dos
tramos iguales.

El run dura **hasta que chocás fuerte**: un roce te saca el combo, un impacto a más de
~32 km/h relativos o de frente termina la corrida. Los puntos salen de tres cosas:

```
puntos/metro = velocidad × riesgo × combo × 1.4
```

- **Velocidad**: por debajo de 55 km/h no paga nada; escala hasta ×2.2.
- **Riesgo**: ir de **contramano** paga **×2.2**.
- **Combo**: cada pasada al ras (a menos de 1.3 m) lo sube medio punto hasta ×10, y se
  cae solo a los 3 segundos si no seguís arriesgando.

Tres rutas, que se abren con reputación:

| Ruta | Se abre con | Qué es |
|---|---|---|
| **Autopista Costera** | desde el arranque | 3 carriles por mano, doble mano, curvas largas. |
| **Ruta Libre** | 120 ★ | 2 carriles, poco tráfico y muy rápido: el que viene de frente aparece de golpe. |
| **Hora Pico** | 450 ★ | 4 carriles por mano y todos llenos, tráfico lento. La plata está en pasar entre medio. |

En este modo el auto va **plantado**: el perfil de manejo sube el grip trasero, aplana la
caída de la goma pasado el pico y agrega un torque de autoalineación que apunta el morro
hacia el vector velocidad. Se esquiva con reflejos, no peleando el auto.

## Circuitos (modo Drift)

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
drift:   plata = puntos × 0.045 × estilo × asistencias
tráfico: plata = puntos × 0.12  × estilo × asistencias
```

La tasa de tráfico es más alta porque su score crece mucho más lento (metros, no puntos de
combo): un run parecido paga parecido en los dos modos.

En **tráfico** el estilo premia otra cosa: +1.2% por pasada al ras (tope 60), +5% por punto
de combo, +1.2% por segundo de contramano (tope 40), +0.4% por km/h arriba de 140, **+30%**
si llegás entero y **−20%** si terminás chocando.

En **drift**, el estilo premia manejar bien, no manejar mucho:

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

La primera versión sonaba chillona. Se rehízo con tres reglas:

1. **Motor y gomas son ambiente.** Armónicos con caída suave (`PeriodicWave` con
   amplitudes 1/n^1.25 en vez de sierra + distorsión), filtros cerrados y ganancia baja.
   El chirrido de goma pasó de Q=18 (silbido) a Q=3.5 con una capa grave que le da cuerpo.
2. **Las recompensas son la melodía.** Cada premio toca la nota siguiente de una escala
   pentatónica y sube. Encadenar 20 conos suena a que estás subiendo algo, no a ruido.
   Los tiers tocan acordes ascendentes y cobrar el combo resuelve con un arpegio y un
   golpe grave.
3. **La velocidad se escucha.** En 6ª a fondo el rpm casi no se mueve, así que el motor
   solo no da sensación de velocidad: hay una capa de viento (ruido filtrado, ganancia
   cuadrática con la velocidad) y otra de rodadura grave que se vuelve ripio fuera del
   asfalto. Cada auto que pasás dispara un barrido de banda hacia abajo — Doppler — mucho
   más violento si viene de frente, y si lo rozás te toca bocina con caída de tono.

Todo sigue siendo sintetizado en runtime: cero archivos de audio.

## Texturas y autos

Todo procedural, generado en canvas al iniciar: asfalto con árido, fisuras y parches de
reparación; hormigón con juntas; pasto y tierra con matas y piedras; fachadas con grilla
de ventanas (algunas encendidas); rayas de obra en las barreras; chapa corrugada con
óxido en los contenedores. La **calzada de autopista** es una sola textura con el marcado
pintado adentro (líneas de borde, discontinuas de carril, doble amarilla al eje, huellas
de rodada y goma), calculada en metros y recién ahí pasada a píxeles, así el ancho de las
rayas es el real tenga la ruta 2 carriles o 8.

Las **carrocerías** se generan por lofting: se define la silueta con estaciones a lo largo
del auto (ancho y altura del techo en cada punto) y se cose una superficie entre ellas.
Salen capó, parabrisas inclinado, techo, luneta y baúl como una sola cáscara continua, en
nueve siluetas distintas. Los camiones se arman aparte con cajas, porque estirar una
silueta de auto a 10 metros da una gota deforme. Las fachadas usan un shader que escala las UV según el tamaño
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

- **Modos**: Tráfico y Drift. Faltan Time Attack, Gymkhana, persecución y tandem.
- **Tráfico con IA**: los autos de la autopista van a velocidad fija en su carril; no
  cambian de carril, no frenan y no reaccionan al jugador.
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
