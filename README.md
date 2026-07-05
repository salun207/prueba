# Huntly — prospección de clientes para tu chatbot

Panel inspirado en [tryhuntly.com](https://tryhuntly.com/es), reorientado a
**vender chatbots de WhatsApp**: escanea Google Maps por nicho y ciudad
(simulado, datos ficticios generados en el cliente), detecta negocios que
pierden consultas y prepara un **mensaje de WhatsApp personalizado para cada
negocio** para ofrecerles tu chatbot.

## Cómo usarla

Abre `index.html` en el navegador. No necesita servidor ni dependencias:
todo (HTML, CSS y JS) va en un único archivo.

## Funcionalidades

- **31 nichos** agrupados: 8 tipos de clínicas (dental, estética, fisio,
  veterinaria, podología, psicología, oftalmología, nutrición), belleza,
  hostelería, fitness, hogar y urgencias, automoción y servicios
  profesionales.
- **Señales de oportunidad por negocio**: sin web, web sin chat, cita solo
  por teléfono, no responde reseñas, horas del día sin atención — con una
  puntuación de idoneidad para chatbot (0–99).
- **Descripción generada de cada negocio** con su reputación, sus señales y
  una estimación de consultas al mes que pierde.
- **Mensaje de WhatsApp personalizado por negocio**: usa su nombre, su
  valoración real, sus señales concretas y el caso de uso de su nicho.
  Se abre en un modal donde puedes editarlo, pedir otra variante, copiarlo
  o abrir WhatsApp con el texto ya cargado.
- **Paneles de datos**: KPIs de la búsqueda (oportunidades altas, consultas
  perdidas estimadas, valor potencial €/mes según tu tarifa), gráficos de
  señales detectadas y distribución de puntuaciones.
- **Mis leads**: cartera persistente (`localStorage`) con embudo de estados
  (Nuevo → Contactado → Interesado → Demo agendada → Cliente / Descartado),
  KPIs de contacto y cierre, filtro por estado y export CSV con la
  descripción y el mensaje incluidos.
- **Analítica**: embudo de ventas, leads por nicho, tasa de contacto y de
  cierre, pipeline en € e historial de búsquedas.
- **Ajustes**: tu nombre, el nombre de tu chatbot, enlace a demo, tarifa
  mensual y posdata fija — todo se inyecta en los mensajes y en los
  cálculos de valor.
- Tema claro/oscuro (sigue el sistema, con conmutador manual) y diseño
  adaptable a móvil.

> Los negocios mostrados son ficticios. Para encontrar negocios reales
> haría falta un backend conectado a la API de Google Places.
