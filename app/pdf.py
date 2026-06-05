"""Genera el comprobante de check-in en PDF: datos del cliente, deslinde,
firma digital y un QR para mostrar al llegar al karting.
"""
import base64
import io
import re

import qrcode
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

from .config import settings

DESLINDE = (
    "Declaro conocer y aceptar el reglamento del kartódromo. Participo de la "
    "actividad de manera voluntaria, asumiendo los riesgos propios del karting. "
    "Eximo de responsabilidad al establecimiento por daños derivados del mal uso "
    "del vehículo o el incumplimiento de las normas de seguridad. Confirmo que los "
    "datos declarados son verídicos."
)


def _data_url_to_image(data_url: str) -> ImageReader | None:
    """Convierte una firma 'data:image/png;base64,...' en algo dibujable."""
    if not data_url:
        return None
    m = re.match(r"data:image/\w+;base64,(.*)", data_url, re.DOTALL)
    raw = m.group(1) if m else data_url
    try:
        return ImageReader(io.BytesIO(base64.b64decode(raw)))
    except Exception:
        return None


def generar_comprobante(cliente: dict, codigo: str) -> bytes:
    """Devuelve los bytes de un PDF A4 con el comprobante firmado."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    y = h - 25 * mm

    c.setFont("Helvetica-Bold", 18)
    c.drawString(20 * mm, y, "Comprobante de check-in — Karting Zárate")
    y -= 12 * mm

    c.setFont("Helvetica", 11)
    campos = [
        ("Nombre", f"{cliente['nombre']} {cliente['apellido']}"),
        ("DNI", cliente["dni"]),
        ("Teléfono", cliente["telefono"]),
        ("Email", cliente.get("email") or "-"),
        ("Fecha de nacimiento", cliente.get("fecha_nacimiento") or "-"),
        ("Contacto de emergencia",
         f"{cliente.get('contacto_emergencia') or '-'} "
         f"({cliente.get('contacto_emergencia_tel') or '-'})"),
    ]
    for label, val in campos:
        c.setFont("Helvetica-Bold", 11)
        c.drawString(20 * mm, y, f"{label}:")
        c.setFont("Helvetica", 11)
        c.drawString(70 * mm, y, str(val))
        y -= 8 * mm

    # Deslinde
    y -= 4 * mm
    c.setFont("Helvetica-Bold", 11)
    c.drawString(20 * mm, y, "Deslinde de responsabilidad")
    y -= 7 * mm
    c.setFont("Helvetica", 9)
    # wrap simple del texto
    palabras, linea = DESLINDE.split(), ""
    for p in palabras:
        if len(linea) + len(p) > 95:
            c.drawString(20 * mm, y, linea)
            y -= 5 * mm
            linea = ""
        linea += p + " "
    if linea:
        c.drawString(20 * mm, y, linea)
        y -= 8 * mm

    estado = "ACEPTADO" if cliente.get("deslinde_aceptado") else "NO ACEPTADO"
    c.setFont("Helvetica-Bold", 10)
    c.drawString(20 * mm, y, f"Estado del deslinde: {estado}")
    y -= 14 * mm

    # Firma
    c.setFont("Helvetica-Bold", 11)
    c.drawString(20 * mm, y, "Firma:")
    firma = _data_url_to_image(cliente.get("firma_png"))
    if firma:
        c.drawImage(firma, 20 * mm, y - 30 * mm, width=70 * mm, height=28 * mm,
                    preserveAspectRatio=True, mask="auto")

    # QR con el código de validación
    qr_img = qrcode.make(f"{settings.base_url}/validar/{codigo}")
    qr_buf = io.BytesIO()
    qr_img.save(qr_buf, format="PNG")
    qr_buf.seek(0)
    c.drawImage(ImageReader(qr_buf), w - 55 * mm, 20 * mm, width=35 * mm, height=35 * mm)
    c.setFont("Helvetica", 8)
    c.drawString(w - 55 * mm, 17 * mm, f"Código: {codigo}")

    c.showPage()
    c.save()
    buf.seek(0)
    return buf.read()
