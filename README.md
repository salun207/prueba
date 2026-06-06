# 🏁 Karting Zárate — Reservas (MVP)

Sistema **externo y standalone** para el alquiler de kartings en Zárate. No
toca el sistema actual (SoloTurnos): se para al lado y resuelve dos dolores:

1. **Papeles y firma manual** → el cliente carga sus datos UNA vez, firma el
   deslinde digital y genera un **comprobante PDF con QR**. Llega, muestra el
   QR y sube al kart.
2. **"Nunca hay disponibilidad"** → se anota en una **lista de espera** y un
   **monitor** le avisa por **WhatsApp** apenas se libera un turno (cancelaciones).

> Estado: **MVP demo**. La disponibilidad es simulada (`mock`) hasta conectar
> el sistema real. Todo lo demás ya funciona.

## Funciones
- **Landing profesional**: hero, cómo funciona, beneficios, el circuito (plano +
  datos), galería, precios, ubicación (Google Maps) y contacto.
- **Registro + firma digital** del deslinde → comprobante **PDF con QR**.
- **Lista de espera** por día/horario con cupos (15 lugares por turno).
- **WhatsApp** en todo el flujo: confirmación al anotarse, aviso al liberarse un
  turno, confirmación al reservar (responder *SÍ*) y **recordatorio el día antes**.
- **Botón flotante de WhatsApp** y formulario de contacto funcional.
- **Panel del kartódromo** (protegible con clave): métricas, acciones manuales
  (confirmar / cancelar / reanudar) y **exportar a Excel (CSV)**.
- **Términos y privacidad** (deslinde + Ley 25.326).
- **Datos de demo**: `python -m app.seed` carga clientes y turnos recuperados.

## Stack
- **Backend/web:** Python + FastAPI + Jinja2
- **DB:** SQLite (stdlib) — migrable a Postgres
- **WhatsApp:** Cloud API oficial de Meta (modo demo imprime en consola)
- **PDF/QR:** reportlab + qrcode

## Correr localmente
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # opcional: completar credenciales de WhatsApp
uvicorn app.main:app --reload
```
Abrir http://localhost:8000

## Estructura
```
app/
  main.py          rutas web + webhook de WhatsApp
  config.py        settings (.env)
  database.py      SQLite (clientes, lista_espera, comprobantes)
  availability.py  fuente de disponibilidad  <-- ÚNICO punto que depende de SoloTurnos
  monitor.py       chequea disponibilidad y avisa por WhatsApp (background)
  whatsapp.py      cliente Cloud API (demo si no hay credenciales)
  pdf.py           comprobante PDF con datos + firma + QR
  templates/       HTML  ·  static/  firma en canvas
```

## Conectar la disponibilidad real (SoloTurnos)
La pieza aislada es `app/availability.py` → `_disponibilidad_soloturnos()`.
1. Abrir `v2.soloturnos.com/empresa/kartodromo` en Chrome.
2. F12 → pestaña **Network** → filtro **Fetch/XHR**.
3. Navegar fechas y copiar las URLs JSON que devuelven la disponibilidad.
4. Implementar el `GET` en esa función y poner `AVAILABILITY_SOURCE=soloturnos`.

> **Nota:** lo ideal es ofrecer esto al kartódromo y obtener acceso a los datos
> de forma legítima (es una feature que les recupera cancelaciones), evitando
> depender de scraping.

## Hosting
- **Rápido:** Railway / Render (deploy con `git push`, ~US$5-7/mes).
- **Control:** VPS (Hetzner/DigitalOcean) ~US$5/mes con Docker.
- WhatsApp Cloud API necesita el webhook público con HTTPS → ya lo da el host.

## WhatsApp (producción)
1. Crear app en https://developers.facebook.com → producto WhatsApp.
2. Copiar `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID` al `.env`.
3. Configurar el webhook a `https://TU-DOMINIO/webhook/whatsapp` con
   `WHATSAPP_VERIFY_TOKEN`.
