# Huntly — réplica del dashboard

Réplica funcional del panel de [tryhuntly.com](https://tryhuntly.com/es), una
herramienta de prospección para freelancers y agencias que venden sitios web:
escanea Google Maps por nicho y ciudad, detecta negocios sin página web,
extrae su teléfono y les asigna una puntuación de oportunidad.

## Cómo usarla

Abre `index.html` en el navegador. No necesita servidor ni dependencias:
todo (HTML, CSS y JS) va en un único archivo.

## Funcionalidades

- **Búsqueda por nicho y ciudad** con escaneo simulado de Google Maps
  (los datos de negocios son ficticios y se generan en el cliente).
- **Tabla de resultados**: valoración y reseñas, teléfono, estado del sitio
  web (sin web / web obsoleta / con web) y puntuación de oportunidad 0–99.
- **Acciones por lead**: llamar (`tel:`), abrir WhatsApp con un mensaje de
  apertura auto-generado (`wa.me`) y guardar en la cartera.
- **Mis leads**: cartera persistente en `localStorage`, con estados
  (Nuevo → Contactado → En negociación → Cliente) y exportación a CSV.
- **Ajustes**: plantilla del mensaje de WhatsApp con variables
  `{negocio}`, `{ciudad}`, `{nicho}` y firma.
- **Plan Gratis** simulado con límite de 3 búsquedas.
- Tema claro/oscuro (sigue el sistema, con conmutador manual) y diseño
  adaptable a móvil.
