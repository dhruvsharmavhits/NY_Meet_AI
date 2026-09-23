import secrets

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Admin
from app.security import hash_secret, verify_secret

hash_password = hash_secret
verify_password = verify_secret


def create_admin(db: Session, master_password: str, user_id: str, password: str) -> Admin:
    if not secrets.compare_digest(master_password, settings.admin_master_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid master password")
    if db.query(Admin).filter(Admin.user_id == user_id).first() is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User ID already taken")
    admin = Admin(user_id=user_id, password_hash=hash_password(password))
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


def issue_token(db: Session, user_id: str, password: str) -> str:
    admin = db.query(Admin).filter(Admin.user_id == user_id).first()
    if admin is None or not verify_password(password, admin.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user ID or password")
    admin.token = secrets.token_urlsafe(32)
    db.commit()
    return admin.token


def is_valid_admin_token(token: str | None, db: Session) -> bool:
    return bool(token) and db.query(Admin).filter(Admin.token == token).first() is not None


def require_admin(x_admin_token: str = Header(...), db: Session = Depends(get_db)) -> None:
    if not is_valid_admin_token(x_admin_token, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
