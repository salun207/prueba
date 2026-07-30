# Huntly — prospección de clientes para tu chatbot

Panel inspirado en [tryhuntly.com](https://tryhuntly.com/es), reorientado a
**vender chatbots de WhatsApp**: escanea Google Maps por nicho y ciudad
(simulado, datos ficticios generados en el cliente), detecta negocios que
pierden consultas y prepara un **mensaje de WhatsApp personalizado para cada
negocio** para ofrecerles tu chatbot.

## Cómo usarla

Abre `index.html` en el navegador. No necesita servidor ni dependencias:
todo (HTML, CSS y JS) va en un único archivo.

## Campañas

El selector de la barra superior cambia la campaña activa, y con ella los
rubros disponibles y los mensajes:

- **Nexa** — venta de asistentes de WhatsApp. Busca negocios que pierden
  consultas (sin web, sin chat, turnos solo por teléfono) en los 37
  rubros del catálogo.
- **DogStay** — plataforma para mascotas. Los rubros se agrupan por lo que
  se les propone: *se suman a la plataforma* (paseadores, cuidadores,
  guarderías caninas, adiestradores) o *alianzas y derivaciones*
  (veterinarias, peluquerías caninas, pet shops), cada uno con su propio
  mensaje.

Cambiar de campaña limpia los resultados y la cola, porque pertenecen a
la campaña anterior. Los leads guardados se mantienen.

## Fuentes de contactos

Tres, y se eligen en Ajustes:

1. **OpenStreetMap** (por defecto) — negocios reales, **sin clave ni
   tarjeta**. Nominatim resuelve la ciudad y Overpass devuelve los
   negocios del rubro con nombre, teléfono, dirección, sitio web y
   horario. No trae reseñas ni valoraciones, así que esos datos no se
   muestran y los mensajes se adaptan solos.
2. **Google Places** — negocios reales con reseñas y valoraciones.
   Requiere clave de Google Cloud con tarjeta asociada (ver más abajo).
3. **Importar mi propia lista** — se pega la lista (`nombre, teléfono` y,
   opcionalmente, `valoración, reseñas`; acepta comas, punto y coma o
   tabulaciones, así que se puede pegar desde una planilla) y la app arma
   las fichas y los mensajes. No necesita ninguna API.

Los datos de demostración **no permiten enviar mensajes**: los teléfonos
son inventados y podrían pertenecer a cualquier persona, así que el envío
queda bloqueado hasta que la fuente sea real o importada.

Algunos rubros no existen en OpenStreetMap porque son oficios sin local
fijo (paseadores de perros, cuidadores de mascotas). En esos casos la app
lo avisa y conviene usar Google Places o una lista propia.

> Datos de OpenStreetMap © colaboradores de OpenStreetMap, bajo licencia
> ODbL.

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

## Envío de mensajes

Hay dos modos, y conviven: el asistido funciona siempre, el automático
requiere configuración.

### Asistido (sin configurar nada)

La app arma la cola y prepara el mensaje de cada negocio; al tocar
«Enviar y seguir» abre `wa.me` con el texto ya cargado y el envío final
lo confirma la persona. Permite mandar decenas de mensajes en pocos
minutos desde el WhatsApp de siempre.

### Automático — WhatsApp Cloud API (oficial de Meta)

Con las credenciales cargadas en Ajustes, el botón «Enviar todos
automáticamente» dispara la cola completa sin intervención: la app llama
a la API de Meta para cada negocio, espacia los envíos y va marcando los
leads como contactados.

Configuración (una sola vez):

1. Crear una app de tipo Empresa en
   [developers.facebook.com](https://developers.facebook.com) y agregarle
   el producto **WhatsApp**.
2. Copiar el **Phone Number ID** y el **token de acceso** desde
   «WhatsApp → Configuración de la API».
3. Crear una plantilla de categoría **Marketing** con el texto que la
   propia app muestra listo para copiar, y esperar la aprobación de Meta.
4. Pegar el nombre de la plantilla en Ajustes y usar «Probar conexión».

Meta exige que el **primer** mensaje a alguien que nunca escribió use una
plantilla aprobada; por eso el envío automático usa la plantilla, con las
variables completadas por negocio (nombre, rubro, ciudad, beneficio y
firma). Cuando el negocio responde se abre una ventana de 24 horas en la
que ya se puede escribir texto libre.

**Relay opcional** (`whatsapp-relay-worker.js`): si el navegador bloquea
la llamada directa a Meta por CORS, ese archivo se pega en un Cloudflare
Worker gratuito y se pone su URL en Ajustes. También permite guardar el
token como variable de entorno del worker, fuera del navegador.

> Automatizar WhatsApp por fuera del canal oficial (bots no oficiales o
> extensiones de WhatsApp Web) suele terminar en el bloqueo del número.
> Por eso los dos modos de esta app son el asistido y la API oficial.
