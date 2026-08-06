from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.constants.events import (
    SYSTEM_AGENT_DEFINITION_CREATED,
    SYSTEM_AGENT_DEFINITION_UPDATED,
    SYSTEM_AGENT_VERSION_CREATED,
    SYSTEM_AGENT_VERSION_PUBLISHED,
    SYSTEM_AGENT_VERSION_RETIRED,
)
from src.core.http.pagination import PageData, PageParams
from src.models.agents.catalog import (
    AgentDefinitionRecord,
    AgentDefinitionScope,
    AgentLifecycleState,
    AgentVersionRecord,
    AgentVersionState,
)
from src.modules.ai.agent_tool_grants import SUPPORTED_AGENT_TOOL_GRANTS
from src.modules.system.agents.projection import (
    SystemAgentProjectionError,
    project_definition_detail,
    project_definition_summary,
    project_version,
)
from src.modules.system.agents.schema import (
    AgentVersionCreateRequest,
    SystemAgentCatalogCapabilitiesOut,
    SystemAgentDefinitionCreateRequest,
    SystemAgentDefinitionDetailOut,
    SystemAgentDefinitionSummaryOut,
    SystemAgentDefinitionUpdateRequest,
    SystemAgentVersionOut,
)
from src.modules.system.agents.service_base import SystemAgentServiceBase, page_data

SUPPORTED_TOOL_GRANTS = SUPPORTED_AGENT_TOOL_GRANTS
SUPPORTED_APPROVAL_PROFILES = frozenset({"human-input-v1"})


def agent_catalog_capabilities() -> SystemAgentCatalogCapabilitiesOut:
    return SystemAgentCatalogCapabilitiesOut(
        supported_tool_grants=SUPPORTED_TOOL_GRANTS,
        skill_grants_available=False,
        knowledge_grants_available=False,
        model_routing_policies=("workspace_default",),
        agent_runtime_protocol=1,
        hard_delete_supported=False,
        constraints={
            "customApprovalProfiles": sorted(SUPPORTED_APPROVAL_PROFILES),
            "officialDefinitionsMutable": False,
            "versionsImmutable": True,
            "runtimeValidationPortAvailable": True,
            "versionPublicationRequiresRuntimeValidation": True,
        },
    )


class SystemAgentDefinitionService(SystemAgentServiceBase):
    async def list_definitions(
        self,
        *,
        params: PageParams,
        query: str | None,
        lifecycle_state: str | None,
        scope: str | None,
    ) -> PageData[SystemAgentDefinitionSummaryOut]:
        bundles, total = await self._repository.list_definition_bundles(
            params=params,
            query=query.strip() if query and query.strip() else None,
            lifecycle_state=lifecycle_state,
            scope=scope,
        )
        try:
            items = tuple(project_definition_summary(bundle) for bundle in bundles)
        except SystemAgentProjectionError as error:
            self._raise_conflict(str(error))
        return page_data(items=items, total=total, params=params)

    async def get_definition(self, *, definition_id: UUID) -> SystemAgentDefinitionDetailOut:
        bundle = await self._repository.get_definition_bundle(definition_id=definition_id)
        if bundle is None:
            self._raise_not_found("AGENT_DEFINITION_NOT_FOUND")
        try:
            return project_definition_detail(bundle)
        except SystemAgentProjectionError as error:
            self._raise_conflict(str(error))

    async def create_definition(
        self,
        *,
        payload: SystemAgentDefinitionCreateRequest,
        actor_user_id: UUID,
    ) -> SystemAgentDefinitionDetailOut:
        async with self.tx() as conn:
            if await self._repository.definition_slug_exists(slug=payload.slug, conn=conn):
                self._raise_conflict("AGENT_DEFINITION_SLUG_EXISTS")
            definition = await self._repository.create_definition(
                values=_definition_values(payload=payload, actor_user_id=actor_user_id),
                conn=conn,
            )
            version = await self._create_version(
                definition=definition,
                payload=payload.initial_version,
                actor_user_id=actor_user_id,
                conn=conn,
            )
            await self._write_activity(
                event_name=SYSTEM_AGENT_DEFINITION_CREATED,
                actor_user_id=actor_user_id,
                entity_type="agent_definition",
                entity_id=definition.id,
                properties={"slug": definition.slug, "scope": "system"},
                conn=conn,
            )
            await self._write_version_activity(
                event_name=SYSTEM_AGENT_VERSION_CREATED,
                actor_user_id=actor_user_id,
                definition=definition,
                version=version,
                conn=conn,
            )
        return await self.get_definition(definition_id=definition.id)

    async def update_definition(
        self,
        *,
        definition_id: UUID,
        payload: SystemAgentDefinitionUpdateRequest,
        actor_user_id: UUID,
    ) -> SystemAgentDefinitionDetailOut:
        async with self.tx() as conn:
            definition = await self._require_definition_for_update(
                definition_id=definition_id,
                conn=conn,
            )
            self._require_custom_definition(definition)
            if definition.lifecycle_state == AgentLifecycleState.ARCHIVED:
                self._raise_conflict("AGENT_DEFINITION_ARCHIVED")
            changed = _apply_definition_update(definition=definition, payload=payload)
            if changed:
                await self._repository.save_definition(
                    definition=definition,
                    update_fields=changed,
                    conn=conn,
                )
                await self._write_activity(
                    event_name=SYSTEM_AGENT_DEFINITION_UPDATED,
                    actor_user_id=actor_user_id,
                    entity_type="agent_definition",
                    entity_id=definition.id,
                    properties={
                        "fields": changed,
                        "lifecycleState": str(definition.lifecycle_state),
                    },
                    conn=conn,
                )
        return await self.get_definition(definition_id=definition_id)

    async def create_version(
        self,
        *,
        definition_id: UUID,
        payload: AgentVersionCreateRequest,
        actor_user_id: UUID,
    ) -> SystemAgentVersionOut:
        async with self.tx() as conn:
            definition = await self._require_definition_for_update(
                definition_id=definition_id,
                conn=conn,
            )
            self._require_custom_definition(definition)
            if definition.lifecycle_state == AgentLifecycleState.ARCHIVED:
                self._raise_conflict("AGENT_DEFINITION_ARCHIVED")
            version = await self._create_version(
                definition=definition,
                payload=payload,
                actor_user_id=actor_user_id,
                conn=conn,
            )
            await self._write_version_activity(
                event_name=SYSTEM_AGENT_VERSION_CREATED,
                actor_user_id=actor_user_id,
                definition=definition,
                version=version,
                conn=conn,
            )
        return self._project_version(version)

    async def transition_version(
        self,
        *,
        definition_id: UUID,
        version_id: UUID,
        desired_state: AgentVersionState,
        actor_user_id: UUID,
    ) -> SystemAgentVersionOut:
        async with self.tx() as conn:
            definition = await self._require_definition_for_update(
                definition_id=definition_id,
                conn=conn,
            )
            self._require_custom_definition(definition)
            version = await self._repository.get_version_for_update(
                definition_id=definition_id,
                version_id=version_id,
                conn=conn,
            )
            if version is None:
                self._raise_not_found("AGENT_VERSION_NOT_FOUND")
            if desired_state == AgentVersionState.PUBLISHED:
                if version.state == AgentVersionState.PUBLISHED:
                    return self._project_version(version)
                if version.state == AgentVersionState.RETIRED:
                    self._raise_conflict("AGENT_VERSION_RETIRED")
                self._validate_persisted_version_for_publication(version)
                version.state = AgentVersionState.PUBLISHED
                version.published_at = datetime.now(UTC)
                await self._repository.save_version(
                    version=version,
                    update_fields=("state", "published_at"),
                    conn=conn,
                )
                await self._write_version_activity(
                    event_name=SYSTEM_AGENT_VERSION_PUBLISHED,
                    actor_user_id=actor_user_id,
                    definition=definition,
                    version=version,
                    conn=conn,
                )
                return self._project_version(version)
            if version.state == AgentVersionState.RETIRED:
                return self._project_version(version)
            if await self._repository.has_enabled_assignment_for_version(
                version_id=version.id,
                conn=conn,
            ):
                self._raise_conflict("AGENT_VERSION_IN_USE")
            version.state = AgentVersionState.RETIRED
            await self._repository.save_version(
                version=version,
                update_fields=("state",),
                conn=conn,
            )
            await self._write_version_activity(
                event_name=SYSTEM_AGENT_VERSION_RETIRED,
                actor_user_id=actor_user_id,
                definition=definition,
                version=version,
                conn=conn,
            )
        return self._project_version(version)

    async def _create_version(
        self,
        *,
        definition: AgentDefinitionRecord,
        payload: AgentVersionCreateRequest,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> AgentVersionRecord:
        await self._validate_version_payload(
            definition_id=definition.id,
            payload=payload,
            conn=conn,
        )
        version_number = await self._repository.next_version_number(
            definition_id=definition.id,
            conn=conn,
        )
        return await self._repository.create_version(
            values=_version_values(
                definition_id=definition.id,
                version_number=version_number,
                payload=payload,
                actor_user_id=actor_user_id,
            ),
            conn=conn,
        )

    async def _validate_version_payload(
        self,
        *,
        definition_id: UUID,
        payload: AgentVersionCreateRequest,
        conn: BaseDBAsyncClient,
    ) -> None:
        if payload.skill_grant_workspace_id is not None or payload.skill_installation_ids:
            self._raise_conflict("AGENT_WORKSPACE_CONTENT_BOUNDARY")
        if payload.knowledge_base_ids:
            self._raise_conflict("AGENT_KNOWLEDGE_GRANTS_UNAVAILABLE")
        if tuple(payload.tool_grants) != SUPPORTED_TOOL_GRANTS:
            self._raise_conflict("AGENT_TOOL_GRANTS_UNSUPPORTED")
        if payload.approval_profile.profile_id not in SUPPORTED_APPROVAL_PROFILES:
            self._raise_conflict("AGENT_APPROVAL_PROFILE_UNSUPPORTED")
        if definition_id in payload.delegation_definition_ids:
            self._raise_conflict("AGENT_DELEGATION_SELF_REFERENCE")
        targets = await self._repository.get_definitions_by_ids(
            definition_ids=payload.delegation_definition_ids,
            conn=conn,
        )
        if len(targets) != len(payload.delegation_definition_ids):
            self._raise_not_found("AGENT_DELEGATION_TARGET_NOT_FOUND")
        if any(
            target.scope != AgentDefinitionScope.SYSTEM or target.lifecycle_state != AgentLifecycleState.ACTIVE
            for target in targets.values()
        ):
            self._raise_conflict("AGENT_DELEGATION_TARGET_UNAVAILABLE")

    async def _write_version_activity(
        self,
        *,
        event_name: str,
        actor_user_id: UUID,
        definition: AgentDefinitionRecord,
        version: AgentVersionRecord,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self._write_activity(
            event_name=event_name,
            actor_user_id=actor_user_id,
            entity_type="agent_version",
            entity_id=version.id,
            properties={
                "definitionId": str(definition.id),
                "versionNumber": version.version_number,
                "contentChecksum": version.content_checksum,
                "state": str(version.state),
            },
            conn=conn,
        )

    @staticmethod
    def _require_custom_definition(definition: AgentDefinitionRecord) -> None:
        if definition.is_official:
            SystemAgentDefinitionService._raise_conflict("AGENT_OFFICIAL_DEFINITION_PROTECTED")

    @staticmethod
    def _project_version(version: AgentVersionRecord) -> SystemAgentVersionOut:
        try:
            return project_version(version)
        except SystemAgentProjectionError as error:
            SystemAgentDefinitionService._raise_conflict(str(error))

    @staticmethod
    def _validate_persisted_version_for_publication(version: AgentVersionRecord) -> None:
        if not isinstance(version.instructions, str) or not version.instructions.strip():
            SystemAgentDefinitionService._raise_conflict("AGENT_VERSION_INVALID")
        if version.model_policy.get("routingPolicy", version.model_policy.get("routing_policy")) != "workspace_default":
            SystemAgentDefinitionService._raise_conflict("AGENT_VERSION_INVALID")
        if tuple(version.tool_grants) != SUPPORTED_TOOL_GRANTS:
            SystemAgentDefinitionService._raise_conflict("AGENT_TOOL_GRANTS_UNSUPPORTED")
        if version.skill_grant_workspace_id is not None or version.skill_installation_ids:
            SystemAgentDefinitionService._raise_conflict("AGENT_WORKSPACE_CONTENT_BOUNDARY")
        if version.knowledge_base_ids:
            SystemAgentDefinitionService._raise_conflict("AGENT_KNOWLEDGE_GRANTS_UNAVAILABLE")
        approval_profile = version.approval_profile
        if (
            not isinstance(approval_profile, dict)
            or approval_profile.get("profileId", approval_profile.get("profile_id")) not in SUPPORTED_APPROVAL_PROFILES
        ):
            SystemAgentDefinitionService._raise_conflict("AGENT_APPROVAL_PROFILE_UNSUPPORTED")
        compatibility = version.compatibility
        if (
            not isinstance(compatibility, dict)
            or compatibility.get("agentRuntimeProtocol", compatibility.get("agent_runtime_protocol")) != 1
        ):
            SystemAgentDefinitionService._raise_conflict("AGENT_VERSION_INVALID")


def _definition_values(
    *,
    payload: SystemAgentDefinitionCreateRequest,
    actor_user_id: UUID,
) -> dict[str, object]:
    return {
        "workspace_id": None,
        "stable_key": f"system:{payload.slug}",
        "scope": AgentDefinitionScope.SYSTEM,
        "slug": payload.slug,
        "display_name": payload.display_name,
        "name_i18n_key": None,
        "role": payload.role,
        "role_i18n_key": None,
        "description": payload.description,
        "description_i18n_key": None,
        "avatar_url": payload.avatar_url,
        "lifecycle_state": AgentLifecycleState.ACTIVE,
        "is_official": False,
        "created_by_user_id": actor_user_id,
    }


def _version_values(
    *,
    definition_id: UUID,
    version_number: int,
    payload: AgentVersionCreateRequest,
    actor_user_id: UUID,
) -> dict[str, object]:
    return {
        "definition_id": definition_id,
        "version_number": version_number,
        "state": AgentVersionState.DRAFT,
        "instructions": payload.instructions,
        "model_policy": payload.model_policy.model_dump(by_alias=True),
        "supported_execution_modes": list(payload.supported_execution_modes),
        "tool_grants": list(payload.tool_grants),
        "skill_grant_workspace_id": payload.skill_grant_workspace_id,
        "skill_installation_ids": [str(value) for value in payload.skill_installation_ids],
        "knowledge_base_ids": [str(value) for value in payload.knowledge_base_ids],
        "delegation_definition_ids": [str(value) for value in payload.delegation_definition_ids],
        "approval_profile": payload.approval_profile.model_dump(by_alias=True),
        "compatibility": payload.compatibility.model_dump(by_alias=True),
        "provenance": {"kind": "system_custom", "createdByUserId": str(actor_user_id)},
        "content_checksum": _version_checksum(
            definition_id=definition_id,
            version_number=version_number,
            payload=payload,
        ),
        "published_at": None,
        "created_by_user_id": actor_user_id,
    }


def _apply_definition_update(
    *,
    definition: AgentDefinitionRecord,
    payload: SystemAgentDefinitionUpdateRequest,
) -> list[str]:
    changed: list[str] = []
    for field_name in ("display_name", "role", "description", "avatar_url", "lifecycle_state"):
        if field_name not in payload.model_fields_set:
            continue
        value = getattr(payload, field_name)
        if getattr(definition, field_name) == value:
            continue
        setattr(definition, field_name, value)
        changed.append(field_name)
    return changed


def _version_checksum(
    *,
    definition_id: UUID,
    version_number: int,
    payload: AgentVersionCreateRequest,
) -> str:
    content = {
        "definitionId": str(definition_id),
        "versionNumber": version_number,
        "version": payload.model_dump(mode="json", by_alias=True),
    }
    encoded = json.dumps(content, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()
