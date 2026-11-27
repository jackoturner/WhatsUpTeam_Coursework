import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

RoleValue = Literal["employee", "group_manager", "org_admin"]


class ManagedUserView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    display_name: str
    role: RoleValue
    is_active: bool


class ManagedUserList(BaseModel):
    users: list[ManagedUserView]


class CreateUserRequest(BaseModel):
    username: str = Field(min_length=1, max_length=32)
    display_name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=12, max_length=128)
    role: RoleValue = "employee"

    @field_validator("username")
    @classmethod
    def check_username(cls, value: str) -> str:
        normalized = value.strip().casefold()
        if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{0,31}", normalized):
            raise ValueError("Username must use letters, numbers, dots, underscores or hyphens.")
        return normalized

    @field_validator("display_name")
    @classmethod
    def check_display_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Display name must not be blank.")
        return stripped


class UpdateUserRequest(BaseModel):
    role: RoleValue | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def require_a_change(self):
        if self.role is None and self.is_active is None:
            raise ValueError("Provide a role or account status change.")
        return self


class OrganisationUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def check_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Organisation name must not be blank.")
        return stripped
