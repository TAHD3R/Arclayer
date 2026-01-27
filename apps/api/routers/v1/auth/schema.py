from __future__ import annotations

import re
from uuid import UUID

from pydantic import AliasChoices, ConfigDict, EmailStr, Field, field_validator, model_validator

from apps.api.common.schemas import BaseOut, BaseSchema
from apps.api.models.organization import MembershipStatus
from apps.api.routers.v1.auth.constants import PASSWORD_REGEX, RESET_TOKEN_REGEX


class MyOrganizationOut(BaseSchema):
    """当前用户加入的组织信息（用于前端组织选择器）。"""

    organization_id: UUID = Field(..., description="组织ID")
    slug: str = Field(..., description="组织slug")
    name: str = Field(..., description="组织名称")
    logo_url: str | None = Field(default=None, description="组织Logo")
    is_active: bool = Field(default=True, description="组织是否可用")

    membership_id: UUID = Field(..., description="成员关系ID")
    membership_status: MembershipStatus = Field(..., description="成员关系状态")


class LoginRequest(BaseSchema):
    """登录请求模型。"""

    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True)

    username: str = Field(
        min_length=1,
        max_length=255,
        description="用户名/邮箱",
        validation_alias=AliasChoices("username", "identifier"),
    )
    password: str = Field(min_length=1, max_length=128, description="密码")


class RegisterRequest(BaseSchema):
    """用户注册请求模型。"""

    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True)

    username: str = Field(
        min_length=6,
        max_length=18,
        description="用户名，6-18个字符，支持字母数字下划线和中文",
        examples=["john_doe", "user123"],
    )
    email: EmailStr | None = Field(default=None, description="邮箱地址", examples=["user@example.com"])
    password: str = Field(min_length=8, max_length=128, description="密码，至少8位")
    confirm_password: str = Field(min_length=8, max_length=128, description="确认密码")
    display_name: str | None = Field(default=None, max_length=64, description="显示名称")

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        if not re.match(r"^[a-zA-Z0-9_\u4e00-\u9fa5]+$", value):
            raise ValueError("用户名只能包含字母、数字、下划线和中文字符")
        return value.lower()

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if not re.match(PASSWORD_REGEX, value):
            raise ValueError("密码必须包含字母和数字，且长度为8-128")
        return value

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, value: str, info) -> str:
        if info.data.get("password") and value != info.data["password"]:
            raise ValueError("确认密码与密码不一致")
        return value


class AcceptInvitationRequest(BaseSchema):
    """接受邀请并创建账号（邀请制注册）。"""

    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True)

    token: str = Field(min_length=8, max_length=512, description="邀请 Token")
    username: str = Field(
        min_length=6,
        max_length=18,
        description="用户名，6-18个字符，支持字母数字下划线和中文",
        examples=["john_doe", "user123"],
    )
    password: str = Field(min_length=8, max_length=128, description="密码，至少8位")
    confirm_password: str = Field(min_length=8, max_length=128, description="确认密码")
    display_name: str | None = Field(default=None, max_length=64, description="显示名称")

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        if not re.match(r"^[a-zA-Z0-9_\u4e00-\u9fa5]+$", value):
            raise ValueError("用户名只能包含字母、数字、下划线和中文字符")
        return value.lower()

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if not re.match(PASSWORD_REGEX, value):
            raise ValueError("密码必须包含字母和数字，且长度为8-128")
        return value

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, value: str, info) -> str:
        if info.data.get("password") and value != info.data["password"]:
            raise ValueError("确认密码与密码不一致")
        return value


class RefreshRequest(BaseSchema):
    """刷新令牌请求模型。"""

    refresh_token: str = Field(min_length=1, description="刷新令牌")


class LogoutRequest(BaseSchema):
    """退出登录请求模型。"""

    refresh_token: str | None = None


class ChangePasswordRequest(BaseSchema):
    """修改密码请求模型。"""

    old_password: str = Field(min_length=1, max_length=128, description="原密码")
    new_password: str = Field(min_length=8, max_length=128, description="新密码")

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        if not re.match(PASSWORD_REGEX, value):
            raise ValueError("新密码必须包含字母和数字，且长度为8-128")
        return value

    @model_validator(mode="after")
    def validate_not_same(self):
        if self.old_password == self.new_password:
            raise ValueError("新旧密码不能相同")
        return self


class ForgotPasswordRequest(BaseSchema):
    """忘记密码请求模型。"""

    identifier: str = Field(min_length=1, description="用户名/邮箱")


class ResetPasswordRequest(BaseSchema):
    """重置密码请求模型。"""

    reset_token: str = Field(min_length=1, description="重置令牌")
    new_password: str = Field(min_length=8, max_length=128, description="新密码")

    @field_validator("reset_token")
    @classmethod
    def validate_reset_token(cls, value: str) -> str:
        if not re.match(RESET_TOKEN_REGEX, value):
            raise ValueError("重置令牌格式不正确")
        return value

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        if not re.match(PASSWORD_REGEX, value):
            raise ValueError("新密码必须包含字母和数字，且长度为8-128")
        return value


class TokenPair(BaseSchema):
    """登录令牌响应模型。"""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_expires_in: int


class ResetTokenPayload(BaseSchema):
    """重置令牌载荷。"""

    reset_token: str
    expires_in: int


class UserProfile(BaseOut):
    """用户信息响应模型。"""

    username: str
    email: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
