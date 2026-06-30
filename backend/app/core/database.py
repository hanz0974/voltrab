"""
Koneksi database menggunakan Supabase Postgres via psycopg2.
Pool connection digunakan untuk efisiensi.
"""
import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager
from app.core.config import SUPABASE_DB_URL


@contextmanager
def get_db():
    """Context manager yang memberikan koneksi DB dan menutupnya otomatis."""
    conn = psycopg2.connect(SUPABASE_DB_URL)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def execute_query(query: str, params: tuple = (), fetch: str = "all"):
    """
    Jalankan query SQL dan kembalikan hasilnya.
    fetch: 'all' untuk semua baris, 'one' untuk satu baris, 'none' untuk tidak ada return.
    """
    with get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            if fetch == "all":
                return cur.fetchall()
            elif fetch == "one":
                return cur.fetchone()
            return None
