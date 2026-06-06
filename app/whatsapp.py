"""Cliente de WhatsApp Cloud API (Meta).

En modo demo (sin credenciales) imprime el mensaje en consola en vez de enviarlo,
así se puede probar todo el flujo sin tener todavía la cuenta de WhatsApp Business.
"""
import logging

import httpx

from .config import settings

log = logging.getLogger("whatsapp")

GRAPH_URL = "https://graph.facebook.com/v21.0"


async def enviar_mensaje(telefono: str, texto: str) -> dict:
    """Envía un mensaje de texto por WhatsApp.

    `telefono` en formato E.164 sin '+', ej: 5491170581324.
    """
    if not settings.whatsapp_enabled:
        log.info("[WHATSAPP DEMO] -> %s\n%s", telefono, texto)
        print(f"\n📲 [WhatsApp DEMO] Para {telefono}:\n{texto}\n")
        return {"demo": True, "to": telefono, "text": texto}

    url = f"{GRAPH_URL}/{settings.whatsapp_phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": telefono,
        "type": "text",
        "text": {"body": texto},
    }
    headers = {"Authorization": f"Bearer {settings.whatsapp_token}"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        return resp.json()


def aviso_turno_liberado(nombre: str, fecha: str, horario: str) -> str:
    """Texto del aviso cuando se libera un turno."""
    return (
        f"🏁 ¡Hola {nombre}! Se liberó un turno en el karting de Zárate.\n\n"
        f"📅 {fecha}  🕐 {horario}\n\n"
        f"Respondé *SÍ* en los próximos 10 minutos para reservarlo. "
        f"Si no, pasa al siguiente de la lista de espera."
    )


def confirmacion_anotado(nombre: str, fecha: str, horario: str) -> str:
    """Confirmación al anotarse en la lista de espera."""
    return (
        f"✅ {nombre}, te anotamos en la lista de espera.\n\n"
        f"📅 {fecha}  🕐 {horario}\n\n"
        f"Apenas se libere un lugar te avisamos por acá. ¡Suerte! 🏎️"
    )


def recordatorio_turno(nombre: str, fecha: str, horario: str) -> str:
    """Recordatorio que se envía el día antes del turno."""
    return (
        f"⏰ ¡Hola {nombre}! Te recordamos tu turno de karting para *mañana*.\n\n"
        f"📅 {fecha}  🕐 {horario}\n\n"
        f"Llevá tu comprobante con QR para el check-in. ¡Te esperamos en la pista! 🏁"
    )


def confirmacion_reserva(nombre: str, fecha: str, horario: str) -> str:
    """Confirmación cuando el cliente acepta el turno liberado."""
    return (
        f"🎉 ¡Listo, {nombre}! Tu turno quedó reservado.\n\n"
        f"📅 {fecha}  🕐 {horario}\n\n"
        f"Llevá tu comprobante con QR para el check-in. ¡Nos vemos en la pista! 🏁"
    )
