"""App FastAPI — Karting Zárate: reservas + firma + lista de espera + WhatsApp.

Flujo:
  1. El cliente carga sus datos una vez y firma el deslinde -> PDF con QR.
  2. Se anota en la lista de espera para un día/horario.
  3. El monitor (background) avisa por WhatsApp cuando se libera ese turno.
"""
import asyncio
import csv
import io
import logging
import secrets
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from pathlib import Path

from fastapi import Depends, FastAPI, Form, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from .availability import CAPACIDAD_POR_TURNO, HORARIOS, cupos_libres
from .config import settings
from .database import get_conn, init_db
from .monitor import loop_monitor
from .pdf import generar_comprobante
from . import whatsapp

logging.basicConfig(level=logging.INFO)
BASE_DIR = Path(__file__).resolve().parent


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    tarea = asyncio.create_task(loop_monitor())  # monitor en segundo plano
    yield
    tarea.cancel()


app = FastAPI(title=f"{settings.brand_name} — Reservas", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")

# Datos de marca disponibles en TODAS las plantillas (sin pasarlos uno por uno).
templates.env.globals.update(
    brand=settings.brand_name,
    direccion=settings.direccion,
    email_contacto=settings.email_contacto,
    wa_link=settings.wa_link,
    whatsapp_contacto=settings.whatsapp_contacto,
    map_query=settings.map_query,
    circuito={
        "longitud": settings.circuito_longitud_m,
        "ancho": settings.circuito_ancho_m,
        "curvas": settings.circuito_curvas,
        "rectas": settings.circuito_rectas,
    },
    capacidad=CAPACIDAD_POR_TURNO,
    horarios=HORARIOS,
)


# --------------------- Protección opcional del panel ----------------------

_basic = HTTPBasic(auto_error=False)


def requiere_panel(cred: HTTPBasicCredentials | None = Depends(_basic)):
    """Si PANEL_PASSWORD está seteado, pide usuario/clave (HTTP Basic).
    Si está vacío (demo), el panel queda abierto."""
    if not settings.panel_protegido:
        return True
    ok = (
        cred is not None
        and secrets.compare_digest(cred.username, settings.panel_user)
        and secrets.compare_digest(cred.password, settings.panel_password)
    )
    if not ok:
        raise HTTPException(
            status_code=401,
            detail="No autorizado",
            headers={"WWW-Authenticate": "Basic"},
        )
    return True


# ----------------------------- Páginas web --------------------------------

IMG_DIR = BASE_DIR / "static" / "img"
_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def _listar_galeria() -> list[str]:
    """Fotos que el kartódromo deja en static/img/galeria/ (aparecen solas)."""
    d = IMG_DIR / "galeria"
    if not d.exists():
        return []
    return sorted(
        f"/static/img/galeria/{p.name}"
        for p in d.iterdir()
        if p.suffix.lower() in _EXTS
    )


def _circuito_img() -> str | None:
    """Foto/plano real del circuito si existe (static/img/circuito.*)."""
    if not IMG_DIR.exists():
        return None
    for p in sorted(IMG_DIR.iterdir()):
        if p.stem.lower() == "circuito" and p.suffix.lower() in _EXTS:
            return f"/static/img/{p.name}"
    return None


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse(
        "index.html",
        {"request": request, "galeria": _listar_galeria(),
         "circuito_img": _circuito_img()},
    )


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
    return RedirectResponse(f"/listo/{cliente_id}", status_code=303)


def _codigo_comprobante(cliente_id: int) -> str:
    """Devuelve el código del comprobante del cliente, creándolo si no existe.
    Evita generar un código nuevo cada vez que se descarga el PDF."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT codigo FROM comprobantes WHERE cliente_id=? "
            "ORDER BY creado_en DESC LIMIT 1",
            (cliente_id,),
        ).fetchone()
        if row:
            return row["codigo"]
        codigo = secrets.token_hex(4).upper()
        conn.execute(
            "INSERT INTO comprobantes (cliente_id, codigo) VALUES (?,?)",
            (cliente_id, codigo),
        )
        conn.commit()
        return codigo


@app.get("/listo/{cliente_id}", response_class=HTMLResponse)
def listo(request: Request, cliente_id: int, anotado: int = 0, ya: int = 0):
    """Pantalla de confirmación. Se adapta según si ya firmó el deslinde."""
    with get_conn() as conn:
        cliente = conn.execute(
            "SELECT * FROM clientes WHERE id=?", (cliente_id,)
        ).fetchone()
    if not cliente:
        raise HTTPException(404, "Cliente no encontrado.")
    firmado = bool(cliente["deslinde_aceptado"]) and bool(cliente["firma_png"])
    codigo = _codigo_comprobante(cliente_id) if firmado else None
    return templates.TemplateResponse(
        "listo.html",
        {"request": request, "c": cliente, "codigo": codigo,
         "firmado": firmado, "anotado": bool(anotado), "ya": bool(ya)},
    )


@app.get("/comprobante/{cliente_id}")
def comprobante(cliente_id: int):
    with get_conn() as conn:
        cliente = conn.execute(
            "SELECT * FROM clientes WHERE id=?", (cliente_id,)
        ).fetchone()
        if not cliente:
            raise HTTPException(404, "Cliente no encontrado.")
    codigo = _codigo_comprobante(cliente_id)
    pdf = generar_comprobante(dict(cliente), codigo)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="checkin-{codigo}.pdf"'},
    )


@app.get("/lista-espera", response_class=HTMLResponse)
def lista_espera_form(request: Request):
    return templates.TemplateResponse(
        "lista_espera.html",
        {"request": request, "libres": cupos_libres(),
         "hoy": date.today().isoformat()},
    )


def _normalizar_tel(telefono: str) -> str:
    """Deja solo dígitos (para WhatsApp). Ej: '+54 9 11 7058-1324' -> '5491170581324'."""
    return "".join(ch for ch in telefono if ch.isdigit())


@app.post("/lista-espera")
async def lista_espera_submit(
    nombre: str = Form(...),
    apellido: str = Form(...),
    dni: str = Form(...),
    telefono: str = Form(...),
    fecha: str = Form(...),
    horario: str = Form(...),
):
    # Validaciones de entrada
    try:
        f = datetime.strptime(fecha, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "Fecha inválida. Usá el formato AAAA-MM-DD.")
    if f < date.today():
        raise HTTPException(400, "Esa fecha ya pasó. Elegí una fecha futura.")
    if f > date.today() + timedelta(days=60):
        raise HTTPException(400, "Solo se puede reservar hasta 60 días en adelante.")
    if horario not in HORARIOS:
        raise HTTPException(400, "Horario inválido.")
    telefono = _normalizar_tel(telefono)
    if len(telefono) < 8:
        raise HTTPException(400, "Teléfono inválido. Ingresá el número con código de país (549...).")

    # Crea o actualiza el cliente por DNI (sin tocar su firma si ya la tenía)
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO clientes (nombre, apellido, dni, telefono)
               VALUES (?,?,?,?)
               ON CONFLICT(dni) DO UPDATE SET
                 nombre=excluded.nombre, apellido=excluded.apellido,
                 telefono=excluded.telefono""",
            (nombre, apellido, dni, telefono),
        )
        conn.commit()
        cliente_id = conn.execute(
            "SELECT id FROM clientes WHERE dni=?", (dni,)
        ).fetchone()["id"]
        # Evita anotarse dos veces al mismo turno
        duplicado = conn.execute(
            """SELECT 1 FROM lista_espera
               WHERE cliente_id=? AND fecha=? AND horario=?
                 AND estado IN ('esperando','avisado','reservado')""",
            (cliente_id, fecha, horario),
        ).fetchone()
        if not duplicado:
            conn.execute(
                "INSERT INTO lista_espera (cliente_id, fecha, horario) VALUES (?,?,?)",
                (cliente_id, fecha, horario),
            )
            conn.commit()

    # Confirmación por WhatsApp solo si fue un alta nueva (en demo: consola)
    if not duplicado:
        try:
            await whatsapp.enviar_mensaje(
                telefono, whatsapp.confirmacion_anotado(nombre, fecha, horario)
            )
        except Exception as e:  # no frenar el flujo por un error de WhatsApp
            logging.getLogger("whatsapp").error("No se pudo confirmar: %s", e)

    ya = "&ya=1" if duplicado else ""
    return RedirectResponse(f"/listo/{cliente_id}?anotado=1{ya}", status_code=303)


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


# ------------------------------ Contacto ----------------------------------

@app.post("/contacto")
def contacto_submit(
    nombre: str = Form(...),
    contacto: str = Form(...),
    mensaje: str = Form(...),
):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO contactos (nombre, contacto, mensaje) VALUES (?,?,?)",
            (nombre, contacto, mensaje),
        )
        conn.commit()
    return RedirectResponse("/?enviado=1#contacto", status_code=303)


@app.get("/terminos", response_class=HTMLResponse)
def terminos(request: Request):
    return templates.TemplateResponse("terminos.html", {"request": request})


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
    """Recibe respuestas del cliente. Si responde SÍ a un aviso, confirmamos
    su turno y le mandamos la confirmación de reserva."""
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
                """SELECT le.id, le.fecha, le.horario, c.nombre FROM lista_espera le
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
                await whatsapp.enviar_mensaje(
                    telefono,
                    whatsapp.confirmacion_reserva(
                        fila["nombre"], fila["fecha"], fila["horario"]
                    ),
                )
    return {"status": "ok"}


# -------------------------------- Panel -----------------------------------

@app.get("/panel", response_class=HTMLResponse)
def panel(request: Request, _: bool = Depends(requiere_panel)):
    """Tablero para el kartódromo: lo que recuperan y la lista de espera."""
    with get_conn() as conn:
        m = conn.execute(
            """SELECT
                 COUNT(*) FILTER (WHERE estado='esperando')  AS esperando,
                 COUNT(*) FILTER (WHERE estado='avisado')     AS avisados,
                 COUNT(*) FILTER (WHERE estado='reservado')   AS recuperados
               FROM lista_espera"""
        ).fetchone()
        clientes = conn.execute("SELECT COUNT(*) AS n FROM clientes").fetchone()["n"]
        contactos = conn.execute(
            "SELECT COUNT(*) AS n FROM contactos"
        ).fetchone()["n"]
        anotados = conn.execute(
            """SELECT le.id, le.fecha, le.horario, le.estado, le.avisado_en,
                      c.nombre, c.apellido, c.telefono
               FROM lista_espera le JOIN clientes c ON c.id = le.cliente_id
               ORDER BY le.creado_en DESC LIMIT 100"""
        ).fetchall()
    return templates.TemplateResponse(
        "panel.html",
        {"request": request, "m": m, "clientes": clientes,
         "contactos": contactos, "anotados": anotados},
    )


@app.post("/panel/accion")
def panel_accion(
    le_id: int = Form(...),
    accion: str = Form(...),
    _: bool = Depends(requiere_panel),
):
    """Acciones manuales del operador sobre una entrada de la lista de espera."""
    nuevo = {
        "confirmar": "reservado",
        "cancelar": "cancelado",
        "reanudar": "esperando",
    }.get(accion)
    if nuevo:
        with get_conn() as conn:
            conn.execute(
                "UPDATE lista_espera SET estado=? WHERE id=?", (nuevo, le_id)
            )
            conn.commit()
    return RedirectResponse("/panel", status_code=303)


@app.get("/panel/export.csv")
def panel_export(_: bool = Depends(requiere_panel)):
    """Exporta la lista de espera completa a CSV (abre en Excel)."""
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT le.id, c.nombre, c.apellido, c.dni, c.telefono, c.email,
                      le.fecha, le.horario, le.estado, le.creado_en
               FROM lista_espera le JOIN clientes c ON c.id = le.cliente_id
               ORDER BY le.creado_en DESC"""
        ).fetchall()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "nombre", "apellido", "dni", "telefono", "email",
                "fecha", "horario", "estado", "creado_en"])
    for r in rows:
        w.writerow([r["id"], r["nombre"], r["apellido"], r["dni"], r["telefono"],
                    r["email"], r["fecha"], r["horario"], r["estado"], r["creado_en"]])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="lista-espera.csv"'},
    )


@app.get("/health")
def health():
    return {"ok": True, "whatsapp": settings.whatsapp_enabled,
            "source": settings.availability_source}
