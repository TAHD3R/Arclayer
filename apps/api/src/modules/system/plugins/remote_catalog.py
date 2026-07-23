from __future__ import annotations

import json
from datetime import datetime
from urllib.parse import urlsplit

import httpx
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from packaging.version import Version
from pydantic import AnyHttpUrl, ConfigDict, Field, field_validator

from src.common.schemas import BaseSchema
from src.config import PluginDistributionSettings
from src.core.extensions.manifest import ExtensionManifest
from src.settings.signing import fingerprint_key_bytes, load_public_key, verify_detached


class PluginCatalogError(RuntimeError):
    def __init__(self, *, code: str, safe_message: str) -> None:
        super().__init__(safe_message)
        self.code = code
        self.safe_message = safe_message


class RemotePluginArtifact(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    artifact_url: AnyHttpUrl
    artifact_checksum: str = Field(..., pattern=r"^sha256:[0-9a-f]{64}$")
    package_checksum: str = Field(..., pattern=r"^sha256:[0-9a-f]{64}$")
    manifest_digest: str = Field(..., pattern=r"^sha256:[0-9a-f]{64}$")
    detached_signature: str = Field(..., min_length=1, max_length=512)
    signer_fingerprint: str = Field(..., pattern=r"^[0-9a-f]{64}$")
    size_bytes: int = Field(..., ge=1)
    manifest: ExtensionManifest


class RemotePluginCatalogPayload(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    schema_version: int = Field(..., ge=1, le=1)
    catalog_revision: str = Field(..., min_length=1, max_length=128)
    generated_at: datetime
    items: tuple[RemotePluginArtifact, ...] = Field(default_factory=tuple, max_length=10_000)

    @field_validator("items")
    @classmethod
    def _require_unique_artifact_identities(
        cls,
        items: tuple[RemotePluginArtifact, ...],
    ) -> tuple[RemotePluginArtifact, ...]:
        identities = [(item.manifest.name, item.manifest.version) for item in items]
        if len(set(identities)) != len(identities):
            raise ValueError("catalog contains duplicate plugin name/version identities")
        return items


class RemotePluginCatalogEnvelope(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    payload: RemotePluginCatalogPayload
    detached_signature: str = Field(..., min_length=1, max_length=512)
    signer_fingerprint: str = Field(..., pattern=r"^[0-9a-f]{64}$")


class RemotePluginCatalogClient:
    def __init__(
        self,
        settings: PluginDistributionSettings,
        *,
        allow_insecure_http: bool,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.settings = settings
        self.allow_insecure_http = allow_insecure_http
        self.transport = transport

    async def fetch(self) -> RemotePluginCatalogPayload:
        url = self.settings.catalog_index_url
        if url is None:
            raise PluginCatalogError(
                code="PLUGIN_CATALOG_NOT_CONFIGURED",
                safe_message="No approved online plugin catalog is configured",
            )
        self._validate_url(str(url))
        payload = await self._download(str(url), limit=self.settings.max_catalog_bytes)
        try:
            envelope = RemotePluginCatalogEnvelope.model_validate_json(payload)
        except Exception as exc:
            raise PluginCatalogError(
                code="PLUGIN_CATALOG_INVALID",
                safe_message="Plugin catalog response does not match the supported schema",
            ) from exc
        self._verify_catalog_signature(envelope)
        trusted_fingerprints = self._trusted_fingerprints()
        for item in envelope.payload.items:
            self._validate_url(str(item.artifact_url))
            if item.signer_fingerprint not in trusted_fingerprints:
                raise PluginCatalogError(
                    code="PLUGIN_ARTIFACT_SIGNER_NOT_TRUSTED",
                    safe_message=f"Catalog package {item.manifest.name} uses an unapproved signing key",
                )
            if item.size_bytes > self.settings.max_package_bytes:
                raise PluginCatalogError(
                    code="PLUGIN_PACKAGE_TOO_LARGE",
                    safe_message=f"Catalog package {item.manifest.name} exceeds the configured package limit",
                )
        return envelope.payload

    async def download_artifact(self, item: RemotePluginArtifact) -> bytes:
        self._validate_url(str(item.artifact_url))
        payload = await self._download(str(item.artifact_url), limit=self.settings.max_package_bytes)
        if len(payload) != item.size_bytes:
            raise PluginCatalogError(
                code="PLUGIN_ARTIFACT_SIZE_MISMATCH",
                safe_message="Downloaded plugin package size does not match its signed catalog identity",
            )
        return payload

    @staticmethod
    def select_item(
        catalog: RemotePluginCatalogPayload,
        *,
        plugin_name: str,
        version: str | None,
    ) -> RemotePluginArtifact:
        candidates = [item for item in catalog.items if item.manifest.name == plugin_name]
        if version is not None:
            candidates = [item for item in candidates if item.manifest.version == version]
        if not candidates:
            raise PluginCatalogError(
                code="PLUGIN_CATALOG_ITEM_NOT_FOUND",
                safe_message="Requested plugin package was not found in the approved catalog",
            )
        return max(candidates, key=lambda item: Version(item.manifest.version))

    async def _download(self, url: str, *, limit: int) -> bytes:
        timeout = httpx.Timeout(
            connect=self.settings.connect_timeout_seconds,
            read=self.settings.read_timeout_seconds,
            write=self.settings.read_timeout_seconds,
            pool=self.settings.connect_timeout_seconds,
        )
        try:
            async with httpx.AsyncClient(timeout=timeout, transport=self.transport, follow_redirects=False) as client:
                async with client.stream(
                    "GET", url, headers={"Accept": "application/json, application/zip"}
                ) as response:
                    if response.is_redirect:
                        raise PluginCatalogError(
                            code="PLUGIN_CATALOG_REDIRECT_FORBIDDEN",
                            safe_message="Plugin catalog downloads cannot redirect to an unreviewed origin",
                        )
                    response.raise_for_status()
                    declared_length = response.headers.get("content-length")
                    if declared_length is not None and int(declared_length) > limit:
                        raise PluginCatalogError(
                            code="PLUGIN_CATALOG_RESPONSE_TOO_LARGE",
                            safe_message="Plugin catalog response exceeds the configured size limit",
                        )
                    chunks: list[bytes] = []
                    received = 0
                    async for chunk in response.aiter_bytes():
                        received += len(chunk)
                        if received > limit:
                            raise PluginCatalogError(
                                code="PLUGIN_CATALOG_RESPONSE_TOO_LARGE",
                                safe_message="Plugin catalog response exceeds the configured size limit",
                            )
                        chunks.append(chunk)
                    return b"".join(chunks)
        except PluginCatalogError:
            raise
        except (httpx.HTTPError, ValueError) as exc:
            raise PluginCatalogError(
                code="PLUGIN_CATALOG_REQUEST_FAILED",
                safe_message="Approved plugin catalog request failed",
            ) from exc

    def _verify_catalog_signature(self, envelope: RemotePluginCatalogEnvelope) -> None:
        payload = _canonical_json(envelope.payload)
        for path in self.settings.trusted_public_key_paths:
            public_key = load_public_key(path)
            key_bytes = public_key.public_bytes(Encoding.Raw, PublicFormat.Raw)
            fingerprint = fingerprint_key_bytes(key_bytes)
            if fingerprint != envelope.signer_fingerprint:
                continue
            if verify_detached(payload, signature_b64=envelope.detached_signature, public_key=public_key):
                return
        raise PluginCatalogError(
            code="PLUGIN_CATALOG_SIGNATURE_INVALID",
            safe_message="Plugin catalog signature is not valid for its declared approved signer",
        )

    def _trusted_fingerprints(self) -> frozenset[str]:
        fingerprints: set[str] = set()
        for path in self.settings.trusted_public_key_paths:
            public_key = load_public_key(path)
            key_bytes = public_key.public_bytes(Encoding.Raw, PublicFormat.Raw)
            fingerprints.add(fingerprint_key_bytes(key_bytes))
        return frozenset(fingerprints)

    def _validate_url(self, url: str) -> None:
        parsed = urlsplit(url)
        host = (parsed.hostname or "").lower().rstrip(".")
        if parsed.scheme not in ({"https", "http"} if self.allow_insecure_http else {"https"}):
            raise PluginCatalogError(
                code="PLUGIN_CATALOG_URL_INVALID",
                safe_message="Plugin catalog URLs must use an approved HTTPS origin",
            )
        if (
            parsed.username is not None
            or parsed.password is not None
            or host not in self.settings.allowed_download_hosts
        ):
            raise PluginCatalogError(
                code="PLUGIN_CATALOG_ORIGIN_NOT_ALLOWED",
                safe_message="Plugin catalog URL origin is not in the deployment allow-list",
            )


def _canonical_json(payload: RemotePluginCatalogPayload) -> bytes:
    return json.dumps(
        payload.model_dump(mode="json", by_alias=True),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
