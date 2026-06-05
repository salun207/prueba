"""Fuente de disponibilidad de turnos.

Esta es la ÚNICA pieza que depende del sistema externo (SoloTurnos).
Está aislada a propósito: hoy devuelve datos MOCK para poder demostrar todo
el flujo. Cuando tengamos los endpoints reales de SoloTurnos (o acceso dado
por el kartódromo), implementamos `_disponibilidad_soloturnos()` y listo.
"""
import random
from datetime import date, timedelta

from .config import settings

HORARIOS = ["17:30", "18:30", "19:30", "20:30", "21:30", "22:30"]


def _proximos_dias(n: int = 14) -> list[str]:
    """Jueves a domingo de las próximas 2 semanas (días que opera el karting)."""
    hoy = date.today()
    dias = []
    for i in range(n):
        d = hoy + timedelta(days=i)
        if d.weekday() in (3, 4, 5, 6):  # jue, vie, sáb, dom
            dias.append(d.isoformat())
    return dias


def _disponibilidad_mock() -> dict[str, list[str]]:
    """Simula disponibilidad: la mayoría de los turnos están ocupados
    (como en la realidad), y algunos pocos se 'liberan' al azar."""
    rng = random.Random()  # aleatorio en cada chequeo -> simula cancelaciones
    libres: dict[str, list[str]] = {}
    for dia in _proximos_dias():
        slots = [h for h in HORARIOS if rng.random() < 0.15]  # ~15% libres
        if slots:
            libres[dia] = slots
    return libres


def _disponibilidad_soloturnos() -> dict[str, list[str]]:
    """TODO: implementar con los endpoints reales de SoloTurnos.

    Pasos previstos:
      1. GET de disponibilidad del 'empresa/kartodromo' (JSON que usa la SPA).
      2. Parsear fechas/horarios libres.
    Para descubrir los endpoints: abrir la página en Chrome -> F12 -> Network
    -> Fetch/XHR -> navegar fechas y copiar las URLs JSON.
    """
    raise NotImplementedError(
        "Falta conectar la API real de SoloTurnos. Ver instrucciones en el README."
    )


def turnos_libres() -> dict[str, list[str]]:
    """Punto de entrada único. Devuelve {fecha: [horarios libres]}."""
    if settings.availability_source == "soloturnos":
        return _disponibilidad_soloturnos()
    return _disponibilidad_mock()
