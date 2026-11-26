from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.user import User


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=1, max_length=128)


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
