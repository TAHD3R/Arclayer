"""
基础 Schema 定义

提供项目中所有 Schema 的基础类和通用 Mixin。
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class BaseSchema(BaseModel):
    """基础 Schema 类。"""

    model_config = ConfigDict(
        str_strip_whitespace=True,
        validate_assignment=True,
        use_enum_values=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )


class IdMixin(BaseModel):
    """包含 ID 字段的 Mixin。"""

    id: UUID = Field(..., description="ID")


class TimestampMixin(BaseModel):
    """包含时间戳字段的 Mixin。"""

    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")


class BaseOut(IdMixin, BaseSchema):
    """基础输出 Schema 类。"""

    model_config = ConfigDict(
        from_attributes=True,
        str_strip_whitespace=True,
        validate_assignment=True,
        use_enum_values=True,
        populate_by_name=True,
        alias_generator=to_camel,
    )


class BulkOperationSchema(BaseModel):
    """批量操作 Schema。"""

    ids: list[UUID] | list[UUID] = Field(..., min_length=1, description="对象ID列表")


class BulkOperationResponseSchema(BaseModel):
    """批量操作响应 Schema。"""

    total_count: int = Field(..., ge=0, description="总数")
    success_count: int = Field(..., ge=0, description="成功数")
    failed_count: int = Field(..., ge=0, description="失败数")
    failed_items: list[UUID | str] | None = Field(
        default_factory=list,
        description="失败项列表（ID 或更易识别的引用，如代码）",
    )
