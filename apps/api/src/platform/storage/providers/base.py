from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

from pydantic import ConfigDict

from src.common.schemas.base import BaseSchema
from src.platform.storage.capabilities import ObjectStorageCapabilities, ObjectStorageProviderKind
from src.platform.storage.profile_schema import StorageProfileConfig


class PresignedPart(BaseSchema):
    model_config = ConfigDict(frozen=True)

    url: str
    method: str = "PUT"
    headers: dict[str, str] | None = None


class ObjectHead(BaseSchema):
    model_config = ConfigDict(frozen=True)

    size_bytes: int
    content_type: str | None
    etag: str | None


class ObjectGet(BaseSchema):
    model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True)

    body: Any
    content_type: str | None
    content_length: int | None
    etag: str | None


class ObjectStorageProvider(ABC):
    kind: ObjectStorageProviderKind
    capabilities: ObjectStorageCapabilities

    def __init__(self, config: StorageProfileConfig) -> None:
        self.config = config
        self.kind = ObjectStorageProviderKind(str(config.provider))
        self.capabilities = config.capabilities
        self.bucket = (config.bucket or "").strip() or None

    @property
    def provider(self) -> str:
        return self.kind.value

    def require_bucket(self) -> str:
        if not self.bucket:
            raise ValueError(f"bucket is required for provider={self.provider}")
        return self.bucket

    @abstractmethod
    def with_bucket(self, bucket: str): ...

    async def ensure_bucket(self) -> bool:
        raise ValueError(f"{self.provider} does not support ensure_bucket")

    async def head_bucket(self) -> None:
        raise ValueError(f"{self.provider} does not support head_bucket")

    async def head_object(self, *, object_key: str) -> ObjectHead:
        raise ValueError(f"{self.provider} does not support head_object")

    async def get_object(self, *, object_key: str, byte_range: tuple[int, int] | None) -> ObjectGet:
        raise ValueError(f"{self.provider} does not support get_object")

    async def download_object_to_path(self, *, object_key: str, out_path: Path) -> ObjectHead:
        raise ValueError(f"{self.provider} does not support download_object_to_path")

    async def put_object_bytes(
        self,
        *,
        object_key: str,
        data: bytes,
        content_type: str | None,
        cache_control: str | None = None,
    ) -> None:
        raise ValueError(f"{self.provider} does not support put_object_bytes")

    async def copy_object_from(
        self,
        *,
        source_bucket: str,
        source_key: str,
        dest_key: str,
    ) -> None:
        raise ValueError(f"{self.provider} does not support copy_object_from")

    async def delete_object(self, *, object_key: str) -> None:
        raise ValueError(f"{self.provider} does not support delete_object")

    async def create_multipart_upload(
        self,
        *,
        object_key: str,
        content_type: str | None,
    ) -> str:
        raise ValueError(f"{self.provider} does not support create_multipart_upload")

    async def presign_upload_part(
        self,
        *,
        object_key: str,
        upload_id: str,
        part_number: int,
        expires_in: int,
    ) -> PresignedPart:
        raise ValueError(f"{self.provider} does not support presign_upload_part")

    async def complete_multipart_upload(
        self,
        *,
        object_key: str,
        upload_id: str,
        parts: list[dict[str, Any]],
    ) -> None:
        raise ValueError(f"{self.provider} does not support complete_multipart_upload")

    async def abort_multipart_upload(self, *, object_key: str, upload_id: str) -> None:
        raise ValueError(f"{self.provider} does not support abort_multipart_upload")

    async def presign_get_object(
        self,
        *,
        object_key: str,
        expires_in: int,
        response_content_type: str | None = None,
        response_content_disposition: str | None = None,
    ) -> str:
        raise ValueError(f"{self.provider} does not support presign_get_object")

    def public_url(self, *, object_key: str) -> str | None:
        base = (self.config.public_base_url or "").strip().rstrip("/")
        key = (object_key or "").strip().lstrip("/")
        if not base or not key:
            return None
        return f"{base}/{key}"
