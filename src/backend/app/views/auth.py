from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.user import User


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=1, max_length=128)


class ProfileUpdateRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=100)

    @field_validator("display_name")
    @classmethod
    def check_display_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Display name must not be blank.")
        return stripped


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)


class OrganisationView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class UserView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    display_name: str
    role: Literal["employee", "group_manager", "org_admin"]
    organisation: OrganisationView
    avatar_url: str | None


def user_view(user: User) -> UserView:
    return UserView.model_validate(user)
