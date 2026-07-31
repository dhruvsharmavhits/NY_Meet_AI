from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, UserSettings
from app.schemas.settings import SettingsResponse, SettingsUpdateRequest
from app.schemas.user import CreateUserRequest, UpdateUserRequest, UserResponse
from app.users.dependencies import get_current_user

router = APIRouter(prefix="/users", tags=["users"])


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(payload: CreateUserRequest, db: Session = Depends(get_db)) -> User:
    user = User(full_name=payload.full_name)
    db.add(user)
    db.flush()

    db.add(UserSettings(user_id=user.id))

    db.commit()
    db.refresh(user)
    return user


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.patch("/me", response_model=UserResponse)
def update_me(
    payload: UpdateUserRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    current_user.full_name = payload.full_name
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/me/settings", response_model=SettingsResponse)
def get_my_settings(current_user: User = Depends(get_current_user)) -> UserSettings:
    return current_user.settings


@router.put("/me/settings", response_model=SettingsResponse)
def update_my_settings(
    payload: SettingsUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserSettings:
    settings_row = current_user.settings
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(settings_row, field, value)

    db.commit()
    db.refresh(settings_row)
    return settings_row
