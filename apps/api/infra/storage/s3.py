from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import anyio

from apps.api.config import Settings


@dataclass(frozen=True, slots=True)
class PresignedPart:
    url: str
    method: str = "PUT"
    headers: dict[str, str] | None = None


@dataclass(frozen=True, slots=True)
class S3HeadObject:
    size_bytes: int
    content_type: str | None
    etag: str | None


@dataclass(frozen=True, slots=True)
class S3GetObject:
    body: Any
    content_type: str | None
    content_length: int | None
    etag: str | None


class S3StorageProvider:
    provider = "s3"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

        storage = settings.storage
        if not storage.s3_bucket:
            raise ValueError("STORAGE__S3_BUCKET is required when provider=s3")
        if not storage.s3_endpoint_url:
            raise ValueError("STORAGE__S3_ENDPOINT_URL is required when provider=s3")
        if not storage.s3_access_key_id or not storage.s3_secret_access_key:
            raise ValueError(
                "STORAGE__S3_ACCESS_KEY_ID and STORAGE__S3_SECRET_ACCESS_KEY are required when provider=s3"
            )

        self.bucket = storage.s3_bucket
        self.endpoint_url = storage.s3_endpoint_url
        self.region = storage.s3_region
        self.force_path_style = bool(storage.s3_force_path_style)
        self.access_key_id = storage.s3_access_key_id
        self.secret_access_key = storage.s3_secret_access_key.get_secret_value()

    def _client(self):
        # Lazy import: keep dev/test usable even if boto3 isn't installed,
        # as long as provider != s3.
        import boto3  # type: ignore[import-not-found]
        from botocore.config import Config  # type: ignore[import-not-found]

        s3_cfg = {"addressing_style": "path"} if self.force_path_style else {"addressing_style": "auto"}
        cfg = Config(s3=s3_cfg)
        session = boto3.session.Session()
        return session.client(
            "s3",
            endpoint_url=self.endpoint_url,
            region_name=self.region,
            aws_access_key_id=self.access_key_id,
            aws_secret_access_key=self.secret_access_key,
            config=cfg,
        )

    async def head_object(self, *, object_key: str) -> S3HeadObject:
        def _call() -> S3HeadObject:
            client = self._client()
            resp = client.head_object(Bucket=self.bucket, Key=object_key)
            return S3HeadObject(
                size_bytes=int(resp.get("ContentLength") or 0),
                content_type=(resp.get("ContentType") or None),
                etag=(resp.get("ETag") or None),
            )

        return await anyio.to_thread.run_sync(_call)

    async def get_object(self, *, object_key: str, byte_range: tuple[int, int] | None) -> S3GetObject:
        """
        Fetch an object (optionally ranged).

        Notes:
        - The returned body is a botocore StreamingBody (sync, blocking reads). Callers should read it in a thread.
        """

        def _call() -> S3GetObject:
            client = self._client()
            params: dict[str, Any] = {"Bucket": self.bucket, "Key": object_key}
            if byte_range is not None:
                start, end = byte_range
                params["Range"] = f"bytes={int(start)}-{int(end)}"
            resp = client.get_object(**params)
            return S3GetObject(
                body=resp["Body"],
                content_type=(resp.get("ContentType") or None),
                content_length=int(resp.get("ContentLength") or 0) if resp.get("ContentLength") is not None else None,
                etag=(resp.get("ETag") or None),
            )

        return await anyio.to_thread.run_sync(_call)

    async def download_object_to_path(self, *, object_key: str, out_path: Path) -> S3HeadObject:
        """
        Download an object to a local file path (best-effort).

        Used by processors (e.g. thumbnail generation) when we need local file access.
        """

        def _call() -> S3HeadObject:
            client = self._client()
            resp = client.get_object(Bucket=self.bucket, Key=object_key)
            body = resp["Body"]
            out_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                with out_path.open("wb") as f:
                    while True:
                        chunk = body.read(1024 * 1024)
                        if not chunk:
                            break
                        f.write(chunk)
            finally:
                try:
                    body.close()
                except Exception:
                    pass

            return S3HeadObject(
                size_bytes=int(resp.get("ContentLength") or 0),
                content_type=(resp.get("ContentType") or None),
                etag=(resp.get("ETag") or None),
            )

        return await anyio.to_thread.run_sync(_call)

    async def put_object_bytes(
        self,
        *,
        object_key: str,
        data: bytes,
        content_type: str | None,
        public_read: bool,
        cache_control: str | None = None,
    ) -> None:
        def _call() -> None:
            client = self._client()
            params: dict[str, Any] = {"Bucket": self.bucket, "Key": object_key, "Body": data}
            if content_type:
                params["ContentType"] = content_type
            if cache_control:
                params["CacheControl"] = cache_control
            params["ACL"] = "public-read" if public_read else "private"
            client.put_object(**params)

        await anyio.to_thread.run_sync(_call)

    async def create_multipart_upload(
        self,
        *,
        object_key: str,
        content_type: str | None,
        public_read: bool,
    ) -> str:
        def _call() -> str:
            client = self._client()
            params: dict[str, Any] = {"Bucket": self.bucket, "Key": object_key}
            if content_type:
                params["ContentType"] = content_type
            # Use per-object ACL for mixed public/private assets in the same bucket.
            params["ACL"] = "public-read" if public_read else "private"
            resp = client.create_multipart_upload(**params)
            return str(resp["UploadId"])

        return await anyio.to_thread.run_sync(_call)

    async def presign_upload_part(
        self,
        *,
        object_key: str,
        upload_id: str,
        part_number: int,
        expires_in: int,
    ) -> PresignedPart:
        def _call() -> PresignedPart:
            client = self._client()
            url = client.generate_presigned_url(
                ClientMethod="upload_part",
                Params={
                    "Bucket": self.bucket,
                    "Key": object_key,
                    "UploadId": upload_id,
                    "PartNumber": int(part_number),
                },
                ExpiresIn=int(expires_in),
            )
            return PresignedPart(url=url, method="PUT", headers={})

        return await anyio.to_thread.run_sync(_call)

    async def complete_multipart_upload(
        self,
        *,
        object_key: str,
        upload_id: str,
        parts: list[dict[str, Any]],
    ) -> None:
        """
        parts: list of {"ETag": "...", "PartNumber": 1}
        """

        def _call() -> None:
            client = self._client()
            client.complete_multipart_upload(
                Bucket=self.bucket,
                Key=object_key,
                UploadId=upload_id,
                MultipartUpload={"Parts": parts},
            )

        await anyio.to_thread.run_sync(_call)

    async def abort_multipart_upload(self, *, object_key: str, upload_id: str) -> None:
        def _call() -> None:
            client = self._client()
            client.abort_multipart_upload(
                Bucket=self.bucket,
                Key=object_key,
                UploadId=upload_id,
            )

        await anyio.to_thread.run_sync(_call)

    async def presign_get_object(
        self,
        *,
        object_key: str,
        expires_in: int,
        response_content_type: str | None = None,
        response_content_disposition: str | None = None,
    ) -> str:
        def _call() -> str:
            client = self._client()
            params: dict[str, Any] = {"Bucket": self.bucket, "Key": object_key}
            if response_content_type:
                params["ResponseContentType"] = response_content_type
            if response_content_disposition:
                params["ResponseContentDisposition"] = response_content_disposition
            return str(
                client.generate_presigned_url(
                    ClientMethod="get_object",
                    Params=params,
                    ExpiresIn=int(expires_in),
                )
            )

        return await anyio.to_thread.run_sync(_call)
