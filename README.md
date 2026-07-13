# Nexa IA — Chatbots a medida

Sitio web de Nexa IA: una landing con un **configurador interactivo de chatbots**
(nombre, tono de voz, color de marca, canal y mensaje de bienvenida, con vista
previa en vivo) y un formulario de solicitud que hereda esa configuración.

## Estructura

- `index.html` — sitio completo, autocontenido (HTML + CSS + JS, sin dependencias).

## Cómo verlo

Abrí `index.html` en el navegador, o servilo con:

```bash
python3 -m http.server 8000
```

y visitá `http://localhost:8000`.

Soporta tema claro y oscuro automáticamente (`prefers-color-scheme`).
