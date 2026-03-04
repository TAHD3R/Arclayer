from __future__ import annotations

from typing import Any

from pydantic import Field

from apps.api.src.common.schemas import BaseSchema
from apps.api.src.modules.extensions.schema import (
    AppKind,
    AppProvider,
    AppScope,
    FailurePolicy,
    RemoteHookOperation,
    UIEmbedKind,
)


class AppMetaDecl(BaseSchema):
    """
    App metadata declared by provider.

    Notes:
    - App id must be stable across versions and used as the primary registry key.
    - v1 keeps fields intentionally minimal; Marketplace will add richer metadata later.
    """

    app_id: str = Field(..., description="Stable app identifier.")
    provider: AppProvider = Field(default=AppProvider.COMMUNITY)
    name: str
    description: str | None = None
    name_i18n: str | None = None
    description_i18n: str | None = None
    version: str | None = None
    website: str | None = None
    repository: str | None = None
    issues: str | None = None
    icon_url: str | None = None


class UIEmbedDecl(BaseSchema):
    id: str
    kind: UIEmbedKind
    slot: str
    title: str
    title_i18n: str | None = None
    icon: str | None = None
    embed_url: str
    sandbox: str | None = None
    permission_code: str | None = None
    meta: dict[str, Any] | None = None


class RemoteHookDecl(BaseSchema):
    operation: RemoteHookOperation
    endpoint_url: str = Field(..., description="Absolute HTTPS endpoint for this operation.")
    timeout_ms: int = Field(default=500, ge=1)
    failure_policy: FailurePolicy = FailurePolicy.FAIL_OPEN
    allowed_patch_paths: list[str] = Field(default_factory=list)
    meta: dict[str, Any] | None = None


class WebhookSubscriptionDecl(BaseSchema):
    """
    Async webhook subscription declaration.

    v1 keeps this as a stub contract; delivery runtime is implemented separately.
    """

    event: str = Field(..., description="Event name (e.g. content.entry.published).")
    endpoint_url: str = Field(..., description="Absolute HTTPS endpoint to receive events.")
    enabled_by_default: bool = Field(default=False)
    meta: dict[str, Any] | None = None


class ContentTypeDecl(BaseSchema):
    """
    Declared content type schema bundle.

    Notes:
    - This does not create DB tables.
    - Core schema engine persists and enforces these declarations.
    """

    type_key: str = Field(..., description="Stable content type key.")
    title: str
    description: str | None = None
    schema_payload: dict[str, Any] = Field(
        default_factory=dict,
        alias="schema",
        description="Schema-engine payload (v1: opaque dict).",
    )


class CapabilityDecl(BaseSchema):
    """
    Capability declaration inside an app manifest.
    """

    capability_id: str
    kind: AppKind = AppKind.EXTENSION
    scope: AppScope = AppScope.WORKSPACE
    name: str
    description: str | None = None
    name_i18n: str | None = None
    description_i18n: str | None = None
    ui_embeds: list[UIEmbedDecl] = Field(default_factory=list)
    remote_hooks: list[RemoteHookDecl] = Field(default_factory=list)
    webhooks: list[WebhookSubscriptionDecl] = Field(default_factory=list)
    content_types: list[ContentTypeDecl] = Field(default_factory=list)
    meta: dict[str, Any] | None = None


class AppManifest(BaseSchema):
    """
    Provider-facing manifest contract.

    Storage:
    - Official apps may be shipped as code and expose their manifest as a static JSON/TOML blob.
    - Community apps are registered via Registry and stored in DB; the CMS treats this as the source of truth.
    """

    manifest_version: str = Field(default="1.0")
    app: AppMetaDecl
    capabilities: list[CapabilityDecl] = Field(default_factory=list)
