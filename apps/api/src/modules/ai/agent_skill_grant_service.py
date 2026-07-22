from __future__ import annotations

from collections.abc import Sequence
from typing import Literal, NoReturn, cast
from uuid import UUID

from pydantic import BaseModel, ConfigDict, ValidationError
from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.agents.runtime_skill_v1 import AgentRunSkillSnapshotV1Record
from src.models.skills._enums import (
    SkillInstallationStatus,
    SkillPackageScope,
    SkillPackageStatus,
    SkillValidationStatus,
    SkillVersionStatus,
)
from src.models.skills.skill_installation import SkillInstallationRecord
from src.models.skills.skill_version import (
    SkillResourceRecord,
    SkillValidationResultRecord,
    SkillVersionRecord,
)
from src.modules.ai.agent_catalog_schema import ResolvedAgentAssignment
from src.modules.ai.agent_skill_grant_schema import (
    AgentRunSkillGrantSnapshotInput,
    AgentSkillContextPackage,
    AgentSkillContextResource,
)
from src.modules.tenancy.schema import TenantContext
from src.modules.workspaces.skills.lifecycle_repository import WorkspaceSkillLifecycleRepository
from src.modules.workspaces.skills.manifest import SkillManifestV1
from src.modules.workspaces.skills.official_catalog_repository import OfficialSkillCatalogRepository
from src.modules.workspaces.skills.repository import WorkspaceSkillsRepository
from src.modules.workspaces.skills.validation import validate_persisted_skill_version


class AgentSkillGrantError(RuntimeError):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


class _ResolvedTarget(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid", frozen=True)

    package_scope: SkillPackageScope
    package_id: UUID
    version: SkillVersionRecord
    validation: SkillValidationResultRecord
    manifest: SkillManifestV1
    resources: tuple[SkillResourceRecord, ...]
    context_resources: tuple[AgentSkillContextResource, ...]
    context_byte_size: int


class AgentSkillGrantResolver:
    def __init__(
        self,
        *,
        tenant_context: TenantContext,
        packages: WorkspaceSkillsRepository,
        lifecycle: WorkspaceSkillLifecycleRepository,
        official_catalog: OfficialSkillCatalogRepository,
    ) -> None:
        self._tenant_context = tenant_context
        self._packages = packages
        self._lifecycle = lifecycle
        self._official_catalog = official_catalog

    async def validate_version_grants(
        self,
        *,
        workspace_id: UUID,
        installation_ids: tuple[UUID, ...],
        tool_grants: tuple[str, ...],
    ) -> None:
        self._require_workspace(workspace_id)
        for installation_id in installation_ids:
            installation = await self._lifecycle.get_installation(
                workspace_id=workspace_id,
                installation_id=installation_id,
            )
            await self._resolve_enabled_installation(
                workspace_id=workspace_id,
                installation=installation,
                tool_grants=tool_grants,
                conn=None,
            )

    async def resolve_run_grants(
        self,
        *,
        workspace_id: UUID,
        agents: tuple[ResolvedAgentAssignment, ...],
        conn: BaseDBAsyncClient,
    ) -> tuple[AgentRunSkillGrantSnapshotInput, ...]:
        self._require_workspace(workspace_id)
        snapshots: list[AgentRunSkillGrantSnapshotInput] = []
        for agent_order, agent in enumerate(agents):
            self._validate_agent_scope(workspace_id=workspace_id, agent=agent)
            for skill_order, installation_id in enumerate(agent.skill_installation_ids):
                installation = await self._lifecycle.get_installation_for_update(
                    workspace_id=workspace_id,
                    installation_id=installation_id,
                    conn=conn,
                )
                target = await self._resolve_enabled_installation(
                    workspace_id=workspace_id,
                    installation=installation,
                    tool_grants=agent.tool_grants,
                    conn=conn,
                )
                snapshots.append(
                    _snapshot_input(
                        agent=agent,
                        agent_order=agent_order,
                        skill_order=skill_order,
                        installation=cast(SkillInstallationRecord, installation),
                        target=target,
                    )
                )
        return tuple(snapshots)

    async def load_run_context(
        self,
        *,
        workspace_id: UUID,
        run_id: UUID,
        agents: tuple[ResolvedAgentAssignment, ...],
    ) -> tuple[AgentSkillContextPackage, ...]:
        self._require_workspace(workspace_id)
        records = tuple(
            await AgentRunSkillSnapshotV1Record.filter(run_id=run_id).order_by("agent_order", "skill_order", "id")
        )
        expected = tuple(
            (agent_order, skill_order, agent.assignment_id, agent.version_id, installation_id)
            for agent_order, agent in enumerate(agents)
            for skill_order, installation_id in enumerate(agent.skill_installation_ids)
        )
        actual = tuple(
            (
                record.agent_order,
                record.skill_order,
                record.agent_assignment_id,
                record.agent_version_id,
                record.installation_id,
            )
            for record in records
        )
        if actual != expected:
            self._raise("AGENT_SKILL_SNAPSHOT_INVALID")

        agent_by_assignment = {agent.assignment_id: agent for agent in agents}
        lead_context: list[AgentSkillContextPackage] = []
        for record in records:
            agent = agent_by_assignment.get(record.agent_assignment_id)
            if agent is None:
                self._raise("AGENT_SKILL_SNAPSHOT_INVALID")
            self._validate_agent_scope(workspace_id=workspace_id, agent=agent)
            target = await self._resolve_snapshot_target(
                workspace_id=workspace_id,
                record=record,
                tool_grants=agent.tool_grants,
            )
            if record.agent_order == 0:
                lead_context.append(_context_package(record=record, target=target))
        return tuple(lead_context)

    async def _resolve_enabled_installation(
        self,
        *,
        workspace_id: UUID,
        installation: SkillInstallationRecord | None,
        tool_grants: tuple[str, ...],
        conn: BaseDBAsyncClient | None,
    ) -> _ResolvedTarget:
        if installation is None:
            self._raise("AGENT_SKILL_INSTALLATION_NOT_FOUND")
        if installation.status != SkillInstallationStatus.ENABLED:
            self._raise("AGENT_SKILL_INSTALLATION_DISABLED")
        target = await self._load_target(
            workspace_id=workspace_id,
            package_scope=SkillPackageScope(installation.package_scope),
            package_id=installation.package_id,
            version_id=installation.version_id,
            conn=conn,
            require_active_package=True,
        )
        if (
            target.version.package_checksum != installation.package_checksum
            or target.validation.finding_hash != installation.validation_finding_hash
        ):
            self._raise("AGENT_SKILL_VERSION_INVALID")
        _require_acceptance(installation=installation, manifest=target.manifest)
        _require_tools(tool_grants=tool_grants, manifest=target.manifest)
        return target

    async def _resolve_snapshot_target(
        self,
        *,
        workspace_id: UUID,
        record: AgentRunSkillSnapshotV1Record,
        tool_grants: tuple[str, ...],
    ) -> _ResolvedTarget:
        target = await self._load_target(
            workspace_id=workspace_id,
            package_scope=SkillPackageScope(record.package_scope),
            package_id=record.package_id,
            version_id=record.skill_version_id,
            conn=None,
            require_active_package=False,
        )
        if (
            target.version.package_checksum != record.package_checksum
            or target.version.validation_policy_version != record.validation_policy_version
            or target.validation.finding_hash != record.validation_finding_hash
            or target.context_byte_size != record.context_byte_size
        ):
            self._raise("AGENT_SKILL_SNAPSHOT_INVALID")
        _require_tools(tool_grants=tool_grants, manifest=target.manifest)
        return target

    async def _load_target(
        self,
        *,
        workspace_id: UUID,
        package_scope: SkillPackageScope,
        package_id: UUID,
        version_id: UUID,
        conn: BaseDBAsyncClient | None,
        require_active_package: bool,
    ) -> _ResolvedTarget:
        if package_scope == SkillPackageScope.SYSTEM:
            version = await self._official_catalog.get_version(
                package_id=package_id,
                version_id=version_id,
            )
            validation = await self._official_catalog.get_latest_validation(version_id=version_id)
            resources = await self._official_catalog.list_resources(version_id=version_id)
            if require_active_package and await self._official_catalog.get_package(package_id=package_id) is None:
                self._raise("AGENT_SKILL_VERSION_INVALID")
        else:
            package = await self._packages.get_package(
                workspace_id=workspace_id,
                package_id=package_id,
                conn=conn,
            )
            version = await self._packages.get_version(
                workspace_id=workspace_id,
                package_id=package_id,
                version_id=version_id,
                conn=conn,
            )
            validation = await self._lifecycle.get_latest_validation(
                workspace_id=workspace_id,
                version_id=version_id,
                conn=conn,
            )
            resources = await self._packages.list_resources(
                workspace_id=workspace_id,
                version_id=version_id,
                conn=conn,
            )
            if package is None or (require_active_package and package.status != SkillPackageStatus.ACTIVE):
                self._raise("AGENT_SKILL_VERSION_INVALID")
        return _validated_target(
            package_scope=package_scope,
            package_id=package_id,
            version=version,
            validation=validation,
            resources=resources,
        )

    def _require_workspace(self, workspace_id: UUID) -> None:
        if workspace_id != self._tenant_context.workspace_id:
            self._raise("AGENT_SKILL_WORKSPACE_MISMATCH")

    @staticmethod
    def _validate_agent_scope(*, workspace_id: UUID, agent: ResolvedAgentAssignment) -> None:
        expected = workspace_id if agent.skill_installation_ids else None
        if agent.skill_grant_workspace_id != expected:
            AgentSkillGrantResolver._raise("AGENT_SKILL_WORKSPACE_MISMATCH")

    @staticmethod
    def _raise(code: str) -> NoReturn:
        raise AgentSkillGrantError(code)


def _validated_target(
    *,
    package_scope: SkillPackageScope,
    package_id: UUID,
    version: SkillVersionRecord | None,
    validation: SkillValidationResultRecord | None,
    resources: tuple[SkillResourceRecord, ...],
) -> _ResolvedTarget:
    if (
        version is None
        or validation is None
        or str(version.status) not in {SkillVersionStatus.VALID.value, SkillVersionStatus.WARNING.value}
        or str(validation.status) not in {SkillValidationStatus.VALID.value, SkillValidationStatus.WARNING.value}
        or validation.validator_policy_version != version.validation_policy_version
    ):
        raise AgentSkillGrantError("AGENT_SKILL_VERSION_INVALID")
    outcome = validate_persisted_skill_version(
        version=version,
        resources=resources,
        policy_version=version.validation_policy_version,
    )
    if outcome.status not in {SkillValidationStatus.VALID, SkillValidationStatus.WARNING}:
        raise AgentSkillGrantError("AGENT_SKILL_VERSION_INVALID")
    if outcome.finding_hash != validation.finding_hash:
        raise AgentSkillGrantError("AGENT_SKILL_VERSION_INVALID")
    try:
        manifest = SkillManifestV1.model_validate(version.manifest)
        context_resources = _context_resources(
            resources,
            instructions_entrypoint=manifest.instructions_entrypoint,
        )
    except (TypeError, ValueError, ValidationError) as error:
        raise AgentSkillGrantError("AGENT_SKILL_VERSION_INVALID") from error
    return _ResolvedTarget(
        package_scope=package_scope,
        package_id=package_id,
        version=version,
        validation=validation,
        manifest=manifest,
        resources=resources,
        context_resources=context_resources,
        context_byte_size=sum(resource.byte_size for resource in context_resources),
    )


def _context_resources(
    resources: Sequence[SkillResourceRecord],
    *,
    instructions_entrypoint: str,
) -> tuple[AgentSkillContextResource, ...]:
    context: list[AgentSkillContextResource] = []
    ordered = sorted(
        resources,
        key=lambda resource: (
            resource.normalized_path != instructions_entrypoint,
            resource.normalized_path,
        ),
    )
    for resource in ordered:
        role = str(resource.role)
        if role == "asset":
            continue
        if role not in {"instructions", "reference"} or resource.inline_content is None:
            raise AgentSkillGrantError("AGENT_SKILL_VERSION_INVALID")
        context.append(
            AgentSkillContextResource(
                path=resource.normalized_path,
                role=cast(Literal["instructions", "reference"], role),
                mime_type=resource.mime_type,
                digest=resource.content_digest,
                content=resource.inline_content,
                byte_size=resource.byte_size,
            )
        )
    if not context:
        raise AgentSkillGrantError("AGENT_SKILL_VERSION_INVALID")
    return tuple(context)


def _require_acceptance(*, installation: SkillInstallationRecord, manifest: SkillManifestV1) -> None:
    if (
        set(installation.accepted_required_tools or []) != {item.tool_id for item in manifest.required_tools}
        or set(installation.accepted_permissions or []) != {item.action for item in manifest.permissions}
        or set(installation.accepted_data_egress or []) != {item.destination for item in manifest.data_egress}
    ):
        raise AgentSkillGrantError("AGENT_SKILL_DECLARATION_MISMATCH")


def _require_tools(*, tool_grants: tuple[str, ...], manifest: SkillManifestV1) -> None:
    if not {item.tool_id for item in manifest.required_tools}.issubset(tool_grants):
        raise AgentSkillGrantError("AGENT_SKILL_TOOL_GRANT_MISSING")


def _snapshot_input(
    *,
    agent: ResolvedAgentAssignment,
    agent_order: int,
    skill_order: int,
    installation: SkillInstallationRecord,
    target: _ResolvedTarget,
) -> AgentRunSkillGrantSnapshotInput:
    return AgentRunSkillGrantSnapshotInput(
        agent_assignment_id=agent.assignment_id,
        agent_version_id=agent.version_id,
        agent_order=agent_order,
        skill_order=skill_order,
        installation_id=installation.id,
        package_scope=target.package_scope.value,
        package_id=target.package_id,
        skill_version_id=target.version.id,
        package_checksum=target.version.package_checksum,
        validation_policy_version=target.version.validation_policy_version,
        validation_finding_hash=target.validation.finding_hash,
        context_byte_size=target.context_byte_size,
    )


def _context_package(
    *,
    record: AgentRunSkillSnapshotV1Record,
    target: _ResolvedTarget,
) -> AgentSkillContextPackage:
    return AgentSkillContextPackage(
        installation_id=record.installation_id,
        package_id=record.package_id,
        skill_version_id=record.skill_version_id,
        package_checksum=record.package_checksum,
        name=target.manifest.name,
        instructions_entrypoint=target.manifest.instructions_entrypoint,
        resources=target.context_resources,
    )


def build_agent_skill_grant_resolver(tenant_context: TenantContext) -> AgentSkillGrantResolver:
    return AgentSkillGrantResolver(
        tenant_context=tenant_context,
        packages=WorkspaceSkillsRepository(tenant_context),
        lifecycle=WorkspaceSkillLifecycleRepository(tenant_context),
        official_catalog=OfficialSkillCatalogRepository(),
    )
