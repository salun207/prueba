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
- **Campaña**: arma una cola con los negocios filtrados por puntuación y
  los recorre uno por uno. Cada negocio lleva su propio mensaje ya
  personalizado; al tocar «Enviar y seguir» se abre WhatsApp con el texto
  cargado, el lead queda marcado como contactado y la app pasa al
  siguiente. Se puede saltear, pedir otra variante, cortar la tanda o
  exportar la cola completa a CSV.
- **Analítica**: embudo de ventas, leads por nicho, tasa de contacto y de
  cierre, pipeline en € e historial de búsquedas.
- **Ajustes**: tu nombre, el nombre de tu chatbot, enlace a demo, tarifa
  mensual y posdata fija — todo se inyecta en los mensajes y en los
  cálculos de valor.
- Tema claro/oscuro (sigue el sistema, con conmutador manual) y diseño
  adaptable a móvil.

## Negocios reales (Google Places)

La app tiene dos fuentes de datos, se eligen en **Ajustes**:

- **Demo**: negocios ficticios generados en el navegador (por defecto).
- **Google Places**: negocios reales de Google Maps. Requiere una clave
  de API propia:
  1. Crear un proyecto en [console.cloud.google.com](https://console.cloud.google.com).
  2. Habilitar **Places API (New)** en «APIs y servicios».
  3. Crear una **clave de API** en «Credenciales» y pegarla en Ajustes.

La clave queda guardada solo en `localStorage` del navegador y las
llamadas van directo de tu navegador a Google (sin servidores de por
medio). Google pide tarjeta y cobra por uso pasada la capa gratuita
mensual de la API.

En modo real la app no inventa datos: usa nombre, dirección, teléfono,
valoración, reseñas, web y horario tal como los publica Google, y las
señales que no puede verificar (p. ej. si responden reseñas) no se
muestran ni se afirman en los mensajes. Las consultas/mes siguen siendo
una estimación calculada a partir de las reseñas.

> Nota: la vista previa hospedada en claude.ai bloquea conexiones
> externas, así que el modo real solo funciona abriendo `index.html`
> directamente en el navegador (o alojándolo en tu propio hosting).

## Sobre el envío de mensajes

WhatsApp no expone una API abierta que permita a una página web enviar
mensajes por su cuenta, y automatizarlo por fuera (bots no oficiales,
extensiones de WhatsApp Web) suele terminar en el bloqueo del número.

Por eso la campaña es **asistida**: la app arma la cola y prepara el
mensaje de cada negocio, abre `wa.me` con el texto ya cargado y el envío
final lo confirma la persona con un toque. En la práctica permite mandar
decenas de mensajes en pocos minutos sin arriesgar la cuenta.

Para automatización real hay dos caminos, y la exportación a CSV de la
cola (con el teléfono ya normalizado y el mensaje de cada negocio) sirve
como entrada para ambos:

- **WhatsApp Business Platform (API oficial)** vía un proveedor como
  Twilio o 360dialog. Requiere plantillas aprobadas por Meta para
  iniciar conversaciones y tiene costo por mensaje.
- **Herramientas de terceros** que manejan el envío por su cuenta.
