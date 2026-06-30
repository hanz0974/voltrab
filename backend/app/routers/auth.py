"""
Router autentikasi: register, login, verify token.
Menggunakan tabel users di Supabase Postgres dengan password hashing bcrypt.
"""
from fastapi import APIRouter, HTTPException, Depends, status
from app.core.security import hash_password, verify_password, create_access_token, decode_access_token
from app.core.database import execute_query
from app.models.schemas import UserRegister, UserLogin, TokenResponse
import uuid

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
def register(user: UserRegister):
    """Daftar akun baru. Email harus unik."""
    existing = execute_query(
        "SELECT id FROM users WHERE email = %s",
        (user.email,),
        fetch="one",
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email sudah terdaftar",
        )

    user_id = str(uuid.uuid4())
    hashed = hash_password(user.password)

    execute_query(
        "INSERT INTO users (id, email, password_hash) VALUES (%s, %s, %s)",
        (user_id, user.email, hashed),
        fetch="none",
    )

    token = create_access_token({"sub": user_id, "email": user.email})
    return TokenResponse(
        access_token=token,
        user={"id": user_id, "email": user.email},
    )


@router.post("/login", response_model=TokenResponse)
def login(credentials: UserLogin):
    """Login dengan email & password."""
    row = execute_query(
        "SELECT id, email, password_hash FROM users WHERE email = %s",
        (credentials.email,),
        fetch="one",
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email atau password salah",
        )

    if not verify_password(credentials.password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email atau password salah",
        )

    token = create_access_token({"sub": row["id"], "email": row["email"]})
    return TokenResponse(
        access_token=token,
        user={"id": row["id"], "email": row["email"]},
    )


@router.get("/me")
def get_me(payload: dict = Depends(decode_access_token)):
    """Verifikasi token dan kembalikan info user."""
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token tidak valid",
        )
    return {"user": {"id": payload["sub"], "email": payload.get("email")}}
