"""Monitor: chequea disponibilidad periódicamente y avisa por WhatsApp a la
gente anotada en la lista de espera cuando se libera su turno.

Corre como tarea de fondo dentro de la app (asyncio).
"""
import asyncio
import logging
from datetime import date, timedelta

from .availability import turnos_libres
from .config import settings
from .database import get_conn
from .whatsapp import aviso_turno_liberado, enviar_mensaje, recordatorio_turno

log = logging.getLogger("monitor")


async def _revisar_una_vez() -> int:
    """Compara la lista de espera contra los turnos libres y avisa. Devuelve
    la cantidad de avisos enviados."""
    libres = turnos_libres()
    avisos = 0

    with get_conn() as conn:
        pendientes = conn.execute(
            """
            SELECT le.id, le.fecha, le.horario,
                   c.nombre, c.telefono
            FROM lista_espera le
            JOIN clientes c ON c.id = le.cliente_id
            WHERE le.estado = 'esperando'
            """
        ).fetchall()

        for row in pendientes:
            slots = libres.get(row["fecha"], [])
            if row["horario"] in slots:
                texto = aviso_turno_liberado(row["nombre"], row["fecha"], row["horario"])
                try:
                    await enviar_mensaje(row["telefono"], texto)
                    conn.execute(
                        "UPDATE lista_espera SET estado='avisado', "
                        "avisado_en=datetime('now') WHERE id=?",
                        (row["id"],),
                    )
                    avisos += 1
                except Exception as e:  # no frenar el resto de la lista
                    log.error("Error avisando a %s: %s", row["telefono"], e)
        conn.commit()

    if avisos:
        log.info("Monitor: %d aviso(s) enviado(s).", avisos)
    return avisos


async def _enviar_recordatorios() -> int:
    """Envía un recordatorio por WhatsApp para los turnos reservados que son
    mañana y que todavía no fueron recordados. Devuelve cuántos envió."""
    manana = (date.today() + timedelta(days=1)).isoformat()
    enviados = 0

    with get_conn() as conn:
        turnos = conn.execute(
            """SELECT le.id, le.fecha, le.horario, c.nombre, c.telefono
               FROM lista_espera le JOIN clientes c ON c.id = le.cliente_id
               WHERE le.estado='reservado' AND le.fecha=?
                 AND le.recordatorio_enviado=0""",
            (manana,),
        ).fetchall()

        for row in turnos:
            texto = recordatorio_turno(row["nombre"], row["fecha"], row["horario"])
            try:
                await enviar_mensaje(row["telefono"], texto)
                conn.execute(
                    "UPDATE lista_espera SET recordatorio_enviado=1 WHERE id=?",
                    (row["id"],),
                )
                enviados += 1
            except Exception as e:
                log.error("Error recordando a %s: %s", row["telefono"], e)
        conn.commit()

    if enviados:
        log.info("Monitor: %d recordatorio(s) enviado(s).", enviados)
    return enviados


async def loop_monitor() -> None:
    """Bucle infinito. Se lanza al iniciar la app."""
    log.info("Monitor iniciado (intervalo=%ss, fuente=%s).",
             settings.monitor_interval, settings.availability_source)
    while True:
        try:
            await _revisar_una_vez()
            await _enviar_recordatorios()
        except Exception as e:
            log.error("Monitor falló en este ciclo: %s", e)
        await asyncio.sleep(settings.monitor_interval)
