import secrets

from fastapi import Header, HTTPException, status

from app.config import settings


def issue_token(password: str) -> str:
    if not secrets.compare_digest(password, settings.admin_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin password")
    # the token IS the password, checked directly against settings on every
    # request — no server-side session state to lose on a backend restart
    # (this auth is intentionally lightweight: it only exists to keep
    # patients away from meeting-creation/admin functionality)
    return password


def require_admin(x_admin_token: str = Header(...)) -> None:
    if not is_valid_admin_token(x_admin_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


def is_valid_admin_token(token: str | None) -> bool:
    return bool(token) and secrets.compare_digest(token, settings.admin_password)
