"""Fuente de disponibilidad de turnos.

Esta es la ÚNICA pieza que depende del sistema externo (SoloTurnos).
Está aislada a propósito: hoy devuelve datos MOCK para poder demostrar todo
el flujo. Cuando tengamos los endpoints reales de SoloTurnos (o acceso dado
por el kartódromo), implementamos `_disponibilidad_soloturnos()` y listo.
"""
import random
from datetime import date, timedelta

from .config import settings


def _generar_horarios(desde="17:00", hasta="23:30", paso_min=30) -> list[str]:
    """Genera la grilla de turnos: cada `paso_min` minutos entre desde y hasta."""
    h0, m0 = map(int, desde.split(":"))
    h1, m1 = map(int, hasta.split(":"))
    ini, fin = h0 * 60 + m0, h1 * 60 + m1
    return [f"{t // 60:02d}:{t % 60:02d}" for t in range(ini, fin + 1, paso_min)]


# Grilla real del karting: todos los días, cada 30 min desde las 17:00.
HORARIOS = _generar_horarios("17:00", "23:30", 30)


def _proximos_dias(n: int = 14) -> list[str]:
    """Los próximos `n` días (el karting abre todos los días)."""
    hoy = date.today()
    return [(hoy + timedelta(days=i)).isoformat() for i in range(n)]


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
