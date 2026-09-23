import secrets

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ThirdPartyApp
from app.security import hash_secret, verify_secret

API_KEY_PREFIX_LEN = 12


def generate_api_key() -> tuple[str, str, str]:
    """Returns (full_key, prefix, hash). The full key is only ever returned
    once, at creation/regeneration time — only its hash is stored."""
    full_key = f"ntp_{secrets.token_urlsafe(32)}"
    prefix = full_key[:API_KEY_PREFIX_LEN]
    return full_key, prefix, hash_secret(full_key)


def generate_passcode() -> tuple[str, str]:
    """Returns (passcode, hash). The passcode is only ever returned once, at
    room-creation time — only its hash is stored."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no ambiguous 0/O/1/I
    passcode = "".join(secrets.choice(alphabet) for _ in range(8))
    return passcode, hash_secret(passcode)


def get_third_party_app(x_api_key: str = Header(...), db: Session = Depends(get_db)) -> ThirdPartyApp:
    prefix = x_api_key[:API_KEY_PREFIX_LEN]
    app = db.query(ThirdPartyApp).filter(ThirdPartyApp.api_key_prefix == prefix).first()
    if (
        app is None
        or app.status != "active"
        or not verify_secret(x_api_key, app.api_key_hash)
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
    return app
