"""Carga datos de demostración para mostrar el panel "vivo" en una reunión.

Uso:
    python -m app.seed          # agrega datos de demo
    python -m app.seed --reset  # borra todo y vuelve a cargar
"""
import random
import secrets
import sys
from datetime import date, timedelta

from .availability import HORARIOS
from .database import get_conn, init_db

NOMBRES = [
    ("Juan", "Pérez"), ("Carolina", "Gómez"), ("Martín", "Sosa"),
    ("Lucía", "Fernández"), ("Diego", "Romero"), ("Sofía", "Díaz"),
    ("Nicolás", "López"), ("Valentina", "Torres"), ("Federico", "Ruiz"),
    ("Camila", "Acosta"), ("Brian", "Molina"), ("Agustina", "Silva"),
]

FIRMA = ("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC"
         "AAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")


def _reset(conn):
    for t in ("lista_espera", "comprobantes", "contactos", "clientes"):
        conn.execute(f"DELETE FROM {t}")
    conn.commit()


def seed(reset: bool = False):
    init_db()
    rng = random.Random(42)
    with get_conn() as conn:
        if reset:
            _reset(conn)

        ids = []
        for i, (n, a) in enumerate(NOMBRES):
            cur = conn.execute(
                """INSERT INTO clientes (nombre, apellido, dni, telefono, email,
                       contacto_emergencia, contacto_emergencia_tel,
                       deslinde_aceptado, firma_png)
                   VALUES (?,?,?,?,?,?,?,1,?)
                   ON CONFLICT(dni) DO NOTHING""",
                (n, a, f"3{rng.randint(1000000, 9999999)}", f"54911{rng.randint(10000000, 99999999)}",
                 f"{n.lower()}@mail.com", "Contacto fam.", f"54911{rng.randint(10000000, 99999999)}", FIRMA),
            )
            cid = cur.lastrowid or conn.execute(
                "SELECT id FROM clientes WHERE nombre=? AND apellido=?", (n, a)
            ).fetchone()["id"]
            ids.append(cid)
            # comprobante
            conn.execute(
                "INSERT INTO comprobantes (cliente_id, codigo) VALUES (?,?)",
                (cid, secrets.token_hex(4).upper()),
            )

        # Lista de espera con estados variados (incluye turnos recuperados)
        estados = (["esperando"] * 6) + (["avisado"] * 3) + (["reservado"] * 5)
        for cid in ids:
            fecha = (date.today() + timedelta(days=rng.randint(1, 12))).isoformat()
            horario = rng.choice(HORARIOS)
            estado = rng.choice(estados)
            avisado = "datetime('now')" if estado in ("avisado", "reservado") else "NULL"
            conn.execute(
                f"INSERT INTO lista_espera (cliente_id, fecha, horario, estado, avisado_en)"
                f" VALUES (?,?,?,?,{avisado})",
                (cid, fecha, horario, estado),
            )

        # Mensajes de contacto
        for n, a in NOMBRES[:3]:
            conn.execute(
                "INSERT INTO contactos (nombre, contacto, mensaje) VALUES (?,?,?)",
                (n, f"{n.lower()}@mail.com", "Hola! Quiero reservar para un grupo de 8 personas."),
            )
        conn.commit()

        tot = conn.execute("SELECT COUNT(*) FROM clientes").fetchone()[0]
        rec = conn.execute(
            "SELECT COUNT(*) FROM lista_espera WHERE estado='reservado'"
        ).fetchone()[0]
    print(f"✅ Datos de demo cargados: {tot} clientes, {rec} turnos recuperados.")
    print("   Mirá el panel en /panel")


if __name__ == "__main__":
    seed(reset="--reset" in sys.argv)
