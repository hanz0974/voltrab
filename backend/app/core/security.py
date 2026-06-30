from datetime import datetime, timedelta, timezone
import os
import jwt
from jwt import PyJWKClient
from passlib.context import CryptContext
from app.core.config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_HOURS

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# 1. Siapkan Client untuk mengambil Public Key dari Supabase
SUPABASE_JWKS_URL = os.getenv("SUPABASE_JWKS_URL", "https://hxcoeahvkjfoyyncxppk.supabase.co/auth/v1/.well-known/jwks.json")
jwks_client = PyJWKClient(SUPABASE_JWKS_URL)

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(data: dict) -> str:
    # Fungsi ini tetap dipertahankan jika kamu masih butuh sistem login lokal (opsional)
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_access_token(token: str) -> dict | None:
    try:
        # 2. Cari kunci publik yang cocok dengan token yang dikirim Frontend
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        
        # 3. Decode token menggunakan kunci publik Supabase tersebut
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["HS256", "RS256", "ES256"],
            audience="authenticated" # Memastikan ini token login yang sah dari Supabase
        )
        return payload
    except Exception as e:
        print(f"Token ditolak: {e}")
        return None