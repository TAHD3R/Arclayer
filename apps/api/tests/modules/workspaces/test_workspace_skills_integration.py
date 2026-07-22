from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.common.utils.public_ids import decode_public_id, encode_uuid
from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_app
from src.models.agents.catalog import (
    AgentAssignmentRecord,
    AgentDefinitionRecord,
    AgentDefinitionScope,
    AgentLifecycleState,
    AgentVersionRecord,
    AgentVersionState,
)
from src.models.agents.runtime_skill_v1 import AgentRunSkillSnapshotV1Record
from src.models.agents.runtime_v1 import (
    AgentExecutionModeV1,
    AgentRunStatusV1,
    AgentRunV1Record,
    AgentThreadV1Record,
)
from src.models.analytics.audit_event import AuditEvent
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobDispatchOutboxRecord,
    JobInternalStatus,
    JobWorkloadClass,
)
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.organization import Organization, OrganizationKind
from src.models.organization.user import User
from src.models.skills.skill_github_import import SkillGitHubImportRecord
from src.models.skills.skill_installation import SkillInstallationRecord
from src.models.skills.skill_package import SkillPackageRecord
from src.models.system.rbac import SystemRole
from src.models.workspaces.workspace import (
    Workspace,
    WorkspaceMembership,
    WorkspaceMembershipRole,
    WorkspaceMembershipStatus,
)
from src.modules.auth.http.service import get_current_user, get_current_user_id
from src.modules.auth.repository import UserRepository
from src.modules.auth.tokens.service import hash_password
from src.modules.jobs.dispatch_service import JobDispatchService
from src.modules.jobs.execution_schema import DurableJobExecutionOutcome, JobDeliveryCommand
from src.modules.jobs.schema import JobDispatchEnvelope, JobDispatchPolicy
from src.modules.system.agents.definition_service import SUPPORTED_TOOL_GRANTS
from src.modules.tenancy.router_helpers import bind_workspace_tenant_context
from src.modules.workspaces.rbac.service import WorkspaceRBACService
from src.modules.workspaces.skills.github_import_contract import SKILL_GITHUB_SOURCE_INVALID
from src.modules.workspaces.skills.github_source import (
    GitHubSkillSnapshot,
    GitHubSourceError,
    GitHubTreeResource,
)
from src.modules.workspaces.skills.official_catalog_repository import OfficialSkillCatalogRepository
from src.modules.workspaces.skills.official_catalog_source import PackagedOfficialSkillCatalogSource
from src.modules.workspaces.skills.official_catalog_sync import OfficialSkillCatalogSyncService
from src.modules.workspaces.skills.repository import WorkspaceSkillsRepository
from src.modules.workspaces.skills.schema import SkillPackageCreateRequest
from src.modules.workspaces.skills.service import WorkspaceSkillsService
from src.platform.jobs.composition.execution import build_job_execution_runtime

pytestmark = pytest.mark.integration


class _AcceptedSkillGitHubTransport:
    async def dispatch(self, *, task_name: str, envelope: JobDispatchEnvelope) -> str:
        assert task_name in {
            "jobs:connector:skill-github-import:v1",
            "jobs:connector:skill-github-refresh:v1",
        }
        return f"skill-github-dispatch:{envelope.job_id}"


class _DeterministicSkillGitHubFetcher:
    def __init__(self, outcomes: list[GitHubSkillSnapshot | GitHubSourceError]) -> None:
        self._outcomes = outcomes
        self.calls: list[tuple[str, str, str]] = []

    async def fetch(
        self,
        *,
        repository_url: str,
        requested_ref: str,
        subpath: str,
    ) -> GitHubSkillSnapshot:
        self.calls.append((repository_url, requested_ref, subpath))
        outcome = self._outcomes.pop(0)
        if isinstance(outcome, GitHubSourceError):
            raise outcome
        return outcome


def _git_blob_sha(content: bytes) -> str:
    return hashlib.sha1(f"blob {len(content)}\0".encode() + content, usedforsecurity=False).hexdigest()


def _github_snapshot(*, revision: str, instructions: str) -> GitHubSkillSnapshot:
    content = instructions.encode()
    return GitHubSkillSnapshot(
        repository_url="https://github.com/acme/site-planner",
        requested_ref="main",
        subpath="skills/site-planner",
        resolved_commit=revision * 40,
        resolved_tree=("f" if revision != "f" else "e") * 40,
        resources=(
            GitHubTreeResource(
                path="SKILL.md",
                blob_sha=_git_blob_sha(content),
                byte_size=len(content),
                mime_type="text/markdown",
                content=instructions,
            ),
        ),
    )


async def _execute_skill_github_job(
    *,
    job_id: UUID,
    fetcher: _DeterministicSkillGitHubFetcher,
) -> DurableJobExecutionOutcome:
    settings = get_settings()
    job = await BackgroundJobRecord.get(id=job_id)
    dispatch = await JobDispatchOutboxRecord.get(job_id=job_id)
    policy = JobDispatchPolicy(lease_seconds=30, max_attempts=3, retry_delay_seconds=5)
    service = JobDispatchService(settings, event_publisher=None)
    claimed = await service.claim_due_dispatches(
        dispatcher_id=f"skill-github-dispatcher:{job_id}",
        limit=100,
        policy=policy,
    )
    selected = next(item for item in claimed if item.id == dispatch.id)
    assert selected.claim_token is not None
    dispatched = await service.dispatch_claimed(
        dispatch_id=selected.id,
        claim_token=selected.claim_token,
        transport=_AcceptedSkillGitHubTransport(),
        policy=policy,
    )
    assert dispatched.task_message_id is not None
    runtime = build_job_execution_runtime(
        settings=settings,
        workload_class=JobWorkloadClass.CONNECTOR,
        skill_github_fetcher=fetcher,
    )
    return await runtime.executor.execute_delivery(
        command=JobDeliveryCommand(
            task_name=job.task_name,
            envelope=JobDispatchEnvelope.model_validate(dispatch.envelope),
            worker_id=f"skill-github-worker:{job_id}",
            transport_message_id=dispatched.task_message_id,
            received_at=datetime.now(UTC),
        )
    )


async def _user() -> User:
    settings = get_settings()
    suffix = uuid4().hex[:8]
    return await UserRepository().create_user(
        username=f"skills_owner_{suffix}",
        email=f"skills_owner_{suffix}@example.com",
        display_name="Workspace Skills Owner",
        password_hash=hash_password("workspace_skills_password_123", settings.auth),
    )


async def _workspace(*, owner: User) -> Workspace:
    suffix = uuid4().hex[:10]
    organization = await Organization.create(
        slug=f"workspace-skills-{suffix}",
        name="Workspace Skills Organization",
        kind=OrganizationKind.TEAM,
        owner_user_id=owner.id,
        is_active=True,
    )
    await OrgMembership.create(
        organization_id=organization.id,
        user_id=owner.id,
        role=OrgRole.OWNER,
        role_code=OrgRole.OWNER.value,
        status="active",
    )
    return await _workspace_in_organization(
        owner=owner,
        organization_id=organization.id,
        label="primary",
    )


async def _workspace_in_organization(
    *,
    owner: User,
    organization_id: UUID,
    label: str,
) -> Workspace:
    settings = get_settings()
    workspace = await Workspace.create(
        organization_id=organization_id,
        name=f"Workspace Skills {label.title()}",
        is_active=True,
        created_by_user_id=owner.id,
    )
    await WorkspaceRBACService(settings).ensure_workspace_rbac_ready(workspace_id=workspace.id)
    membership = await WorkspaceMembership.create(
        workspace_id=workspace.id,
        user_id=owner.id,
        status=WorkspaceMembershipStatus.ACTIVE,
    )
    owner_role = await SystemRole.get(workspace_id=workspace.id, code="owner")
    await WorkspaceMembershipRole.create(membership_id=membership.id, role_id=owner_role.id)
    return workspace


def _package_payload(*, instructions: str = "Use cited workspace evidence only.") -> dict[str, object]:
    return {
        "slug": "editorial-planner",
        "displayName": "Editorial Planner",
        "description": "Plans reviewable articles from workspace evidence.",
        "instructions": instructions,
        "semanticVersion": "1.0.0",
        "references": [
            {
                "path": "references/voice.md",
                "content": "# Voice\n\nBe direct, specific, and evidence-led.",
                "mimeType": "text/markdown",
            }
        ],
        "requiredTools": [
            {
                "toolId": "knowledge.search",
                "versionRange": ">=1",
                "intendedUse": "Find approved workspace evidence.",
            }
        ],
        "permissions": [],
        "dataEgress": [],
        "capabilityTags": ["content.editorial"],
    }


async def test_workspace_skills_inline_authority_is_versioned_tenant_safe_and_audited(
    prepared_db,
) -> None:
    _ = prepared_db
    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)
        owner = await _user()
        workspace = await _workspace(owner=owner)
        other_workspace = await _workspace_in_organization(
            owner=owner,
            organization_id=workspace.organization_id,
            label="other",
        )

        async def _get_user() -> User:
            return owner

        async def _get_user_id() -> UUID:
            return owner.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id
        workspace_id = encode_uuid(workspace.id)
        other_workspace_id = encode_uuid(other_workspace.id)
        base_url = f"/api/v1/workspaces/{workspace_id}/skills"

        try:
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                capabilities = await client.get(f"{base_url}/capabilities")
                assert capabilities.status_code == 200, capabilities.text
                assert capabilities.json()["data"] == {
                    "inlineAuthoringAvailable": True,
                    "immutableVersions": True,
                    "officialCatalogAvailable": True,
                    "githubImportAvailable": True,
                    "validationAvailable": True,
                    "installationAvailable": True,
                    "agentSkillGrantsAvailable": False,
                }

                payload = _package_payload()
                create_headers = {"Idempotency-Key": "skill-package-editorial"}
                created_response = await client.post(
                    f"{base_url}/packages",
                    headers=create_headers,
                    json=payload,
                )
                assert created_response.status_code == 201, created_response.text
                created = created_response.json()["data"]
                package = created["package"]
                version_1 = created["version"]
                package_id = package["id"]
                version_1_id = version_1["id"]
                assert package["sourceKind"] == "inline"
                assert package["trustLevel"] == "workspace_authored"
                assert package["versionCount"] == 1
                assert version_1["status"] == "candidate"
                assert version_1["versionNumber"] == 1
                assert version_1["manifest"]["instructionsEntrypoint"] == "SKILL.md"
                version_1_resources = {resource["path"]: resource for resource in version_1["resources"]}
                assert version_1_resources["SKILL.md"]["content"] == "Use cited workspace evidence only."
                assert version_1["packageChecksum"].startswith("sha256:")

                install_before_validation = await client.post(
                    f"{base_url}/installations",
                    headers={"Idempotency-Key": "skill-install-before-validation"},
                    json={
                        "packageScope": "workspace",
                        "packageId": package_id,
                        "versionId": version_1_id,
                        "expectedPackageChecksum": version_1["packageChecksum"],
                        "validationFindingHash": "sha256:" + ("0" * 64),
                        "acceptedRequiredTools": ["knowledge.search"],
                    },
                )
                assert install_before_validation.status_code == 409, install_before_validation.text
                assert install_before_validation.json()["error"] == "SKILL_VERSION_NOT_INSTALLABLE"

                validation_1_response = await client.post(
                    f"{base_url}/packages/{package_id}/versions/{version_1_id}/validations",
                    headers={"Idempotency-Key": "skill-validation-editorial-1"},
                    json={"policyVersion": 1},
                )
                assert validation_1_response.status_code == 201, validation_1_response.text
                validation_1 = validation_1_response.json()["data"]
                assert validation_1["status"] == "valid"
                assert validation_1["findings"] == []

                validation_1_replay = await client.post(
                    f"{base_url}/packages/{package_id}/versions/{version_1_id}/validations",
                    headers={"Idempotency-Key": "skill-validation-editorial-1"},
                    json={"policyVersion": 1},
                )
                assert validation_1_replay.status_code == 201, validation_1_replay.text
                assert validation_1_replay.json()["data"]["id"] == validation_1["id"]

                validation_results = await client.get(
                    f"{base_url}/packages/{package_id}/versions/{version_1_id}/validation-results",
                )
                assert validation_results.status_code == 200, validation_results.text
                assert [item["id"] for item in validation_results.json()["data"]] == [validation_1["id"]]

                repeated_validation = await client.post(
                    f"{base_url}/packages/{package_id}/versions/{version_1_id}/validations",
                    headers={"Idempotency-Key": "skill-validation-editorial-1-repeat"},
                    json={"policyVersion": 1},
                )
                assert repeated_validation.status_code == 201, repeated_validation.text
                assert repeated_validation.json()["data"]["id"] != validation_1["id"]
                assert repeated_validation.json()["data"]["findingHash"] == validation_1["findingHash"]

                unavailable_tool_install = await client.post(
                    f"{base_url}/installations",
                    headers={"Idempotency-Key": "skill-install-unavailable-tool"},
                    json={
                        "packageScope": "workspace",
                        "packageId": package_id,
                        "versionId": version_1_id,
                        "expectedPackageChecksum": version_1["packageChecksum"],
                        "validationFindingHash": validation_1["findingHash"],
                        "acceptedRequiredTools": ["knowledge.search"],
                    },
                )
                assert unavailable_tool_install.status_code == 409, unavailable_tool_install.text
                assert unavailable_tool_install.json()["error"] == "SKILL_REQUIRED_TOOL_UNAVAILABLE"

                replay = await client.post(
                    f"{base_url}/packages",
                    headers=create_headers,
                    json=payload,
                )
                assert replay.status_code == 201, replay.text
                assert replay.json()["data"]["package"]["id"] == package_id
                assert replay.json()["data"]["version"]["id"] == version_1_id

                idempotency_conflict = await client.post(
                    f"{base_url}/packages",
                    headers=create_headers,
                    json=_package_payload(instructions="Different instructions."),
                )
                assert idempotency_conflict.status_code == 409, idempotency_conflict.text
                assert idempotency_conflict.json()["error"] == "SKILL_IDEMPOTENCY_CONFLICT"

                duplicate_slug = await client.post(
                    f"{base_url}/packages",
                    headers={"Idempotency-Key": "skill-package-duplicate-slug"},
                    json=payload,
                )
                assert duplicate_slug.status_code == 409, duplicate_slug.text
                assert duplicate_slug.json()["error"] == "SKILL_SLUG_EXISTS"

                list_response = await client.get(f"{base_url}/packages")
                assert list_response.status_code == 200, list_response.text
                assert [item["id"] for item in list_response.json()["data"]["items"]] == [package_id]

                version_2_payload = {
                    "instructions": "Use cited evidence and state unresolved gaps.",
                    "semanticVersion": "1.1.0",
                    "references": [],
                    "requiredTools": [],
                    "permissions": [],
                    "dataEgress": [],
                    "capabilityTags": ["content.editorial"],
                }
                version_2_headers = {"Idempotency-Key": "skill-version-editorial-2"}
                version_2_response = await client.post(
                    f"{base_url}/packages/{package_id}/versions",
                    headers=version_2_headers,
                    json=version_2_payload,
                )
                assert version_2_response.status_code == 201, version_2_response.text
                version_2 = version_2_response.json()["data"]
                assert version_2["versionNumber"] == 2
                assert version_2["id"] != version_1_id

                validation_2_response = await client.post(
                    f"{base_url}/packages/{package_id}/versions/{version_2['id']}/validations",
                    headers={"Idempotency-Key": "skill-validation-editorial-2"},
                    json={"policyVersion": 1},
                )
                assert validation_2_response.status_code == 201, validation_2_response.text
                validation_2 = validation_2_response.json()["data"]
                assert validation_2["status"] == "valid"

                installation_headers = {"Idempotency-Key": "skill-install-editorial-v2"}
                installation_payload = {
                    "packageScope": "workspace",
                    "packageId": package_id,
                    "versionId": version_2["id"],
                    "expectedPackageChecksum": version_2["packageChecksum"],
                    "validationFindingHash": validation_2["findingHash"],
                    "acceptedRequiredTools": [],
                    "acceptedPermissions": [],
                    "acceptedDataEgress": [],
                }
                installation_response = await client.post(
                    f"{base_url}/installations",
                    headers=installation_headers,
                    json=installation_payload,
                )
                assert installation_response.status_code == 201, installation_response.text
                installation = installation_response.json()["data"]
                installation_id = installation["id"]
                assert installation["versionId"] == version_2["id"]
                assert installation["status"] == "enabled"
                assert installation["metadataRevision"] == 1

                installation_replay = await client.post(
                    f"{base_url}/installations",
                    headers=installation_headers,
                    json=installation_payload,
                )
                assert installation_replay.status_code == 201, installation_replay.text
                assert installation_replay.json()["data"]["id"] == installation_id

                installation_idempotency_conflict = await client.post(
                    f"{base_url}/installations",
                    headers=installation_headers,
                    json={
                        **installation_payload,
                        "expectedPackageChecksum": "sha256:" + ("f" * 64),
                    },
                )
                assert installation_idempotency_conflict.status_code == 409
                assert installation_idempotency_conflict.json()["error"] == "SKILL_IDEMPOTENCY_CONFLICT"

                disabled_response = await client.patch(
                    f"{base_url}/installations/{installation_id}",
                    json={"expectedRevision": 1, "enabled": False},
                )
                assert disabled_response.status_code == 200, disabled_response.text
                assert disabled_response.json()["data"]["status"] == "disabled"
                assert disabled_response.json()["data"]["metadataRevision"] == 2

                stale_installation_update = await client.patch(
                    f"{base_url}/installations/{installation_id}",
                    json={"expectedRevision": 1, "enabled": True},
                )
                assert stale_installation_update.status_code == 409, stale_installation_update.text
                assert stale_installation_update.json()["error"] == "SKILL_REVISION_CONFLICT"

                installations_response = await client.get(f"{base_url}/installations")
                assert installations_response.status_code == 200, installations_response.text
                assert [item["id"] for item in installations_response.json()["data"]["items"]] == [installation_id]

                version_2_replay = await client.post(
                    f"{base_url}/packages/{package_id}/versions",
                    headers=version_2_headers,
                    json=version_2_payload,
                )
                assert version_2_replay.status_code == 201, version_2_replay.text
                assert version_2_replay.json()["data"]["id"] == version_2["id"]

                versions_response = await client.get(
                    f"{base_url}/packages/{package_id}/versions",
                )
                assert versions_response.status_code == 200, versions_response.text
                assert [item["versionNumber"] for item in versions_response.json()["data"]["items"]] == [2, 1]

                immutable_v1 = await client.get(
                    f"{base_url}/packages/{package_id}/versions/{version_1_id}",
                )
                assert immutable_v1.status_code == 200, immutable_v1.text
                immutable_v1_resources = {
                    resource["path"]: resource for resource in immutable_v1.json()["data"]["resources"]
                }
                assert immutable_v1_resources["SKILL.md"]["content"] == ("Use cited workspace evidence only.")

                cross_workspace = await client.get(
                    f"/api/v1/workspaces/{other_workspace_id}/skills/packages/{package_id}",
                )
                assert cross_workspace.status_code == 404, cross_workspace.text
                assert cross_workspace.json()["error"] == "SKILL_NOT_FOUND"

                package_activity_count = await AuditEvent.filter(
                    workspace_id=workspace.id,
                    event_name="workspace.skill.package.created",
                ).count()
                version_activity_count = await AuditEvent.filter(
                    workspace_id=workspace.id,
                    event_name="workspace.skill.version.created",
                ).count()
                assert package_activity_count == 1
                assert version_activity_count == 1
                validation_activity_count = await AuditEvent.filter(
                    workspace_id=workspace.id,
                    event_name="workspace.skill.version.validated",
                ).count()
                installation_activity_count = await AuditEvent.filter(
                    workspace_id=workspace.id,
                    event_name="workspace.skill.installed",
                ).count()
                installation_update_activity_count = await AuditEvent.filter(
                    workspace_id=workspace.id,
                    event_name="workspace.skill.installation.updated",
                ).count()
                assert validation_activity_count == 3
                assert installation_activity_count == 1
                assert installation_update_activity_count == 1
        finally:
            app.dependency_overrides.clear()


async def test_workspace_skill_github_import_refresh_and_failure_are_durable_and_tenant_safe(
    prepared_db,
) -> None:
    _ = prepared_db
    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)
        owner = await _user()
        workspace = await _workspace(owner=owner)
        other_workspace = await _workspace_in_organization(
            owner=owner,
            organization_id=workspace.organization_id,
            label="github-other",
        )

        async def _get_user() -> User:
            return owner

        async def _get_user_id() -> UUID:
            return owner.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id
        workspace_id = encode_uuid(workspace.id)
        other_workspace_id = encode_uuid(other_workspace.id)
        base_url = f"/api/v1/workspaces/{workspace_id}/skills"
        payload = {
            "repositoryUrl": "https://github.com/Acme/Site-Planner.git",
            "requestedRef": "main",
            "subpath": "skills/site-planner",
            "slug": "site-planner",
            "displayName": "Site Planner",
            "description": "Plans a reviewable sitemap and wireframe.",
        }

        try:
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                missing_key = await client.post(f"{base_url}/imports", json=payload)
                assert missing_key.status_code == 422, missing_key.text

                created = await client.post(
                    f"{base_url}/imports",
                    headers={"Idempotency-Key": "github-site-planner-initial"},
                    json=payload,
                )
                assert created.status_code == 202, created.text
                accepted = created.json()["data"]
                assert accepted["operation"] == "initial"
                assert accepted["status"] == "queued"
                import_id = accepted["importId"]
                job_id = decode_public_id(accepted["jobId"])

                replay = await client.post(
                    f"{base_url}/imports",
                    headers={"Idempotency-Key": "github-site-planner-initial"},
                    json=payload,
                )
                assert replay.status_code == 202, replay.text
                assert replay.json()["data"] == accepted

                conflict = await client.post(
                    f"{base_url}/imports",
                    headers={"Idempotency-Key": "github-site-planner-initial"},
                    json={**payload, "requestedRef": "release"},
                )
                assert conflict.status_code == 409, conflict.text
                assert conflict.json()["error"] == "SKILL_IDEMPOTENCY_CONFLICT"

                queued = await client.get(f"{base_url}/imports/{import_id}")
                assert queued.status_code == 200, queued.text
                assert queued.json()["data"]["status"] == "queued"
                cross_workspace = await client.get(
                    f"/api/v1/workspaces/{other_workspace_id}/skills/imports/{import_id}"
                )
                assert cross_workspace.status_code == 404, cross_workspace.text

                initial_job = await BackgroundJobRecord.get(id=job_id)
                initial_dispatch = await JobDispatchOutboxRecord.get(job_id=job_id)
                assert initial_job.job_type == "skill.github.import"
                assert str(initial_job.workload_class) == "connector"
                assert initial_job.workspace_id == workspace.id
                assert initial_job.actor_user_id == owner.id
                assert initial_job.input_reference is not None
                assert initial_job.input_reference["repositoryUrl"] == "https://github.com/acme/site-planner"
                assert "token" not in initial_job.input_reference
                assert "resources" not in initial_job.input_reference
                assert initial_dispatch.task_name == "jobs:connector:skill-github-import:v1"

                fetcher = _DeterministicSkillGitHubFetcher([
                    _github_snapshot(
                        revision="3",
                        instructions="# Site Planner\n\nCreate a sitemap before the wireframe.\n",
                    )
                ])
                initial_outcome = await _execute_skill_github_job(job_id=job_id, fetcher=fetcher)
                assert initial_outcome.terminal is not None
                assert initial_outcome.terminal.internal_status == JobInternalStatus.SUCCEEDED
                initial_result = (await BackgroundJobRecord.get(id=job_id)).result_reference
                assert initial_result is not None
                assert initial_result["status"] == "candidate"
                package_id = initial_result["packageId"]
                version_1_id = initial_result["versionId"]

                succeeded = await client.get(f"{base_url}/imports/{import_id}")
                assert succeeded.status_code == 200, succeeded.text
                assert succeeded.json()["data"]["status"] == "succeeded"
                assert succeeded.json()["data"]["packageId"] == package_id
                package_response = await client.get(f"{base_url}/packages/{package_id}")
                assert package_response.status_code == 200, package_response.text
                package = package_response.json()["data"]
                assert package["sourceKind"] == "github"
                assert package["trustLevel"] == "imported_unverified"
                assert package["versionCount"] == 1
                assert package["latestValidVersionId"] is None
                assert package["latestVersion"]["id"] == version_1_id
                assert package["latestVersion"]["status"] == "candidate"

                refresh = await client.post(
                    f"{base_url}/packages/{package_id}/refreshes",
                    headers={"Idempotency-Key": "github-site-planner-refresh-1"},
                )
                assert refresh.status_code == 202, refresh.text
                refresh_accepted = refresh.json()["data"]
                assert refresh_accepted["operation"] == "refresh"
                refresh_job_id = decode_public_id(refresh_accepted["jobId"])
                refresh_fetcher = _DeterministicSkillGitHubFetcher([
                    _github_snapshot(
                        revision="4",
                        instructions="# Site Planner\n\nCreate a sitemap, wireframe, and review checklist.\n",
                    )
                ])
                refresh_outcome = await _execute_skill_github_job(
                    job_id=refresh_job_id,
                    fetcher=refresh_fetcher,
                )
                assert refresh_outcome.terminal is not None
                assert refresh_outcome.terminal.internal_status == JobInternalStatus.SUCCEEDED
                refresh_result = (await BackgroundJobRecord.get(id=refresh_job_id)).result_reference
                assert refresh_result is not None
                assert refresh_result["packageId"] == package_id
                assert refresh_result["versionId"] != version_1_id
                refreshed_package = (await client.get(f"{base_url}/packages/{package_id}")).json()["data"]
                assert refreshed_package["versionCount"] == 2
                assert refreshed_package["latestVersion"]["versionNumber"] == 2
                assert refreshed_package["latestValidVersionId"] is None

                failed_refresh = await client.post(
                    f"{base_url}/packages/{package_id}/refreshes",
                    headers={"Idempotency-Key": "github-site-planner-refresh-failed"},
                )
                assert failed_refresh.status_code == 202, failed_refresh.text
                failed_job_id = decode_public_id(failed_refresh.json()["data"]["jobId"])
                failed_fetcher = _DeterministicSkillGitHubFetcher([
                    GitHubSourceError(
                        code=SKILL_GITHUB_SOURCE_INVALID,
                        safe_message="GitHub Skill package no longer contains SKILL.md",
                        transient=False,
                    )
                ])
                failed_outcome = await _execute_skill_github_job(
                    job_id=failed_job_id,
                    fetcher=failed_fetcher,
                )
                assert failed_outcome.terminal is not None
                assert failed_outcome.terminal.internal_status == JobInternalStatus.FAILED
                failed_import_id = failed_refresh.json()["data"]["importId"]
                failed_state = await client.get(f"{base_url}/imports/{failed_import_id}")
                assert failed_state.status_code == 200, failed_state.text
                assert failed_state.json()["data"]["status"] == "failed"
                assert failed_state.json()["data"]["safeErrorCode"] == SKILL_GITHUB_SOURCE_INVALID
                preserved_package = (await client.get(f"{base_url}/packages/{package_id}")).json()["data"]
                assert preserved_package["versionCount"] == 2
                assert preserved_package["latestVersion"]["versionNumber"] == 2

                context = await bind_workspace_tenant_context(
                    workspace_id=workspace.id,
                    organization_id=workspace.organization_id,
                )
                repository = WorkspaceSkillsRepository(context)
                async with repository.connection() as conn:
                    assert await SkillGitHubImportRecord.filter(workspace_id=workspace.id).using_db(conn).count() == 3
                    assert await SkillPackageRecord.filter(workspace_id=workspace.id).using_db(conn).count() == 1
                    assert not await SkillInstallationRecord.filter(workspace_id=workspace.id).using_db(conn).exists()

                assert (
                    await AuditEvent.filter(
                        workspace_id=workspace.id,
                        event_name="workspace.skill.github.import.requested",
                    ).count()
                    == 3
                )
                assert (
                    await AuditEvent.filter(
                        workspace_id=workspace.id,
                        event_name="workspace.skill.github.import.succeeded",
                    ).count()
                    == 2
                )
        finally:
            app.dependency_overrides.clear()


async def test_workspace_skill_update_preview_and_atomic_repin_are_exact_and_idempotent(
    prepared_db,
) -> None:
    _ = prepared_db
    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)
        owner = await _user()
        workspace = await _workspace(owner=owner)

        async def _get_user() -> User:
            return owner

        async def _get_user_id() -> UUID:
            return owner.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id
        base_url = f"/api/v1/workspaces/{encode_uuid(workspace.id)}/skills"
        try:
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                created_response = await client.post(
                    f"{base_url}/packages",
                    headers={"Idempotency-Key": "skill-update-package"},
                    json={
                        **_package_payload(),
                        "requiredTools": [
                            {
                                "toolId": "human.request_input",
                                "versionRange": ">=1",
                                "intendedUse": "Ask for explicit review input.",
                            }
                        ],
                    },
                )
                assert created_response.status_code == 201, created_response.text
                created = created_response.json()["data"]
                package_id = created["package"]["id"]
                version_1 = created["version"]
                validation_1_response = await client.post(
                    f"{base_url}/packages/{package_id}/versions/{version_1['id']}/validations",
                    headers={"Idempotency-Key": "skill-update-validation-v1"},
                    json={"policyVersion": 1},
                )
                assert validation_1_response.status_code == 201, validation_1_response.text
                validation_1 = validation_1_response.json()["data"]
                install_response = await client.post(
                    f"{base_url}/installations",
                    headers={"Idempotency-Key": "skill-update-install-v1"},
                    json={
                        "packageScope": "workspace",
                        "packageId": package_id,
                        "versionId": version_1["id"],
                        "expectedPackageChecksum": version_1["packageChecksum"],
                        "validationFindingHash": validation_1["findingHash"],
                        "acceptedRequiredTools": ["human.request_input"],
                        "acceptedPermissions": [],
                        "acceptedDataEgress": [],
                    },
                )
                assert install_response.status_code == 201, install_response.text
                installation = install_response.json()["data"]

                version_2_response = await client.post(
                    f"{base_url}/packages/{package_id}/versions",
                    headers={"Idempotency-Key": "skill-update-version-v2"},
                    json={
                        "instructions": "Use cited evidence, then publish approved updates.",
                        "semanticVersion": "2.0.0",
                        "references": [],
                        "requiredTools": [
                            {
                                "toolId": "human.request_input",
                                "versionRange": ">=1",
                                "intendedUse": "Ask for explicit review input.",
                            }
                        ],
                        "permissions": [
                            {
                                "action": "content:manage",
                                "purpose": "Publish an explicitly approved update.",
                            }
                        ],
                        "dataEgress": [
                            {
                                "destination": "analytics.example.com",
                                "purpose": "Send aggregate publishing metrics.",
                                "dataClasses": ["aggregate.metrics"],
                            }
                        ],
                        "capabilityTags": ["content.editorial", "content.publish"],
                    },
                )
                assert version_2_response.status_code == 201, version_2_response.text
                version_2 = version_2_response.json()["data"]
                validation_2_response = await client.post(
                    f"{base_url}/packages/{package_id}/versions/{version_2['id']}/validations",
                    headers={"Idempotency-Key": "skill-update-validation-v2"},
                    json={"policyVersion": 1},
                )
                assert validation_2_response.status_code == 201, validation_2_response.text
                validation_2 = validation_2_response.json()["data"]

                preview_payload = {
                    "candidateVersionId": version_2["id"],
                    "expectedRevision": 1,
                    "currentVersionId": version_1["id"],
                    "currentPackageChecksum": version_1["packageChecksum"],
                    "currentValidationFindingHash": validation_1["findingHash"],
                }
                preview_response = await client.post(
                    f"{base_url}/installations/{installation['id']}/update-previews",
                    headers={"Idempotency-Key": "skill-update-preview-v2"},
                    json=preview_payload,
                )
                assert preview_response.status_code == 201, preview_response.text
                preview = preview_response.json()["data"]
                assert preview["risk"] == "data_egress"
                assert preview["riskCategories"] == [
                    "content",
                    "capability",
                    "permission",
                    "data_egress",
                ]
                assert preview["diff"]["instructionsChanged"] is True
                assert preview["diff"]["permissionChanges"][0]["action"] == "content:manage"
                assert preview["diff"]["dataEgressChanges"][0]["destination"] == "analytics.example.com"
                unchanged = (await client.get(f"{base_url}/installations/{installation['id']}")).json()["data"]
                assert unchanged["versionId"] == version_1["id"]
                assert unchanged["metadataRevision"] == 1

                preview_replay = await client.post(
                    f"{base_url}/installations/{installation['id']}/update-previews",
                    headers={"Idempotency-Key": "skill-update-preview-v2"},
                    json=preview_payload,
                )
                assert preview_replay.status_code == 201, preview_replay.text
                assert preview_replay.json()["data"] == preview
                preview_key_conflict = await client.post(
                    f"{base_url}/installations/{installation['id']}/update-previews",
                    headers={"Idempotency-Key": "skill-update-preview-v2"},
                    json={**preview_payload, "expectedRevision": 2},
                )
                assert preview_key_conflict.status_code == 409, preview_key_conflict.text
                assert preview_key_conflict.json()["error"] == "SKILL_IDEMPOTENCY_CONFLICT"

                repin_payload = {
                    "previewId": preview["id"],
                    "previewHash": preview["previewHash"],
                    "expectedRevision": 1,
                    "currentVersionId": version_1["id"],
                    "currentPackageChecksum": version_1["packageChecksum"],
                    "currentValidationFindingHash": validation_1["findingHash"],
                    "candidateVersionId": version_2["id"],
                    "candidatePackageChecksum": version_2["packageChecksum"],
                    "candidateValidationFindingHash": validation_2["findingHash"],
                    "acceptedRequiredTools": ["human.request_input"],
                    "acceptedPermissions": ["content:manage"],
                    "acceptedDataEgress": ["analytics.example.com"],
                }
                rejected_repin = await client.post(
                    f"{base_url}/installations/{installation['id']}/updates",
                    headers={"Idempotency-Key": "skill-update-accept-missing-review"},
                    json={**repin_payload, "acceptedPermissions": []},
                )
                assert rejected_repin.status_code == 409, rejected_repin.text
                assert rejected_repin.json()["error"] == "SKILL_DECLARATION_ACCEPTANCE_REQUIRED"
                after_rejection = (await client.get(f"{base_url}/installations/{installation['id']}")).json()["data"]
                assert after_rejection["versionId"] == version_1["id"]
                assert after_rejection["metadataRevision"] == 1

                repin_response = await client.post(
                    f"{base_url}/installations/{installation['id']}/updates",
                    headers={"Idempotency-Key": "skill-update-accept-v2"},
                    json=repin_payload,
                )
                assert repin_response.status_code == 200, repin_response.text
                repin = repin_response.json()["data"]
                assert repin["previewId"] == preview["id"]
                assert repin["installation"]["versionId"] == version_2["id"]
                assert repin["installation"]["metadataRevision"] == 2
                assert repin["installation"]["acceptedPermissions"] == ["content:manage"]

                disabled_response = await client.patch(
                    f"{base_url}/installations/{installation['id']}",
                    json={"expectedRevision": 2, "enabled": False},
                )
                assert disabled_response.status_code == 200, disabled_response.text
                assert disabled_response.json()["data"]["metadataRevision"] == 3
                repin_replay = await client.post(
                    f"{base_url}/installations/{installation['id']}/updates",
                    headers={"Idempotency-Key": "skill-update-accept-v2"},
                    json=repin_payload,
                )
                assert repin_replay.status_code == 200, repin_replay.text
                assert repin_replay.json()["data"] == repin

                stale_preview_response = await client.post(
                    f"{base_url}/installations/{installation['id']}/update-previews",
                    headers={"Idempotency-Key": "skill-update-preview-downgrade"},
                    json={
                        "candidateVersionId": version_1["id"],
                        "expectedRevision": 3,
                        "currentVersionId": version_2["id"],
                        "currentPackageChecksum": version_2["packageChecksum"],
                        "currentValidationFindingHash": validation_2["findingHash"],
                    },
                )
                assert stale_preview_response.status_code == 201, stale_preview_response.text
                stale_preview = stale_preview_response.json()["data"]
                enabled_response = await client.patch(
                    f"{base_url}/installations/{installation['id']}",
                    json={"expectedRevision": 3, "enabled": True},
                )
                assert enabled_response.status_code == 200, enabled_response.text
                assert enabled_response.json()["data"]["metadataRevision"] == 4
                stale_accept = await client.post(
                    f"{base_url}/installations/{installation['id']}/updates",
                    headers={"Idempotency-Key": "skill-update-accept-downgrade"},
                    json={
                        "previewId": stale_preview["id"],
                        "previewHash": stale_preview["previewHash"],
                        "expectedRevision": 3,
                        "currentVersionId": version_2["id"],
                        "currentPackageChecksum": version_2["packageChecksum"],
                        "currentValidationFindingHash": validation_2["findingHash"],
                        "candidateVersionId": version_1["id"],
                        "candidatePackageChecksum": version_1["packageChecksum"],
                        "candidateValidationFindingHash": validation_1["findingHash"],
                        "acceptedRequiredTools": ["human.request_input"],
                        "acceptedPermissions": [],
                        "acceptedDataEgress": [],
                    },
                )
                assert stale_accept.status_code == 409, stale_accept.text
                assert stale_accept.json()["error"] == "SKILL_REVISION_CONFLICT"
                preserved = (await client.get(f"{base_url}/installations/{installation['id']}")).json()["data"]
                assert preserved["versionId"] == version_2["id"]
                assert preserved["metadataRevision"] == 4

                assert (
                    await AuditEvent.filter(
                        workspace_id=workspace.id,
                        event_name="workspace.skill.update.previewed",
                    ).count()
                    == 2
                )
                assert (
                    await AuditEvent.filter(
                        workspace_id=workspace.id,
                        event_name="workspace.skill.installation.repinned",
                    ).count()
                    == 1
                )
        finally:
            app.dependency_overrides.clear()


async def test_workspace_skills_required_audit_failure_rolls_back_package_and_version(
    prepared_db,
) -> None:
    _ = prepared_db
    owner = await _user()
    workspace = await _workspace(owner=owner)
    context = await bind_workspace_tenant_context(
        workspace_id=workspace.id,
        organization_id=workspace.organization_id,
    )

    async def _fail_audit(**_kwargs):
        raise RuntimeError("audit unavailable")

    repository = WorkspaceSkillsRepository(context)
    service = WorkspaceSkillsService(
        repository=repository,
        activity_writer=_fail_audit,
    )
    with pytest.raises(RuntimeError, match="audit unavailable"):
        await service.create_package(
            workspace_id=workspace.id,
            organization_id=workspace.organization_id,
            actor_user_id=owner.id,
            idempotency_key="skill-package-audit-rollback",
            payload=SkillPackageCreateRequest.model_validate(_package_payload()),
        )

    async with repository.connection() as conn:
        assert not await SkillPackageRecord.filter(workspace_id=workspace.id).using_db(conn).exists()


async def test_official_skill_catalog_is_public_exact_and_tenant_installable(prepared_db) -> None:
    _ = prepared_db
    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        owner = await _user()
        workspace = await _workspace(owner=owner)
        other_workspace = await _workspace_in_organization(
            owner=owner,
            organization_id=workspace.organization_id,
            label="official-other",
        )

        async def _get_user() -> User:
            return owner

        async def _get_user_id() -> UUID:
            return owner.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id
        workspace_id = encode_uuid(workspace.id)
        other_workspace_id = encode_uuid(other_workspace.id)
        base_url = f"/api/v1/workspaces/{workspace_id}/skills"
        try:
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                catalog_response = await client.get(f"{base_url}/catalog")
                assert catalog_response.status_code == 200, catalog_response.text
                catalog = catalog_response.json()["data"]["items"]
                assert len(catalog) == 5
                assert all(item["packageScope"] == "system" for item in catalog)
                assert all(item["publisherVerified"] is True for item in catalog)
                assert all(item["validationStatus"] == "valid" for item in catalog)
                assert all(item["installed"] is False for item in catalog)

                sitemap = next(item for item in catalog if item["slug"] == "sitemap-planning")
                search_response = await client.get(f"{base_url}/catalog", params={"q": "sitemap"})
                assert search_response.status_code == 200, search_response.text
                assert [item["packageId"] for item in search_response.json()["data"]["items"]] == [sitemap["packageId"]]

                detail_response = await client.get(f"{base_url}/catalog/{sitemap['packageId']}")
                assert detail_response.status_code == 200, detail_response.text
                detail = detail_response.json()["data"]
                assert detail["versionId"] == sitemap["versionId"]
                assert detail["manifest"]["checksum"] == sitemap["packageChecksum"]
                assert detail["validation"]["findingHash"] == sitemap["validationFindingHash"]
                assert detail["resources"][0]["path"] == "SKILL.md"
                assert detail["resources"][0]["content"].startswith("# Sitemap Planning")

                install_response = await client.post(
                    f"{base_url}/installations",
                    headers={"Idempotency-Key": "official-sitemap-install"},
                    json={
                        "packageScope": "system",
                        "packageId": sitemap["packageId"],
                        "versionId": sitemap["versionId"],
                        "expectedPackageChecksum": sitemap["packageChecksum"],
                        "validationFindingHash": sitemap["validationFindingHash"],
                        "acceptedRequiredTools": [],
                        "acceptedPermissions": [],
                        "acceptedDataEgress": [],
                    },
                )
                assert install_response.status_code == 201, install_response.text
                installation = install_response.json()["data"]
                assert installation["packageScope"] == "system"
                assert installation["versionId"] == sitemap["versionId"]

                refreshed = await client.get(f"{base_url}/catalog/{sitemap['packageId']}")
                assert refreshed.status_code == 200, refreshed.text
                assert refreshed.json()["data"]["installed"] is True
                assert refreshed.json()["data"]["installationId"] == installation["id"]

                disabled = await client.patch(
                    f"{base_url}/installations/{installation['id']}",
                    json={"expectedRevision": 1, "enabled": False},
                )
                assert disabled.status_code == 200, disabled.text
                assert disabled.json()["data"]["status"] == "disabled"
                reenabled = await client.patch(
                    f"{base_url}/installations/{installation['id']}",
                    json={"expectedRevision": 2, "enabled": True},
                )
                assert reenabled.status_code == 200, reenabled.text
                assert reenabled.json()["data"]["status"] == "enabled"
                assert reenabled.json()["data"]["metadataRevision"] == 3

                other_catalog = await client.get(
                    f"/api/v1/workspaces/{other_workspace_id}/skills/catalog/{sitemap['packageId']}"
                )
                assert other_catalog.status_code == 200, other_catalog.text
                assert other_catalog.json()["data"]["installed"] is False

                context = await bind_workspace_tenant_context(
                    workspace_id=workspace.id,
                    organization_id=workspace.organization_id,
                )
                tenant_repository = WorkspaceSkillsRepository(context)
                async with tenant_repository.connection() as tenant_conn:
                    persisted_installation = (
                        await SkillInstallationRecord
                        .filter(id=decode_public_id(installation["id"]))
                        .using_db(tenant_conn)
                        .first()
                    )
                    assert persisted_installation is not None
                    assert str(persisted_installation.package_scope) == "system"
                    assert not await SkillPackageRecord.filter(workspace_id=None).using_db(tenant_conn).exists()

                sync_result = await OfficialSkillCatalogSyncService(
                    repository=OfficialSkillCatalogRepository(),
                    source=PackagedOfficialSkillCatalogSource(),
                    supported_tool_ids=frozenset(SUPPORTED_TOOL_GRANTS),
                    settings=settings,
                ).sync()
                assert sync_result.packages_created == 0
                assert sync_result.versions_created == 0
                assert sync_result.packages_archived == 0
        finally:
            app.dependency_overrides.clear()


async def test_workspace_skill_uninstall_reports_agent_and_run_impact_then_replays_exact_removal(
    prepared_db,
) -> None:
    _ = prepared_db
    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)
        owner = await _user()
        workspace = await _workspace(owner=owner)

        async def _get_user() -> User:
            return owner

        async def _get_user_id() -> UUID:
            return owner.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id
        base_url = f"/api/v1/workspaces/{encode_uuid(workspace.id)}/skills"
        definition: AgentDefinitionRecord | None = None
        thread: AgentThreadV1Record | None = None
        try:
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                created_response = await client.post(
                    f"{base_url}/packages",
                    headers={"Idempotency-Key": "skill-uninstall-package"},
                    json={**_package_payload(), "requiredTools": []},
                )
                assert created_response.status_code == 201, created_response.text
                created = created_response.json()["data"]
                package_id = created["package"]["id"]
                version = created["version"]
                validation_response = await client.post(
                    f"{base_url}/packages/{package_id}/versions/{version['id']}/validations",
                    headers={"Idempotency-Key": "skill-uninstall-validation"},
                    json={"policyVersion": 1},
                )
                assert validation_response.status_code == 201, validation_response.text
                validation = validation_response.json()["data"]
                installation_response = await client.post(
                    f"{base_url}/installations",
                    headers={"Idempotency-Key": "skill-uninstall-installation"},
                    json={
                        "packageScope": "workspace",
                        "packageId": package_id,
                        "versionId": version["id"],
                        "expectedPackageChecksum": version["packageChecksum"],
                        "validationFindingHash": validation["findingHash"],
                        "acceptedRequiredTools": [],
                        "acceptedPermissions": [],
                        "acceptedDataEgress": [],
                    },
                )
                assert installation_response.status_code == 201, installation_response.text
                installation = installation_response.json()["data"]
                installation_uuid = decode_public_id(installation["id"])

                definition = await AgentDefinitionRecord.create(
                    stable_key=f"system:test-skill-impact:{uuid4()}",
                    scope=AgentDefinitionScope.SYSTEM,
                    slug=f"skill-impact-{uuid4().hex[:10]}",
                    display_name="Skill impact Agent",
                    role="test",
                    description="Exercises Skill uninstall impact.",
                    lifecycle_state=AgentLifecycleState.ACTIVE,
                    is_official=False,
                    created_by_user_id=owner.id,
                )
                agent_version = await AgentVersionRecord.create(
                    definition_id=definition.id,
                    version_number=1,
                    state=AgentVersionState.PUBLISHED,
                    instructions="Use one exact Skill.",
                    model_policy={},
                    supported_execution_modes=["plan"],
                    tool_grants=[],
                    skill_grant_workspace_id=workspace.id,
                    skill_installation_ids=[str(installation_uuid)],
                    knowledge_base_ids=[],
                    delegation_definition_ids=[],
                    approval_profile={},
                    compatibility={},
                    provenance={"kind": "test"},
                    content_checksum="0" * 64,
                    published_at=datetime.now(UTC),
                    created_by_user_id=owner.id,
                )
                assignment = await AgentAssignmentRecord.create(
                    workspace_id=workspace.id,
                    definition_id=definition.id,
                    version_id=agent_version.id,
                    assignment_key=f"workspace:{workspace.id}:skill-impact",
                    enabled=True,
                    is_default=True,
                    is_pinned=False,
                    sort_order=0,
                    assigned_by_user_id=owner.id,
                )
                thread = await AgentThreadV1Record.create(
                    workspace_id=workspace.id,
                    owner_user_id=owner.id,
                    creation_idempotency_key=f"skill-impact-thread-{uuid4()}",
                    lead_agent_id=str(definition.id),
                    lead_agent_version_id=agent_version.id,
                    lead_agent_assignment_id=assignment.id,
                    title="Skill impact",
                )
                run = await AgentRunV1Record.create(
                    workspace_id=workspace.id,
                    thread_id=thread.id,
                    owner_user_id=owner.id,
                    idempotency_key=f"skill-impact-run-{uuid4()}",
                    execution_mode=AgentExecutionModeV1.PLAN,
                    lead_agent_id=str(definition.id),
                    lead_agent_version_id=agent_version.id,
                    lead_agent_assignment_id=assignment.id,
                    status=AgentRunStatusV1.COMPLETED,
                    correlation_id=f"skill-impact-{uuid4()}",
                    terminal_at=datetime.now(UTC),
                )
                await AgentRunSkillSnapshotV1Record.create(
                    run_id=run.id,
                    agent_assignment_id=assignment.id,
                    agent_version_id=agent_version.id,
                    agent_order=0,
                    skill_order=0,
                    installation_id=installation_uuid,
                    package_scope="workspace",
                    package_id=decode_public_id(package_id),
                    skill_version_id=decode_public_id(version["id"]),
                    package_checksum=version["packageChecksum"],
                    validation_policy_version=1,
                    validation_finding_hash=validation["findingHash"],
                    context_byte_size=1,
                )

                impact_response = await client.get(f"{base_url}/installations/{installation['id']}/impact")
                assert impact_response.status_code == 200, impact_response.text
                impact = impact_response.json()["data"]
                assert impact == {
                    "installationId": installation["id"],
                    "metadataRevision": 1,
                    "status": "enabled",
                    "agentVersionCount": 1,
                    "publishedAgentVersionCount": 1,
                    "assignmentCount": 1,
                    "enabledAssignmentCount": 1,
                    "retainedRunCount": 1,
                    "blockers": ["agent_versions", "assignments", "retained_runs"],
                    "canRemove": False,
                }
                blocked_removal = await client.delete(
                    f"{base_url}/installations/{installation['id']}",
                    params={"expectedRevision": 1},
                    headers={"Idempotency-Key": "skill-uninstall-blocked"},
                )
                assert blocked_removal.status_code == 409, blocked_removal.text
                assert blocked_removal.json()["error"] == "SKILL_DELETE_BLOCKED"
                assert blocked_removal.json()["meta"]["retainedRunCount"] == 1

                await run.delete()
                await thread.delete()
                thread = None
                await assignment.delete()
                await agent_version.delete()
                await definition.delete()
                definition = None

                removable_response = await client.get(f"{base_url}/installations/{installation['id']}/impact")
                assert removable_response.status_code == 200, removable_response.text
                assert removable_response.json()["data"]["canRemove"] is True
                removal_response = await client.delete(
                    f"{base_url}/installations/{installation['id']}",
                    params={"expectedRevision": 1},
                    headers={"Idempotency-Key": "skill-uninstall-success"},
                )
                assert removal_response.status_code == 200, removal_response.text
                removal = removal_response.json()["data"]
                assert removal["installationId"] == installation["id"]
                assert removal["removed"] is True
                assert removal["impact"]["canRemove"] is True
                removal_replay = await client.delete(
                    f"{base_url}/installations/{installation['id']}",
                    params={"expectedRevision": 1},
                    headers={"Idempotency-Key": "skill-uninstall-success"},
                )
                assert removal_replay.status_code == 200, removal_replay.text
                assert removal_replay.json()["data"] == removal
                missing = await client.get(f"{base_url}/installations/{installation['id']}")
                assert missing.status_code == 404, missing.text
                assert (
                    await AuditEvent.filter(
                        workspace_id=workspace.id,
                        event_name="workspace.skill.uninstalled",
                        entity_id=installation_uuid,
                    ).count()
                    == 1
                )
        finally:
            if thread is not None:
                await thread.delete()
            if definition is not None:
                await definition.delete()
            app.dependency_overrides.clear()


async def test_workspace_skill_package_archive_is_impact_reviewed_read_only_and_idempotent(
    prepared_db,
) -> None:
    _ = prepared_db
    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)
        owner = await _user()
        workspace = await _workspace(owner=owner)

        async def _get_user() -> User:
            return owner

        async def _get_user_id() -> UUID:
            return owner.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id
        base_url = f"/api/v1/workspaces/{encode_uuid(workspace.id)}/skills"
        try:
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                created_response = await client.post(
                    f"{base_url}/packages",
                    headers={"Idempotency-Key": "skill-package-archive-create"},
                    json={**_package_payload(), "requiredTools": []},
                )
                assert created_response.status_code == 201, created_response.text
                created = created_response.json()["data"]
                package = created["package"]
                version = created["version"]
                package_uuid = decode_public_id(package["id"])

                context = await bind_workspace_tenant_context(
                    workspace_id=workspace.id,
                    organization_id=workspace.organization_id,
                )
                repository = WorkspaceSkillsRepository(context)
                async with repository.connection() as conn:
                    active_refresh = await SkillGitHubImportRecord.create(
                        using_db=conn,
                        workspace_id=workspace.id,
                        package_id=package_uuid,
                        operation="refresh",
                        status="queued",
                        repository_url="https://github.com/acme/site-planner",
                        requested_ref="main",
                        subpath="skills/site-planner",
                        request_revision=f"sha256:{'e' * 64}",
                        actor_user_id=owner.id,
                        request_idempotency_key="skill-package-archive-active-refresh",
                        request_fingerprint="f" * 64,
                    )

                active_impact_response = await client.get(f"{base_url}/packages/{package['id']}/impact")
                assert active_impact_response.status_code == 200, active_impact_response.text
                active_impact = active_impact_response.json()["data"]
                assert active_impact["versionCount"] == 1
                assert active_impact["resourceCount"] == 2
                assert active_impact["validationCount"] == 0
                assert active_impact["activeGithubOperationCount"] == 1
                assert active_impact["blockers"] == ["active_github_operations"]
                assert active_impact["canArchive"] is False
                blocked_refresh_archive = await client.delete(
                    f"{base_url}/packages/{package['id']}",
                    params={"expectedRevision": package["metadataRevision"]},
                    headers={"Idempotency-Key": "skill-package-archive-blocked-refresh"},
                )
                assert blocked_refresh_archive.status_code == 409, blocked_refresh_archive.text
                assert blocked_refresh_archive.json()["error"] == "SKILL_DELETE_BLOCKED"

                async with repository.connection() as conn:
                    active_refresh.status = "failed"
                    await active_refresh.save(using_db=conn, update_fields=("status", "updated_at"))

                validation_response = await client.post(
                    f"{base_url}/packages/{package['id']}/versions/{version['id']}/validations",
                    headers={"Idempotency-Key": "skill-package-archive-validation"},
                    json={"policyVersion": 1},
                )
                assert validation_response.status_code == 201, validation_response.text
                validation = validation_response.json()["data"]
                installation_response = await client.post(
                    f"{base_url}/installations",
                    headers={"Idempotency-Key": "skill-package-archive-installation"},
                    json={
                        "packageScope": "workspace",
                        "packageId": package["id"],
                        "versionId": version["id"],
                        "expectedPackageChecksum": version["packageChecksum"],
                        "validationFindingHash": validation["findingHash"],
                        "acceptedRequiredTools": [],
                        "acceptedPermissions": [],
                        "acceptedDataEgress": [],
                    },
                )
                assert installation_response.status_code == 201, installation_response.text
                installation = installation_response.json()["data"]

                installation_impact_response = await client.get(f"{base_url}/packages/{package['id']}/impact")
                assert installation_impact_response.status_code == 200, installation_impact_response.text
                installation_impact = installation_impact_response.json()["data"]
                assert installation_impact["validationCount"] == 1
                assert installation_impact["installationCount"] == 1
                assert installation_impact["enabledInstallationCount"] == 1
                assert installation_impact["blockers"] == ["installations"]
                blocked_installation_archive = await client.delete(
                    f"{base_url}/packages/{package['id']}",
                    params={"expectedRevision": installation_impact["metadataRevision"]},
                    headers={"Idempotency-Key": "skill-package-archive-blocked-installation"},
                )
                assert blocked_installation_archive.status_code == 409
                assert blocked_installation_archive.json()["meta"]["installationCount"] == 1

                removal_response = await client.delete(
                    f"{base_url}/installations/{installation['id']}",
                    params={"expectedRevision": installation["metadataRevision"]},
                    headers={"Idempotency-Key": "skill-package-archive-remove-installation"},
                )
                assert removal_response.status_code == 200, removal_response.text

                removable_response = await client.get(f"{base_url}/packages/{package['id']}/impact")
                assert removable_response.status_code == 200, removable_response.text
                removable = removable_response.json()["data"]
                assert removable["canArchive"] is True
                assert removable["blockers"] == []

                archive_response = await client.delete(
                    f"{base_url}/packages/{package['id']}",
                    params={"expectedRevision": removable["metadataRevision"]},
                    headers={"Idempotency-Key": "skill-package-archive-success"},
                )
                assert archive_response.status_code == 200, archive_response.text
                archived = archive_response.json()["data"]
                assert archived["packageId"] == package["id"]
                assert archived["archived"] is True
                assert archived["status"] == "archived"
                assert archived["metadataRevision"] == removable["metadataRevision"] + 1
                archive_replay = await client.delete(
                    f"{base_url}/packages/{package['id']}",
                    params={"expectedRevision": removable["metadataRevision"]},
                    headers={"Idempotency-Key": "skill-package-archive-success"},
                )
                assert archive_replay.status_code == 200, archive_replay.text
                assert archive_replay.json()["data"] == archived

                package_response = await client.get(f"{base_url}/packages/{package['id']}")
                assert package_response.status_code == 200, package_response.text
                assert package_response.json()["data"]["status"] == "archived"
                active_packages = (await client.get(f"{base_url}/packages", params={"limit": 100})).json()["data"]
                assert active_packages["items"] == []
                archived_packages = (
                    await client.get(
                        f"{base_url}/packages",
                        params={"limit": 100, "status": "archived"},
                    )
                ).json()["data"]
                assert [item["id"] for item in archived_packages["items"]] == [package["id"]]

                version_after_archive = await client.post(
                    f"{base_url}/packages/{package['id']}/versions",
                    headers={"Idempotency-Key": "skill-package-archive-new-version"},
                    json={"instructions": "This write must be rejected."},
                )
                assert version_after_archive.status_code == 409, version_after_archive.text
                assert version_after_archive.json()["error"] == "SKILL_PACKAGE_ARCHIVED"
                validation_after_archive = await client.post(
                    f"{base_url}/packages/{package['id']}/versions/{version['id']}/validations",
                    headers={"Idempotency-Key": "skill-package-archive-new-validation"},
                    json={"policyVersion": 1},
                )
                assert validation_after_archive.status_code == 409, validation_after_archive.text
                assert validation_after_archive.json()["error"] == "SKILL_PACKAGE_ARCHIVED"
                install_after_archive = await client.post(
                    f"{base_url}/installations",
                    headers={"Idempotency-Key": "skill-package-archive-reinstall"},
                    json={
                        "packageScope": "workspace",
                        "packageId": package["id"],
                        "versionId": version["id"],
                        "expectedPackageChecksum": version["packageChecksum"],
                        "validationFindingHash": validation["findingHash"],
                        "acceptedRequiredTools": [],
                        "acceptedPermissions": [],
                        "acceptedDataEgress": [],
                    },
                )
                assert install_after_archive.status_code == 409, install_after_archive.text
                assert install_after_archive.json()["error"] == "SKILL_PACKAGE_ARCHIVED"
                repeated_archive = await client.delete(
                    f"{base_url}/packages/{package['id']}",
                    params={"expectedRevision": archived["metadataRevision"]},
                    headers={"Idempotency-Key": "skill-package-archive-second-command"},
                )
                assert repeated_archive.status_code == 409, repeated_archive.text
                assert repeated_archive.json()["error"] == "SKILL_PACKAGE_ARCHIVED"
                assert (
                    await AuditEvent.filter(
                        workspace_id=workspace.id,
                        event_name="workspace.skill.package.archived",
                        entity_id=package_uuid,
                    ).count()
                    == 1
                )
        finally:
            app.dependency_overrides.clear()
