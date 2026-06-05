"""App FastAPI — Karting Zárate: registro + firma + lista de espera + WhatsApp.

MVP demo. Flujo:
  1. El cliente carga sus datos una vez y firma el deslinde -> PDF con QR.
  2. Se anota en la lista de espera para un día/horario.
  3. El monitor (background) avisa por WhatsApp cuando se libera ese turno.
"""
import asyncio
import logging
import secrets
from contextlib import asynccontextmanager

from fastapi import FastAPI, Form, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path

from .availability import turnos_libres
from .config import settings
from .database import get_conn, init_db
from .monitor import loop_monitor
from .pdf import generar_comprobante

logging.basicConfig(level=logging.INFO)
BASE_DIR = Path(__file__).resolve().parent


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    tarea = asyncio.create_task(loop_monitor())  # monitor en segundo plano
    yield
    tarea.cancel()


app = FastAPI(title="Karting Zárate — Reservas", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")


# ----------------------------- Páginas web --------------------------------

@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/registro", response_class=HTMLResponse)
def registro_form(request: Request):
    return templates.TemplateResponse("registro.html", {"request": request})


@app.post("/registro")
def registro_submit(
    nombre: str = Form(...),
    apellido: str = Form(...),
    dni: str = Form(...),
    telefono: str = Form(...),
    email: str = Form(""),
    fecha_nacimiento: str = Form(""),
    contacto_emergencia: str = Form(""),
    contacto_emergencia_tel: str = Form(""),
    deslinde: str = Form("off"),
    firma_png: str = Form(""),
):
    if deslinde != "on":
        raise HTTPException(400, "Tenés que aceptar el deslinde de responsabilidad.")
    if not firma_png:
        raise HTTPException(400, "Falta la firma.")

    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO clientes
               (nombre, apellido, dni, telefono, email, fecha_nacimiento,
                contacto_emergencia, contacto_emergencia_tel,
                deslinde_aceptado, firma_png)
               VALUES (?,?,?,?,?,?,?,?,1,?)
               ON CONFLICT(dni) DO UPDATE SET
                 nombre=excluded.nombre, apellido=excluded.apellido,
                 telefono=excluded.telefono, email=excluded.email,
                 fecha_nacimiento=excluded.fecha_nacimiento,
                 contacto_emergencia=excluded.contacto_emergencia,
                 contacto_emergencia_tel=excluded.contacto_emergencia_tel,
                 deslinde_aceptado=1, firma_png=excluded.firma_png
            """,
            (nombre, apellido, dni, telefono, email, fecha_nacimiento,
             contacto_emergencia, contacto_emergencia_tel, firma_png),
        )
        conn.commit()
        cliente_id = cur.lastrowid or conn.execute(
            "SELECT id FROM clientes WHERE dni=?", (dni,)
        ).fetchone()["id"]
    return RedirectResponse(f"/comprobante/{cliente_id}", status_code=303)


@app.get("/comprobante/{cliente_id}")
def comprobante(cliente_id: int):
    with get_conn() as conn:
        cliente = conn.execute(
            "SELECT * FROM clientes WHERE id=?", (cliente_id,)
        ).fetchone()
        if not cliente:
            raise HTTPException(404, "Cliente no encontrado.")
        codigo = secrets.token_hex(4).upper()
        conn.execute(
            "INSERT INTO comprobantes (cliente_id, codigo) VALUES (?,?)",
            (cliente_id, codigo),
        )
        conn.commit()
    pdf = generar_comprobante(dict(cliente), codigo)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="checkin-{codigo}.pdf"'},
    )


@app.get("/lista-espera", response_class=HTMLResponse)
def lista_espera_form(request: Request):
    with get_conn() as conn:
        clientes = conn.execute(
            "SELECT id, nombre, apellido FROM clientes ORDER BY nombre"
        ).fetchall()
        anotados = conn.execute(
            """SELECT le.fecha, le.horario, le.estado, c.nombre, c.apellido
               FROM lista_espera le JOIN clientes c ON c.id = le.cliente_id
               ORDER BY le.creado_en DESC LIMIT 50"""
        ).fetchall()
    return templates.TemplateResponse(
        "lista_espera.html",
        {"request": request, "clientes": clientes,
         "libres": turnos_libres(), "anotados": anotados},
    )


@app.post("/lista-espera")
def lista_espera_submit(
    cliente_id: int = Form(...),
    fecha: str = Form(...),
    horario: str = Form(...),
):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO lista_espera (cliente_id, fecha, horario) VALUES (?,?,?)",
            (cliente_id, fecha, horario),
        )
        conn.commit()
    return RedirectResponse("/lista-espera", status_code=303)


@app.get("/validar/{codigo}", response_class=HTMLResponse)
def validar(request: Request, codigo: str):
    """Lo que ve el operador del karting al escanear el QR del comprobante."""
    with get_conn() as conn:
        row = conn.execute(
            """SELECT cmp.codigo, cmp.creado_en, c.*
               FROM comprobantes cmp JOIN clientes c ON c.id = cmp.cliente_id
               WHERE cmp.codigo=?""",
            (codigo,),
        ).fetchone()
    if not row:
        raise HTTPException(404, "Comprobante inválido.")
    return templates.TemplateResponse(
        "validar.html", {"request": request, "c": row}
    )


# ----------------------- Webhook WhatsApp (Meta) --------------------------

@app.get("/webhook/whatsapp")
def whatsapp_verify(request: Request):
    """Verificación inicial del webhook que pide Meta."""
    params = request.query_params
    if (params.get("hub.mode") == "subscribe"
            and params.get("hub.verify_token") == settings.whatsapp_verify_token):
        return PlainTextResponse(params.get("hub.challenge", ""))
    raise HTTPException(403, "Token de verificación inválido.")


@app.post("/webhook/whatsapp")
async def whatsapp_incoming(request: Request):
    """Recibe respuestas del cliente (ej: 'SÍ' para confirmar el turno).

    Esqueleto: cuando el cliente responde SÍ a un aviso, marcamos su última
    entrada 'avisada' como 'reservado'. (La reserva real contra SoloTurnos se
    conecta acá más adelante.)"""
    data = await request.json()
    try:
        msg = data["entry"][0]["changes"][0]["value"]["messages"][0]
        telefono = msg["from"]
        texto = msg.get("text", {}).get("body", "").strip().lower()
    except (KeyError, IndexError):
        return {"status": "ignored"}

    if texto in ("si", "sí", "yes", "ok", "dale"):
        with get_conn() as conn:
            fila = conn.execute(
                """SELECT le.id FROM lista_espera le
                   JOIN clientes c ON c.id = le.cliente_id
                   WHERE c.telefono=? AND le.estado='avisado'
                   ORDER BY le.avisado_en DESC LIMIT 1""",
                (telefono,),
            ).fetchone()
            if fila:
                conn.execute(
                    "UPDATE lista_espera SET estado='reservado' WHERE id=?",
                    (fila["id"],),
                )
                conn.commit()
    return {"status": "ok"}


@app.get("/health")
def health():
    return {"ok": True, "whatsapp": settings.whatsapp_enabled,
            "source": settings.availability_source}
