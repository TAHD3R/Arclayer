from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import Field

from src.common.schemas import BaseSchema


class AppKind(StrEnum):
    EXTENSION = "extension"
    INTEGRATION = "integration"


class AppProvider(StrEnum):
    OFFICIAL = "official"
    COMMUNITY = "community"


class AppScope(StrEnum):
    WORKSPACE = "workspace"
    ORGANIZATION = "organization"


class UIEmbedKind(StrEnum):
    FIELD = "field"
    ENTRY_PANEL = "entry_panel"
    APP_PAGE = "app_page"


class FailurePolicy(StrEnum):
    FAIL_OPEN = "fail_open"
    FAIL_CLOSED = "fail_closed"


class RemoteHookDecision(StrEnum):
    ALLOW = "allow"
    DENY = "deny"


class RemoteHookOperation(StrEnum):
    """
    Finite set of allowed sync remote hook operations.

    Notes:
    - Keep this enum small and versioned.
    - Do not introduce arbitrary “hook names”; add operations intentionally with contracts.
    """

    CONTENT_ENTRY_VALIDATE = "content.entry.validate"
    CONTENT_ENTRY_BEFORE_SAVE = "content.entry.before_save"
    CONTENT_ENTRY_BEFORE_PUBLISH = "content.entry.before_publish"
    ASSET_BEFORE_UPLOAD = "asset.before_upload"


class CapabilitySummaryOut(BaseSchema):
    """
    User-facing capability summary (capability-first UX).
    """

    capability_id: str = Field(..., description="Stable capability identifier.")
    kind: AppKind = Field(..., description="Capability kind (extension/integration).")
    provider: AppProvider = Field(..., description="Capability provider (official/community).")
    scope: AppScope = Field(..., description="Enablement scope (workspace/organization).")

    name: str = Field(..., description="Capability display name (localized if possible).")
    description: str | None = Field(default=None, description="Capability description (localized if possible).")
    name_i18n: str | None = Field(default=None, description="i18n ref (namespace:key).")
    description_i18n: str | None = Field(default=None, description="i18n ref (namespace:key).")

    version: str | None = Field(default=None, description="Capability version (provider-defined).")
    enabled: bool = Field(default=False, description="Whether capability is enabled in current scope.")

    icon_url: str | None = Field(
        default=None,
        description="Optional icon URL (absolute) or API path.",
    )
    meta: dict[str, Any] | None = Field(default=None, description="Optional provider metadata for UI.")


class CapabilityListOut(BaseSchema):
    items: list[CapabilitySummaryOut] = Field(default_factory=list)


class UIEmbedDescriptorOut(BaseSchema):
    """
    Declarative embed descriptor for Admin UI runtime.

    Notes:
    - Community apps should use iframe embeds (embed_url).
    - Official apps may also provide embed_url, or be rendered natively (future).
    """

    id: str = Field(..., description="Embed id (stable within capability).")
    capability_id: str = Field(..., description="Owning capability id.")
    kind: UIEmbedKind = Field(..., description="Embed kind (field/entry_panel/app_page).")
    slot: str = Field(..., description="Slot identifier (host-defined).")

    title: str = Field(..., description="Embed title fallback.")
    title_i18n: str | None = Field(default=None, description="i18n ref (namespace:key).")
    icon: str | None = Field(default=None, description="Icon key (frontend maps to icon set).")

    embed_url: str = Field(..., description="Absolute iframe URL to render.")
    sandbox: str | None = Field(
        default=None,
        description="Optional iframe sandbox policy override (defaults to strict host policy).",
    )
    permission_code: str | None = Field(
        default=None,
        description="Optional permission gate for visibility.",
    )
    meta: dict[str, Any] | None = Field(default=None, description="Arbitrary embed payload.")


class UIEmbedListOut(BaseSchema):
    items: list[UIEmbedDescriptorOut] = Field(default_factory=list)


class RemoteHookContextIn(BaseSchema):
    """
    Minimal remote hook invocation context.

    Notes:
    - Do not include secrets.
    - Keep identifiers stable and public-safe (avoid raw internal ids in public contracts).
    """

    workspace_id: str | None = None
    organization_id: str | None = None
    actor_user_id: str | None = None
    trace_id: str | None = None


class RestrictedSetPatchItem(BaseSchema):
    """
    Restricted patch item (set-only).

    We intentionally avoid exposing full JSON Patch semantics in v1.
    """

    path: str = Field(..., description="Dot-path or JSON-pointer-like path (operation-defined).")
    value: Any = Field(..., description="Replacement value.")


class RemoteHookRequestIn(BaseSchema):
    operation: RemoteHookOperation
    context: RemoteHookContextIn = Field(default_factory=RemoteHookContextIn)
    payload: dict[str, Any] = Field(default_factory=dict)
    allowed_patch_paths: list[str] = Field(default_factory=list)


class RemoteHookResponseOut(BaseSchema):
    decision: RemoteHookDecision
    patch: list[RestrictedSetPatchItem] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    diagnostics: dict[str, Any] | None = None


class RemoteHookPolicyOut(BaseSchema):
    """
    Policy for a sync remote hook operation (governance surface).
    """

    operation: RemoteHookOperation
    failure_policy: FailurePolicy = FailurePolicy.FAIL_OPEN
    timeout_ms: int = Field(default=500, ge=1)
    allowed_patch_paths: list[str] = Field(default_factory=list)
