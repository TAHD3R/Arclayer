from __future__ import annotations

from typing import Any

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, TypeAdapter, ValidationError

from src.core.exceptions import BadRequest
from src.core.i18n import t
from src.models.automation.flow import AutomationOperationKind, AutomationTriggerKind


class AutomationTriggerDefinition(BaseModel):
    model_config = ConfigDict(frozen=True)
    kind: AutomationTriggerKind
    event_name: str
    label: str
    description: str


class AutomationOperationDefinition(BaseModel):
    model_config = ConfigDict(frozen=True)
    kind: AutomationOperationKind
    label: str
    description: str
    required_fields: tuple[str, ...] = ()


TRIGGER_DEFINITIONS: tuple[AutomationTriggerDefinition, ...] = (
    AutomationTriggerDefinition(
        kind=AutomationTriggerKind.PUBLISH_COMPLETED,
        event_name="release.published",
        label="Release published",
        description="Runs after a project release is activated.",
    ),
    AutomationTriggerDefinition(
        kind=AutomationTriggerKind.CONTENT_TRANSITIONED,
        event_name="project.content.item.workflow.updated",
        label="Workflow stage changed",
        description="Runs when a content item changes editorial workflow stage.",
    ),
    AutomationTriggerDefinition(
        kind=AutomationTriggerKind.API_KEY_ROTATED,
        event_name="project.api_key.rotated",
        label="API key rotated",
        description="Runs when a project API key is rotated.",
    ),
    AutomationTriggerDefinition(
        kind=AutomationTriggerKind.PREVIEW_TOKEN_CREATED,
        event_name="project.preview_token.created",
        label="Preview token issued",
        description="Runs when a project preview token is issued.",
    ),
)

WORKSPACE_TRIGGER_DEFINITIONS: tuple[AutomationTriggerDefinition, ...] = ()
PROJECT_TRIGGER_DEFINITIONS: tuple[AutomationTriggerDefinition, ...] = TRIGGER_DEFINITIONS

OPERATION_DEFINITIONS: tuple[AutomationOperationDefinition, ...] = (
    AutomationOperationDefinition(
        kind=AutomationOperationKind.WEBHOOK,
        label="Webhook",
        description="Send a JSON webhook request.",
        required_fields=("url",),
    ),
    AutomationOperationDefinition(
        kind=AutomationOperationKind.HTTP_REQUEST,
        label="HTTP request",
        description="Send a generic JSON HTTP request.",
        required_fields=("url",),
    ),
    AutomationOperationDefinition(
        kind=AutomationOperationKind.CONTENT_READ,
        label="Content read",
        description="Read a content item from the event payload or explicit config.",
    ),
    AutomationOperationDefinition(
        kind=AutomationOperationKind.CONTENT_UPDATE,
        label="Content update",
        description="Patch a content item workflow stage.",
        required_fields=("itemId",),
    ),
    AutomationOperationDefinition(
        kind=AutomationOperationKind.RELEASE_PUBLISH,
        label="Release publish",
        description="Publish a release for the flow project runtime.",
    ),
    AutomationOperationDefinition(
        kind=AutomationOperationKind.NOTIFICATION,
        label="Notification",
        description="Create an in-app notification for one recipient.",
        required_fields=("recipientUserId", "title"),
    ),
)

WORKSPACE_OPERATION_DEFINITIONS: tuple[AutomationOperationDefinition, ...] = tuple(
    definition
    for definition in OPERATION_DEFINITIONS
    if definition.kind
    in {
        AutomationOperationKind.WEBHOOK,
        AutomationOperationKind.HTTP_REQUEST,
        AutomationOperationKind.NOTIFICATION,
    }
)
PROJECT_OPERATION_DEFINITIONS: tuple[AutomationOperationDefinition, ...] = OPERATION_DEFINITIONS

_TRIGGERS_BY_KIND = {definition.kind: definition for definition in TRIGGER_DEFINITIONS}
_TRIGGERS_BY_EVENT = {definition.event_name: definition for definition in TRIGGER_DEFINITIONS}
_OPERATIONS_BY_KIND = {definition.kind: definition for definition in OPERATION_DEFINITIONS}
_URL_ADAPTER = TypeAdapter(AnyHttpUrl)


def list_automation_triggers() -> tuple[AutomationTriggerDefinition, ...]:
    return TRIGGER_DEFINITIONS


def list_global_automation_triggers() -> tuple[AutomationTriggerDefinition, ...]:
    return WORKSPACE_TRIGGER_DEFINITIONS


def list_workspace_automation_triggers() -> tuple[AutomationTriggerDefinition, ...]:
    return WORKSPACE_TRIGGER_DEFINITIONS


def list_project_automation_triggers() -> tuple[AutomationTriggerDefinition, ...]:
    return PROJECT_TRIGGER_DEFINITIONS


def list_automation_operation_kinds() -> tuple[AutomationOperationDefinition, ...]:
    return OPERATION_DEFINITIONS


def list_global_automation_operation_kinds() -> tuple[AutomationOperationDefinition, ...]:
    return WORKSPACE_OPERATION_DEFINITIONS


def list_workspace_automation_operation_kinds() -> tuple[AutomationOperationDefinition, ...]:
    return WORKSPACE_OPERATION_DEFINITIONS


def list_project_automation_operation_kinds() -> tuple[AutomationOperationDefinition, ...]:
    return PROJECT_OPERATION_DEFINITIONS


def trigger_definition_for_kind(kind: AutomationTriggerKind) -> AutomationTriggerDefinition:
    return _TRIGGERS_BY_KIND[kind]


def trigger_definition_for_event(event_name: str) -> AutomationTriggerDefinition | None:
    return _TRIGGERS_BY_EVENT.get(event_name)


def operation_definition_for_kind(kind: AutomationOperationKind) -> AutomationOperationDefinition:
    normalized_kind = AutomationOperationKind(str(kind))
    return _OPERATIONS_BY_KIND[normalized_kind]


def validate_operation_config(kind: AutomationOperationKind, config: dict[str, Any] | None) -> dict[str, Any]:
    normalized_kind = AutomationOperationKind(str(kind))
    normalized = dict(config or {})
    definition = operation_definition_for_kind(normalized_kind)
    missing = [field for field in definition.required_fields if not str(normalized.get(field) or "").strip()]
    if missing:
        raise BadRequest(
            message=t("errors", "AUTOMATION_OPERATION_CONFIG_INVALID"),
            error="AUTOMATION_OPERATION_CONFIG_INVALID",
            meta={"operationKind": normalized_kind.value, "missingFields": missing},
        )
    if normalized_kind in {AutomationOperationKind.WEBHOOK, AutomationOperationKind.HTTP_REQUEST}:
        try:
            normalized["url"] = str(_URL_ADAPTER.validate_python(normalized.get("url")))
        except ValidationError as exc:
            raise BadRequest(
                message=t("errors", "AUTOMATION_OPERATION_URL_INVALID"),
                error="AUTOMATION_OPERATION_URL_INVALID",
                meta={"operationKind": normalized_kind.value},
            ) from exc
    return normalized
