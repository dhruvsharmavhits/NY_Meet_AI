from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User


def get_current_user(x_user_id: str = Header(...), db: Session = Depends(get_db)) -> User:
    user = db.get(User, x_user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown user")
    return user


def get_current_user_optional(x_user_id: str | None = Header(default=None), db: Session = Depends(get_db)) -> User | None:
    if not x_user_id:
        return None
    return db.get(User, x_user_id)
