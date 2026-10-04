"""Konfigurasi aplikasi FastAPI dan koneksi Supabase."""
import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "") or os.getenv("SUPABASE_SECRET_KEY", "")
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL", "")

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# CORS: default kosong (frontend same-origin via nginx, tidak butuh CORS).
# Untuk dev, isi via env: CORS_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"
_CORS_ENV = os.getenv("CORS_ORIGINS", "").strip()
CORS_ORIGINS = [o.strip() for o in _CORS_ENV.split(",") if o.strip()]
