from __future__ import annotations

from typing import Any, TypeVar, cast

from pydantic import BaseModel, ConfigDict, Field, model_serializer, validate_call

from apps.api.core.logging import get_logger

T = TypeVar("T")
logger = get_logger(__name__)


def _now_ms() -> int:
    import time

    return int(time.time() * 1000)


class ResponseModel[T](BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    message: str = "请求成功"
    data: T | None = None
    error: str | None = None
    timestamp: int = Field(default_factory=_now_ms)
    meta: dict[str, Any] | None = None

    @classmethod
    def __class_getitem__(cls, params: Any):
        specialized: Any = cast("Any", super().__class_getitem__(params))
        mr = getattr(specialized, "model_rebuild", None)
        if callable(mr):
            try:
                mr(force=True)
            except Exception:
                logger.warning(f"Failed to rebuild model for {specialized}")
        return specialized

    @model_serializer(mode="wrap")
    def _serialize(self, handler):
        payload = handler(self)
        if payload.get("error") is None:
            payload.pop("error", None)
        return payload


class ResponseBase:
    @staticmethod
    @validate_call
    def success(
        *,
        message: str = "请求成功",
        data: Any | None = None,
        meta: dict[str, Any] | None = None,
    ) -> ResponseModel[Any]:
        return ResponseModel[Any](
            message=message,
            data=data,
            error=None,
            timestamp=_now_ms(),
            meta=meta,
        )

    @staticmethod
    @validate_call
    def fail(
        *,
        message: str = "请求失败",
        error: str | None = None,
        data: Any | None = None,
        meta: dict[str, Any] | None = None,
    ) -> ResponseModel[Any]:
        return ResponseModel[Any](
            message=message,
            data=data,
            error=error,
            timestamp=_now_ms(),
            meta=meta,
        )


Response = ResponseBase()
