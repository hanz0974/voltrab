from functools import lru_cache
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from app.core.config import SUPABASE_URL

bearer_scheme = HTTPBearer(auto_error=False)


@lru_cache
def _get_jwks_client() -> PyJWKClient:
    if not SUPABASE_URL:
        raise RuntimeError("SUPABASE_URL belum dikonfigurasi")
    issuer = f"{SUPABASE_URL.rstrip('/')}/auth/v1"
    return PyJWKClient(f"{issuer}/.well-known/jwks.json")


def verify_supabase_access_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    """Validasi Supabase access token dari header Authorization Bearer."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Supabase access token diperlukan",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        issuer = f"{SUPABASE_URL.rstrip('/')}/auth/v1"
        signing_key = _get_jwks_client().get_signing_key_from_jwt(credentials.credentials)
        payload = jwt.decode(
            credentials.credentials,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            audience="authenticated",
            issuer=issuer,
        )

        if payload.get("role") != "authenticated":
            raise jwt.InvalidTokenError("role token bukan authenticated")

        UUID(payload["sub"])
        return payload
    except (jwt.PyJWTError, KeyError, TypeError, ValueError, RuntimeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Supabase access token tidak valid",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None
