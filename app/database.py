"""Capa mínima sobre SQLite (stdlib, sin ORM pesado).

Para el MVP alcanza con SQLite. Cuando crezca, migramos a Postgres.
"""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "karting.db"


def get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    """Crea las tablas si no existen."""
    with get_conn() as conn:
        conn.executescript(
            """
            -- Cliente: carga sus datos UNA vez (los que el karting siempre pide)
            CREATE TABLE IF NOT EXISTS clientes (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre          TEXT NOT NULL,
                apellido        TEXT NOT NULL,
                dni             TEXT NOT NULL,
                telefono        TEXT NOT NULL,   -- formato E.164, ej: 5491170581324
                email           TEXT,
                fecha_nacimiento TEXT,
                contacto_emergencia      TEXT,
                contacto_emergencia_tel  TEXT,
                deslinde_aceptado        INTEGER NOT NULL DEFAULT 0,
                firma_png       TEXT,            -- firma digital en base64 (data URL)
                creado_en       TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(dni)
            );

            -- Lista de espera: el cliente quiere un turno para tal día/horario
            CREATE TABLE IF NOT EXISTS lista_espera (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                cliente_id  INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
                fecha       TEXT NOT NULL,        -- YYYY-MM-DD
                horario     TEXT NOT NULL,        -- HH:MM
                estado      TEXT NOT NULL DEFAULT 'esperando',  -- esperando | avisado | reservado | cancelado
                creado_en   TEXT NOT NULL DEFAULT (datetime('now')),
                avisado_en  TEXT
            );

            -- Comprobantes de check-in (formulario + firma) generados
            CREATE TABLE IF NOT EXISTS comprobantes (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                cliente_id  INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
                codigo      TEXT NOT NULL UNIQUE, -- va dentro del QR
                creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
            );
            """
        )
