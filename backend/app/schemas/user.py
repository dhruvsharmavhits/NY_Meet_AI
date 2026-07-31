from pydantic import BaseModel, Field


class CreateUserRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)


class UpdateUserRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)


class UserResponse(BaseModel):
    id: str
    full_name: str
    avatar_url: str | None

    model_config = {"from_attributes": True}
