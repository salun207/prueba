# NEON APEX

Juego de drift arcade con cámara aérea, mapa de ciudad nocturna y capa tycoon de garage.

**Estado:** diseño. Todavía no hay código.

## Documentos

- [`MEGA_PROMPT.md`](./MEGA_PROMPT.md) — brief completo de implementación: física del
  drift con fórmulas, cámara, sistema de score/combo, diseño del mapa, arte, audio
  sintetizado, economía tycoon, arquitectura, roadmap por milestones y criterios de
  aceptación.

## Resumen

Manejás un auto de tracción trasera por un distrito portuario nocturno con cámara
aérea. Cada derrape suma puntos según ángulo, velocidad y proximidad a las paredes;
soltar el drift limpio los cobra, chocar los pierde. Los puntos se convierten en **Hype**,
el Hype atrae sponsors, y los sponsors generan plata por segundo incluso con el juego
cerrado. Esa plata mejora el auto y el garage, lo que hace que el próximo run rinda más.

Inspirado en el *feel* de Drift Legends y CarX, y en la estructura de progresión de los
idle/tycoon. **Cero assets de terceros:** todos los autos, mapas, texturas y sonidos son
originales o generados proceduralmente. Ver §23 del mega prompt.

## Stack previsto

TypeScript + Three.js + física propia + Web Audio API. Sin backend, sin dependencias de
assets, corre offline en el navegador.
