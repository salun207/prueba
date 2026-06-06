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
# Último turno 22:30 (termina a las 23:00, hora de cierre).
HORARIOS = _generar_horarios("17:00", "22:30", 30)

# Cupos (karts) por turno. Se usa para decidir si un turno está lleno o
# disponible cuando conectemos los datos reales de SoloTurnos.
CAPACIDAD_POR_TURNO = 15


def _proximos_dias(n: int = 14) -> list[str]:
    """Los próximos `n` días (el karting abre todos los días)."""
    hoy = date.today()
    return [(hoy + timedelta(days=i)).isoformat() for i in range(n)]


def _disponibilidad_mock() -> dict[str, dict[str, int]]:
    """Simula disponibilidad con CUPOS por turno (sobre CAPACIDAD_POR_TURNO).
    La mayoría de los turnos están llenos (como en la realidad) y unos pocos
    tienen lugares libres por cancelaciones."""
    rng = random.Random()  # aleatorio en cada chequeo -> simula cancelaciones
    cupos: dict[str, dict[str, int]] = {}
    for dia in _proximos_dias():
        libres_dia = {
            h: rng.randint(1, CAPACIDAD_POR_TURNO)
            for h in HORARIOS
            if rng.random() < 0.15  # ~15% de los turnos tienen algún lugar
        }
        if libres_dia:
            cupos[dia] = libres_dia
    return cupos


def _disponibilidad_soloturnos() -> dict[str, dict[str, int]]:
    """TODO: implementar con los endpoints reales de SoloTurnos.

    Debe devolver {fecha: {horario: cupos_libres}}, donde cupos_libres es
    CAPACIDAD_POR_TURNO menos los reservados.
    Pasos previstos:
      1. GET de disponibilidad del 'empresa/kartodromo' (JSON que usa la SPA).
      2. Parsear fechas/horarios y calcular cupos libres.
    Para descubrir los endpoints: abrir la página en Chrome -> F12 -> Network
    -> Fetch/XHR -> navegar fechas y copiar las URLs JSON.
    """
    raise NotImplementedError(
        "Falta conectar la API real de SoloTurnos. Ver instrucciones en el README."
    )


def cupos_libres() -> dict[str, dict[str, int]]:
    """Punto de entrada único. Devuelve {fecha: {horario: cupos_libres}}."""
    if settings.availability_source == "soloturnos":
        return _disponibilidad_soloturnos()
    return _disponibilidad_mock()


def turnos_libres() -> dict[str, list[str]]:
    """Lista de horarios con al menos un cupo libre. {fecha: [horarios]}."""
    return {dia: list(slots.keys()) for dia, slots in cupos_libres().items()}
