from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.common.utils.public_ids import decode_public_id, encode_uuid
from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_app
from src.models.agents.runtime_builder_v1 import AgentRunBuilderSnapshotV1Record
from src.models.agents.runtime_v1 import AgentRunV1Record
from src.models.analytics.audit_event import AuditEvent
from src.models.builder.change_set import (
    BuilderChangeSetApprovalRecord,
    BuilderChangeSetCommandRecord,
    BuilderChangeSetRecord,
)
from src.models.builder.content_structure import ContentStructureRevisionRecord
from src.models.builder.generation import BuilderGenerationRecord
from src.models.builder.site_revision import SiteRevisionManifestRecord, SiteRevisionStatusRecord
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.content.hierarchy_node import HierarchyNodeRecord
from src.models.content.route_binding import RouteBindingRecord
from src.models.design_systems._enums import DesignSystemConceptGenerationStatus
from src.models.design_systems.concept_generation import DesignSystemConceptGenerationRecord
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobDispatchOutboxRecord,
    JobInternalStatus,
)
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.organization import Organization
from src.models.organization.user import User
from src.models.projects._enums import ProjectAuthoringMode, ProjectAuthoringState
from src.models.projects.environment import ProjectEnvironmentRecord
from src.models.projects.membership import ProjectMemberRole, ProjectMembership
from src.models.projects.project import ProjectRecord
from src.models.projects.runtime import ProjectRuntimeKind, ProjectRuntimeRecord
from src.models.workspaces.workspace import (
    Workspace,
    WorkspaceMembership,
    WorkspaceMembershipStatus,
)
from src.modules.ai.agent_catalog_manifest import official_agent_id
from src.modules.auth.http.service import get_current_user, get_current_user_id
from src.modules.auth.repository import UserRepository
from src.modules.auth.tokens.service import hash_password
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.design_systems.concept_schema import AgentDesignSystemConceptVersionCreate
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.projects.design_systems.version_service import ProjectDesignSystemVersionService
from src.modules.projects.runtime.site.service import ProjectRuntimeSiteService
from src.modules.sites.component_catalogs.official import get_official_component_catalog_registry
from src.modules.tenancy.router_helpers import bind_workspace_tenant_context
from src.modules.workspaces.design_systems.manifest import DesignSystemManifestInputV1
from src.modules.workspaces.rbac.service import build_workspace_rbac_service
from tests.modules.projects.helpers import create_project_page_model_for_environment

pytestmark = pytest.mark.integration

_COORDINATOR_AGENT_ID = official_agent_id("arclayer-coordinator")


async def _user() -> User:
    settings = get_settings()
    suffix = uuid4().hex[:8]
    return await UserRepository().create_user(
        username=f"design_system_owner_{suffix}",
        email=f"design_system_owner_{suffix}@example.com",
        display_name="Design System Owner",
        password_hash=hash_password("design_system_password_123", settings.auth),
    )


async def _workspace(*, owner: User, organization_id: UUID | None = None, label: str) -> Workspace:
    settings = get_settings()
    if organization_id is None:
        suffix = uuid4().hex[:10]
        organization = await Organization.create(
            slug=f"design-system-{suffix}",
            name="Design System Organization",
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
        organization_id = organization.id
    workspace = await Workspace.create(
        organization_id=organization_id,
        name=f"Design System {label.title()}",
        is_active=True,
        owner_user_id=owner.id,
        created_by_user_id=owner.id,
    )
    await build_workspace_rbac_service(settings).ensure_workspace_rbac_ready(workspace_id=workspace.id)
    await WorkspaceMembership.create(
        workspace_id=workspace.id,
        user_id=owner.id,
        status=WorkspaceMembershipStatus.ACTIVE,
    )
    return workspace


def _manifest(*, name: str, action_color: str) -> dict[str, object]:
    return {
        "manifestVersion": 1,
        "name": name,
        "primitiveTokens": {
            "primitive.color.white": {"type": "color", "value": "#FFFFFF"},
            "primitive.color.ink": {"type": "color", "value": "#111111"},
            "primitive.color.muted": {"type": "color", "value": "#595959"},
            "primitive.color.action": {"type": "color", "value": action_color},
            "primitive.color.on-action": {"type": "color", "value": "#FFFFFF"},
            "primitive.color.border": {"type": "color", "value": "#D5D7DA"},
            "primitive.color.focus": {"type": "color", "value": action_color},
        },
        "semanticTokens": {
            "semantic.color.surface.canvas": {"type": "color", "alias": "primitive.color.white"},
            "semantic.color.text.primary": {"type": "color", "alias": "primitive.color.ink"},
            "semantic.color.text.secondary": {"type": "color", "alias": "primitive.color.muted"},
            "semantic.color.action.primary": {"type": "color", "alias": "primitive.color.action"},
            "semantic.color.action.on-primary": {"type": "color", "alias": "primitive.color.on-action"},
            "semantic.color.border.default": {"type": "color", "alias": "primitive.color.border"},
            "semantic.color.focus.ring": {"type": "color", "alias": "primitive.color.focus"},
        },
        "componentTokens": {},
        "themes": [{"key": "light", "name": "Light", "mode": "light", "overrides": {}}],
        "typographyRoles": [],
        "componentRecipes": [],
        "motionTokens": [],
        "breakpoints": {},
        "assetReferences": [],
        "componentCatalogVersion": "arclayer-wireframe-v1",
        "extensions": {},
    }


async def test_workspace_design_system_foundation_is_exact_tenant_safe_and_audited(prepared_db) -> None:
    _ = prepared_db
    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)
        owner = await _user()
        workspace = await _workspace(owner=owner, label="primary")
        other_workspace = await _workspace(
            owner=owner,
            organization_id=workspace.organization_id,
            label="other",
        )
        project = await ProjectRecord.create(
            workspace_id=workspace.id,
            slug=f"design-system-project-{uuid4().hex[:8]}",
            name="Design System Project",
            authoring_mode=ProjectAuthoringMode.BUILDER_MANAGED,
            authoring_state=ProjectAuthoringState.READY,
            authoring_revision=1,
            authoring_resolved_by_user_id=owner.id,
            created_by_user_id=owner.id,
        )
        other_project = await ProjectRecord.create(
            workspace_id=workspace.id,
            slug=f"design-system-other-{uuid4().hex[:8]}",
            name="Other Design System Project",
            created_by_user_id=owner.id,
        )
        await ProjectMembership.create(
            project_id=project.id,
            user_id=owner.id,
            role=ProjectMemberRole.OWNER,
            created_by_user_id=owner.id,
        )
        runtime = await ProjectRuntimeRecord.get(
            project_id=project.id,
            kind=ProjectRuntimeKind.PRIMARY,
        )
        site = await ProjectRuntimeSiteService(settings).get_or_create_site_for_project_runtime(
            workspace_id=workspace.id,
            project_id=project.id,
            runtime_id=runtime.id,
            project_slug=project.slug,
            project_name=project.name,
            actor_user_id=owner.id,
        )
        preview_environment = await ProjectEnvironmentRecord.get(
            project_id=project.id,
            is_default_preview=True,
        )
        await ProjectMembership.create(
            project_id=other_project.id,
            user_id=owner.id,
            role=ProjectMemberRole.OWNER,
            created_by_user_id=owner.id,
        )

        async def _get_user() -> User:
            return owner

        async def _get_user_id() -> UUID:
            return owner.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id
        base = f"/api/v1/workspaces/{encode_uuid(workspace.id)}/design-systems"
        other_base = f"/api/v1/workspaces/{encode_uuid(other_workspace.id)}/design-systems"

        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            capabilities = await client.get(f"{base}/capabilities")
            assert capabilities.status_code == 200
            assert capabilities.json()["data"]["workspaceFoundation"] is True
            assert capabilities.json()["data"]["projectAssignment"] is True
            assert capabilities.json()["data"]["projectFork"] is True
            assert capabilities.json()["data"]["projectVersionAuthoring"] is True
            assert capabilities.json()["data"]["projectVersionHistory"] is True
            assert capabilities.json()["data"]["projectVersionComparison"] is True
            assert capabilities.json()["data"]["projectVersionImpactPreview"] is True
            assert capabilities.json()["data"]["projectVersionSupersession"] is True
            assert capabilities.json()["data"]["agentRunContext"] is True
            assert capabilities.json()["data"]["builderContext"] is True
            assert capabilities.json()["data"]["rendererPreview"] is False
            assert capabilities.json()["data"]["publication"] is False

            create_payload = {"name": "Editorial Contrast", "description": "Accessible editorial foundations."}
            created = await client.post(base, json=create_payload, headers={"Idempotency-Key": "ds-create-1"})
            assert created.status_code == 201, created.text
            system = created.json()["data"]
            system_id = system["id"]
            assert system["versionCount"] == 0
            assert system["isDefault"] is False

            replay = await client.post(base, json=create_payload, headers={"Idempotency-Key": "ds-create-1"})
            assert replay.status_code == 201
            assert replay.json()["data"]["id"] == system_id
            key_conflict = await client.post(
                base,
                json={**create_payload, "description": "Different content."},
                headers={"Idempotency-Key": "ds-create-1"},
            )
            assert key_conflict.status_code == 409
            assert key_conflict.json()["error"] == "DESIGN_SYSTEM_IDEMPOTENCY_CONFLICT"

            cross_workspace = await client.get(f"{other_base}/{system_id}")
            assert cross_workspace.status_code == 404
            assert cross_workspace.json()["error"] == "DESIGN_SYSTEM_NOT_FOUND"

            catalogs_response = await client.get(f"{base}/component-catalogs")
            assert catalogs_response.status_code == 200, catalogs_response.text
            catalogs = catalogs_response.json()["data"]
            assert [catalog["catalogVersion"] for catalog in catalogs] == ["arclayer-wireframe-v1"]
            assert catalogs[0]["checksum"].startswith("sha256:")

            first_version = await client.post(
                f"{base}/{system_id}/versions",
                json={"manifest": _manifest(name="Editorial Contrast", action_color="#155EEF"), "source": "manual"},
                headers={"Idempotency-Key": "ds-version-1"},
            )
            assert first_version.status_code == 201, first_version.text
            version_one = first_version.json()["data"]
            assert version_one["versionNumber"] == 1
            assert version_one["publishReady"] is False

            validation_one_response = await client.post(
                f"{base}/{system_id}/versions/{version_one['id']}/validations",
                json={"profile": "foundation", "validatorVersion": 2},
                headers={"Idempotency-Key": "ds-validation-1"},
            )
            assert validation_one_response.status_code == 201, validation_one_response.text
            validation_one = validation_one_response.json()["data"]
            assert validation_one["status"] == "valid"
            assert validation_one["publishReady"] is False
            assert validation_one["compatibility"]["renderer"] == "not_evaluated"
            assert validation_one["compatibility"]["componentCatalog"] == "compatible"

            default_payload_one = {
                "designSystemId": system_id,
                "versionId": version_one["id"],
                "expectedManifestChecksum": version_one["manifestChecksum"],
                "validationFindingHash": validation_one["findingHash"],
                "expectedRevision": 0,
            }
            default_one_response = await client.put(
                f"{base}/default-assignment",
                json=default_payload_one,
                headers={"Idempotency-Key": "ds-default-1"},
            )
            assert default_one_response.status_code == 200, default_one_response.text
            default_one = default_one_response.json()["data"]
            assert default_one["metadataRevision"] == 1
            assert default_one["versionId"] == version_one["id"]

            second_version = await client.post(
                f"{base}/{system_id}/versions",
                json={
                    "manifest": _manifest(name="Editorial Contrast 2", action_color="#004EEB"),
                    "parentVersionId": version_one["id"],
                    "expectedParentChecksum": version_one["manifestChecksum"],
                    "source": "manual",
                },
                headers={"Idempotency-Key": "ds-version-2"},
            )
            assert second_version.status_code == 201, second_version.text
            version_two = second_version.json()["data"]
            assert version_two["versionNumber"] == 2

            unvalidated_default = await client.put(
                f"{base}/default-assignment",
                json={
                    "designSystemId": system_id,
                    "versionId": version_two["id"],
                    "expectedManifestChecksum": version_two["manifestChecksum"],
                    "validationFindingHash": validation_one["findingHash"],
                    "expectedRevision": 1,
                },
                headers={"Idempotency-Key": "ds-default-unvalidated"},
            )
            assert unvalidated_default.status_code == 409
            assert unvalidated_default.json()["error"] == "DESIGN_SYSTEM_VALIDATION_REQUIRED"

            validation_two_response = await client.post(
                f"{base}/{system_id}/versions/{version_two['id']}/validations",
                json={"profile": "foundation", "validatorVersion": 2},
                headers={"Idempotency-Key": "ds-validation-2"},
            )
            validation_two = validation_two_response.json()["data"]
            assert validation_two["status"] == "valid"
            default_payload_two = {
                "designSystemId": system_id,
                "versionId": version_two["id"],
                "expectedManifestChecksum": version_two["manifestChecksum"],
                "validationFindingHash": validation_two["findingHash"],
                "expectedRevision": 1,
            }
            default_two_response = await client.put(
                f"{base}/default-assignment",
                json=default_payload_two,
                headers={"Idempotency-Key": "ds-default-2"},
            )
            assert default_two_response.status_code == 200, default_two_response.text
            default_two = default_two_response.json()["data"]
            assert default_two["metadataRevision"] == 2
            assert default_two["versionId"] == version_two["id"]

            historical_replay = await client.put(
                f"{base}/default-assignment",
                json=default_payload_one,
                headers={"Idempotency-Key": "ds-default-1"},
            )
            assert historical_replay.status_code == 200
            assert historical_replay.json()["data"] == default_one
            current_default = await client.get(f"{base}/default-assignment")
            assert current_default.json()["data"] == default_two

            stale_default = await client.put(
                f"{base}/default-assignment",
                json={**default_payload_two, "expectedRevision": 1},
                headers={"Idempotency-Key": "ds-default-stale"},
            )
            assert stale_default.status_code == 409
            assert stale_default.json()["error"] == "DESIGN_SYSTEM_REVISION_CONFLICT"

            project_base = f"/api/v1/projects/{encode_uuid(project.id)}/design-system"
            empty_assignment = await client.get(f"{project_base}/assignment")
            assert empty_assignment.status_code == 200
            assert empty_assignment.json()["data"] is None

            workspace_ai_base = f"/api/v1/workspaces/{encode_uuid(workspace.id)}/ai"
            thread_response = await client.post(
                f"{workspace_ai_base}/threads",
                json={
                    "projectId": encode_uuid(project.id),
                    "leadAgentId": encode_uuid(_COORDINATOR_AGENT_ID),
                    "title": "Design the project",
                },
                headers={"Idempotency-Key": "design-system-agent-thread"},
            )
            assert thread_response.status_code == 201, thread_response.text
            thread_id = thread_response.json()["data"]["threadId"]
            run_payload = {
                "projectId": encode_uuid(project.id),
                "leadAgentId": encode_uuid(_COORDINATOR_AGENT_ID),
                "mentionedAgentIds": [],
                "executionMode": "plan",
                "message": "Plan the homepage using the assigned design system.",
            }
            missing_assignment_run = await client.post(
                f"{workspace_ai_base}/threads/{thread_id}/runs",
                json=run_payload,
                headers={"Idempotency-Key": "design-system-agent-run-missing"},
            )
            assert missing_assignment_run.status_code == 409
            assert missing_assignment_run.json()["error"] == "AGENT_DESIGN_SYSTEM_ASSIGNMENT_REQUIRED"

            assignment_payload_one = {
                "designSystemId": system_id,
                "versionId": version_one["id"],
                "expectedManifestChecksum": version_one["manifestChecksum"],
                "validationFindingHash": validation_one["findingHash"],
                "expectedRevision": 0,
            }
            assignment_one_response = await client.put(
                f"{project_base}/assignment",
                json=assignment_payload_one,
                headers={"Idempotency-Key": "project-design-assignment-1"},
            )
            assert assignment_one_response.status_code == 200, assignment_one_response.text
            assignment_one = assignment_one_response.json()["data"]
            assert assignment_one["previous"] is None
            assert assignment_one["current"]["metadataRevision"] == 1
            assert assignment_one["current"]["versionId"] == version_one["id"]
            assert assignment_one["activeReleaseChanged"] is False
            assert assignment_one["siteRevisionChanged"] is False

            assignment_replay = await client.put(
                f"{project_base}/assignment",
                json=assignment_payload_one,
                headers={"Idempotency-Key": "project-design-assignment-1"},
            )
            assert assignment_replay.status_code == 200
            assert assignment_replay.json()["data"] == assignment_one

            fork_payload = {
                "sourceDesignSystemId": system_id,
                "sourceVersionId": version_one["id"],
                "expectedSourceChecksum": version_one["manifestChecksum"],
                "validationFindingHash": validation_one["findingHash"],
                "name": "Project Editorial Fork",
                "description": "Project-owned immutable fork.",
            }
            fork_response = await client.post(
                f"{project_base}/forks",
                json=fork_payload,
                headers={"Idempotency-Key": "project-design-fork-1"},
            )
            assert fork_response.status_code == 201, fork_response.text
            fork = fork_response.json()["data"]
            assert fork["sourceDesignSystemId"] == system_id
            assert fork["sourceVersionId"] == version_one["id"]
            assert fork["manifestChecksum"] == version_one["manifestChecksum"]

            project_version_base = f"{project_base}/{fork['designSystemId']}/versions"
            fork_version_response = await client.get(f"{project_version_base}/{fork['versionId']}")
            assert fork_version_response.status_code == 200, fork_version_response.text
            assert fork_version_response.json()["data"]["manifest"]["name"] == "Editorial Contrast"

            workspace_owned_project_edit = await client.post(
                f"{project_base}/{system_id}/versions",
                json={
                    "manifest": _manifest(name="Must not mutate Workspace", action_color="#2357D9"),
                    "parentVersionId": version_two["id"],
                    "expectedParentChecksum": version_two["manifestChecksum"],
                    "source": "manual",
                },
                headers={"Idempotency-Key": "project-design-version-workspace-owned"},
            )
            assert workspace_owned_project_edit.status_code == 404
            assert workspace_owned_project_edit.json()["error"] == "DESIGN_SYSTEM_NOT_FOUND"

            project_version_response = await client.post(
                project_version_base,
                json={
                    "manifest": _manifest(name="Project Editorial Refined", action_color="#2357D9"),
                    "parentVersionId": fork["versionId"],
                    "expectedParentChecksum": fork["manifestChecksum"],
                    "source": "manual",
                },
                headers={"Idempotency-Key": "project-design-version-2"},
            )
            assert project_version_response.status_code == 201, project_version_response.text
            project_version = project_version_response.json()["data"]
            assert project_version["versionNumber"] == 2
            assert project_version["parentVersionId"] == fork["versionId"]
            assert project_version["manifestChecksum"] != fork["manifestChecksum"]
            assert project_version["validationStatus"] is None

            project_version_replay = await client.post(
                project_version_base,
                json={
                    "manifest": _manifest(name="Project Editorial Refined", action_color="#2357D9"),
                    "parentVersionId": fork["versionId"],
                    "expectedParentChecksum": fork["manifestChecksum"],
                    "source": "manual",
                },
                headers={"Idempotency-Key": "project-design-version-2"},
            )
            assert project_version_replay.status_code == 201
            assert project_version_replay.json()["data"] == project_version

            project_version_conflict = await client.post(
                project_version_base,
                json={
                    "manifest": _manifest(name="Conflicting replay", action_color="#2357D9"),
                    "parentVersionId": fork["versionId"],
                    "expectedParentChecksum": fork["manifestChecksum"],
                    "source": "manual",
                },
                headers={"Idempotency-Key": "project-design-version-2"},
            )
            assert project_version_conflict.status_code == 409
            assert project_version_conflict.json()["error"] == "DESIGN_SYSTEM_IDEMPOTENCY_CONFLICT"

            stale_project_version = await client.post(
                project_version_base,
                json={
                    "manifest": _manifest(name="Stale parent", action_color="#2357D9"),
                    "parentVersionId": fork["versionId"],
                    "expectedParentChecksum": fork["manifestChecksum"],
                    "source": "manual",
                },
                headers={"Idempotency-Key": "project-design-version-stale"},
            )
            assert stale_project_version.status_code == 409
            assert stale_project_version.json()["error"] == "DESIGN_SYSTEM_REVISION_CONFLICT"

            project_validation_response = await client.post(
                f"{project_version_base}/{project_version['id']}/validations",
                json={"profile": "foundation", "validatorVersion": 2},
                headers={"Idempotency-Key": "project-design-validation-2"},
            )
            assert project_validation_response.status_code == 201, project_validation_response.text
            project_validation = project_validation_response.json()["data"]
            assert project_validation["status"] == "valid"
            assert project_validation["publishReady"] is False
            assert project_validation["compatibility"]["componentCatalog"] == "compatible"

            project_history_response = await client.get(project_version_base, params={"limit": 1})
            assert project_history_response.status_code == 200, project_history_response.text
            project_history = project_history_response.json()["data"]
            assert project_history["systemMetadataRevision"] == 2
            assert [item["id"] for item in project_history["items"]] == [project_version["id"]]
            assert project_history["items"][0]["validationStatus"] == "valid"
            assert project_history["items"][0]["lifecycleStatus"] == "valid"
            assert project_history["items"][0]["statusRevision"] == 2
            assert project_history["nextCursor"] == project_version["id"]

            project_history_next_response = await client.get(
                project_version_base,
                params={"limit": 1, "cursor": project_history["nextCursor"]},
            )
            assert project_history_next_response.status_code == 200, project_history_next_response.text
            project_history_next = project_history_next_response.json()["data"]
            assert project_history_next["systemMetadataRevision"] == 2
            assert [item["id"] for item in project_history_next["items"]] == [fork["versionId"]]
            assert project_history_next["items"][0]["validationStatus"] == "valid"
            assert project_history_next["items"][0]["lifecycleStatus"] == "valid"
            assert project_history_next["items"][0]["statusRevision"] == 1
            assert project_history_next["nextCursor"] is None

            project_comparison_response = await client.post(
                f"{project_base}/{fork['designSystemId']}/comparisons",
                json={
                    "fromVersionId": fork["versionId"],
                    "toVersionId": project_version["id"],
                },
            )
            assert project_comparison_response.status_code == 200, project_comparison_response.text
            project_comparison = project_comparison_response.json()["data"]
            assert project_comparison["fromVersion"]["id"] == fork["versionId"]
            assert project_comparison["toVersion"]["id"] == project_version["id"]
            assert project_comparison["comparisonHash"].startswith("sha256:")
            assert project_comparison["diff"]["hasChanges"] is True
            assert project_comparison["diff"]["addedCount"] == 0
            assert project_comparison["diff"]["changedCount"] == 3
            assert project_comparison["diff"]["removedCount"] == 0
            assert [
                (entry["kind"], entry["operation"], entry["path"]) for entry in project_comparison["diff"]["entries"]
            ] == [
                ("metadata", "changed", "name"),
                ("primitive_token", "changed", "primitive.color.action"),
                ("primitive_token", "changed", "primitive.color.focus"),
            ]

            supersession_payload = {
                "replacementVersionId": project_version["id"],
                "expectedReplacementChecksum": project_version["manifestChecksum"],
                "expectedTargetStatus": "valid",
                "expectedTargetStatusRevision": 1,
                "expectedSystemRevision": 2,
            }
            supersession_response = await client.post(
                f"{project_version_base}/{fork['versionId']}/supersessions",
                json=supersession_payload,
                headers={"Idempotency-Key": "project-design-supersede-fork"},
            )
            assert supersession_response.status_code == 201, supersession_response.text
            supersession = supersession_response.json()["data"]
            assert supersession["targetVersion"]["id"] == fork["versionId"]
            assert supersession["targetVersion"]["lifecycleStatus"] == "superseded"
            assert supersession["targetVersion"]["statusRevision"] == 2
            assert supersession["targetVersion"]["supersededByVersionId"] == project_version["id"]
            assert supersession["replacementVersion"]["id"] == project_version["id"]
            assert supersession["replacementVersion"]["lifecycleStatus"] == "valid"
            assert supersession["previousLatestValidVersionId"] == project_version["id"]
            assert supersession["currentLatestValidVersionId"] == project_version["id"]
            assert supersession["systemMetadataRevision"] == 3
            assert supersession["assignmentChanged"] is False
            assert supersession["siteRevisionChanged"] is False
            assert supersession["activeReleaseChanged"] is False

            supersession_replay = await client.post(
                f"{project_version_base}/{fork['versionId']}/supersessions",
                json=supersession_payload,
                headers={"Idempotency-Key": "project-design-supersede-fork"},
            )
            assert supersession_replay.status_code == 201
            assert supersession_replay.json()["data"] == supersession

            supersession_conflict = await client.post(
                f"{project_version_base}/{fork['versionId']}/supersessions",
                json={**supersession_payload, "expectedSystemRevision": 3},
                headers={"Idempotency-Key": "project-design-supersede-fork"},
            )
            assert supersession_conflict.status_code == 409
            assert supersession_conflict.json()["error"] == "DESIGN_SYSTEM_IDEMPOTENCY_CONFLICT"

            superseded_validation = await client.post(
                f"{project_version_base}/{fork['versionId']}/validations",
                json={"profile": "foundation", "validatorVersion": 2},
                headers={"Idempotency-Key": "project-design-validation-superseded"},
            )
            assert superseded_validation.status_code == 409
            assert superseded_validation.json()["error"] == "DESIGN_SYSTEM_VERSION_SUPERSEDED"

            already_superseded = await client.post(
                f"{project_version_base}/{fork['versionId']}/supersessions",
                json={
                    **supersession_payload,
                    "expectedTargetStatus": "superseded",
                    "expectedTargetStatusRevision": 2,
                    "expectedSystemRevision": 3,
                },
                headers={"Idempotency-Key": "project-design-supersede-again"},
            )
            assert already_superseded.status_code == 409
            assert already_superseded.json()["error"] == "DESIGN_SYSTEM_VERSION_SUPERSEDED"

            superseded_assignment = await client.put(
                f"{project_base}/assignment",
                json={
                    "designSystemId": fork["designSystemId"],
                    "versionId": fork["versionId"],
                    "expectedManifestChecksum": fork["manifestChecksum"],
                    "validationFindingHash": fork["validationFindingHash"],
                    "expectedRevision": 1,
                },
                headers={"Idempotency-Key": "project-design-assignment-superseded"},
            )
            assert superseded_assignment.status_code == 409
            assert superseded_assignment.json()["error"] == "DESIGN_SYSTEM_VERSION_SUPERSEDED"

            cross_project_version = await client.get(
                f"/api/v1/projects/{encode_uuid(other_project.id)}/design-system/"
                f"{fork['designSystemId']}/versions/{project_version['id']}"
            )
            assert cross_project_version.status_code == 404
            assert cross_project_version.json()["error"] == "DESIGN_SYSTEM_NOT_FOUND"

            cross_project_comparison = await client.post(
                f"/api/v1/projects/{encode_uuid(other_project.id)}/design-system/{fork['designSystemId']}/comparisons",
                json={
                    "fromVersionId": fork["versionId"],
                    "toVersionId": project_version["id"],
                },
            )
            assert cross_project_comparison.status_code == 404
            assert cross_project_comparison.json()["error"] == "DESIGN_SYSTEM_NOT_FOUND"

            cross_project_supersession = await client.post(
                f"/api/v1/projects/{encode_uuid(other_project.id)}/design-system/"
                f"{fork['designSystemId']}/versions/{fork['versionId']}/supersessions",
                json=supersession_payload,
                headers={"Idempotency-Key": "cross-project-supersession"},
            )
            assert cross_project_supersession.status_code == 404
            assert cross_project_supersession.json()["error"] == "DESIGN_SYSTEM_NOT_FOUND"

            workspace_systems = await client.get(base)
            assert [item["id"] for item in workspace_systems.json()["data"]["items"]] == [system_id]

            cross_project_assignment = await client.put(
                f"/api/v1/projects/{encode_uuid(other_project.id)}/design-system/assignment",
                json={
                    "designSystemId": fork["designSystemId"],
                    "versionId": fork["versionId"],
                    "expectedManifestChecksum": fork["manifestChecksum"],
                    "validationFindingHash": fork["validationFindingHash"],
                    "expectedRevision": 0,
                },
                headers={"Idempotency-Key": "cross-project-fork"},
            )
            assert cross_project_assignment.status_code == 404
            assert cross_project_assignment.json()["error"] == "DESIGN_SYSTEM_NOT_FOUND"

            assignment_two_response = await client.put(
                f"{project_base}/assignment",
                json={
                    "designSystemId": fork["designSystemId"],
                    "versionId": project_version["id"],
                    "expectedManifestChecksum": project_version["manifestChecksum"],
                    "validationFindingHash": project_validation["findingHash"],
                    "expectedRevision": 1,
                },
                headers={"Idempotency-Key": "project-design-assignment-2"},
            )
            assert assignment_two_response.status_code == 200, assignment_two_response.text
            assignment_two = assignment_two_response.json()["data"]
            assert assignment_two["previous"]["versionId"] == version_one["id"]
            assert assignment_two["current"]["versionId"] == project_version["id"]
            assert assignment_two["current"]["ownerKind"] == "project"
            assert assignment_two["current"]["metadataRevision"] == 2

            historical_assignment_replay = await client.put(
                f"{project_base}/assignment",
                json=assignment_payload_one,
                headers={"Idempotency-Key": "project-design-assignment-1"},
            )
            assert historical_assignment_replay.json()["data"] == assignment_one
            current_assignment = await client.get(f"{project_base}/assignment")
            assert current_assignment.json()["data"] == assignment_two["current"]

            first_run_response = await client.post(
                f"{workspace_ai_base}/threads/{thread_id}/runs",
                json=run_payload,
                headers={"Idempotency-Key": "design-system-agent-run-1"},
            )
            assert first_run_response.status_code == 202, first_run_response.text
            first_run_id = first_run_response.json()["data"]["runId"]
            first_run_snapshot = await client.get(f"{workspace_ai_base}/runs/{first_run_id}")
            first_context = first_run_snapshot.json()["data"]["designSystemContext"]
            assert first_context["assignmentRevision"] == 2
            assert first_context["versionId"] == project_version["id"]
            assert first_context["manifestChecksum"] == project_version["manifestChecksum"]
            assert first_context["publishReady"] is False
            assert first_context["compatibility"]["renderer"] == "not_evaluated"

            builder_base = f"/api/v1/projects/{encode_uuid(project.id)}/builder"
            builder_before = await client.get(builder_base)
            assert builder_before.status_code == 200, builder_before.text
            assert builder_before.json()["data"]["initializationRequired"] is True
            assert builder_before.json()["data"]["currentSiteRevision"] is None
            assert builder_before.json()["data"]["blockers"] == ["BUILDER_INITIALIZATION_REQUIRED"]

            builder_payload = {
                "siteId": encode_uuid(site.id),
                "environmentId": encode_uuid(preview_environment.id),
                "expectedAuthoringRevision": 1,
                "expectedDesignSystemAssignmentRevision": 2,
                "expectedDesignSystemVersionId": project_version["id"],
                "expectedDesignSystemManifestChecksum": project_version["manifestChecksum"],
                "provenanceSource": "human",
            }
            builder_response = await client.post(
                f"{builder_base}/initializations",
                json=builder_payload,
                headers={"Idempotency-Key": "builder-initialization-1"},
            )
            assert builder_response.status_code == 201, builder_response.text
            builder = builder_response.json()["data"]
            assert builder["authoringAuthority"] == {
                "mode": "builder_managed",
                "state": "ready",
                "revision": 1,
            }
            assert builder["contentStructureRevision"]["revisionNumber"] == 1
            assert builder["contentStructureRevision"]["snapshot"]["pages"] == []
            assert builder["siteRevision"]["revisionNumber"] == 1
            assert builder["siteRevision"]["designSystemVersionId"] == project_version["id"]
            assert builder["siteRevision"]["designSystemManifestChecksum"] == project_version["manifestChecksum"]
            assert builder["status"]["status"] == "draft"
            builder_catalog_response = await client.get(f"{builder_base}/component-catalog")
            assert builder_catalog_response.status_code == 200, builder_catalog_response.text
            builder_catalog = builder_catalog_response.json()["data"]
            assert builder_catalog["siteRevisionId"] == builder["siteRevision"]["id"]
            assert builder_catalog["designSystemVersionId"] == project_version["id"]
            assert builder_catalog["defaultThemeKey"] == "light"
            assert builder_catalog["breakpoints"] == {}
            token_by_path = {item["path"]: item for item in builder_catalog["designTokens"]}
            assert token_by_path["semantic.color.action.primary"] == {
                "path": "semantic.color.action.primary",
                "type": "color",
                "resolvedValue": "#2563eb",
                "deprecated": False,
                "replacement": None,
            }
            assert builder_catalog["catalog"]["catalogVersion"] == "arclayer-wireframe-v1"
            assert {item["code"] for item in builder["status"]["readinessFindings"]} == {
                "BUILDER_SITE_EMPTY",
                "DESIGN_SYSTEM_PUBLICATION_NOT_READY",
                "DESIGN_SYSTEM_RENDERER_NOT_READY",
            }
            builder_revision_response = await client.get(f"{builder_base}/revisions/{builder['siteRevision']['id']}")
            assert builder_revision_response.status_code == 200, builder_revision_response.text
            builder_revision = builder_revision_response.json()["data"]
            assert builder_revision["siteRevision"] == builder["siteRevision"]
            assert builder_revision["status"] == builder["status"]
            assert builder_revision["contentStructureRevision"] == builder["contentStructureRevision"]
            assert builder_revision["pages"] == []

            impact_preview_response = await client.post(
                f"{project_base}/{fork['designSystemId']}/impact-previews",
                json={
                    "fromVersionId": project_version["id"],
                    "toVersionId": fork["versionId"],
                },
            )
            assert impact_preview_response.status_code == 200, impact_preview_response.text
            impact_preview = impact_preview_response.json()["data"]
            assert impact_preview["fromVersion"]["id"] == project_version["id"]
            assert impact_preview["toVersion"]["id"] == fork["versionId"]
            assert impact_preview["impactHash"].startswith("sha256:")
            assert impact_preview["diff"]["changedCount"] == 3
            assert impact_preview["summary"] == {
                "hasImpact": False,
                "assignmentUsesFromVersion": True,
                "referencedSiteRevisionCount": 1,
                "historicalSiteRevisionCount": 0,
                "currentSiteRevisionCount": 1,
                "affectedPageCount": 0,
                "affectedSectionCount": 0,
                "blockerCount": 0,
                "warningCount": 0,
                "mappedDiffCount": 0,
                "unmappedDiffCount": 3,
            }
            assert impact_preview["coverage"] == {
                "assignment": "evaluated",
                "siteRevisions": "evaluated",
                "wireframes": "evaluated",
                "assetAuthorization": "manifest_only",
                "activeRelease": "not_evaluated",
                "renderer": "not_evaluated",
                "compilerArtifacts": "not_evaluated",
            }
            assert impact_preview["impacts"] == []

            cross_project_impact = await client.post(
                f"/api/v1/projects/{encode_uuid(other_project.id)}/design-system/"
                f"{fork['designSystemId']}/impact-previews",
                json={
                    "fromVersionId": project_version["id"],
                    "toVersionId": fork["versionId"],
                },
            )
            assert cross_project_impact.status_code == 404
            assert cross_project_impact.json()["error"] == "DESIGN_SYSTEM_NOT_FOUND"

            builder_replay = await client.post(
                f"{builder_base}/initializations",
                json=builder_payload,
                headers={"Idempotency-Key": "builder-initialization-1"},
            )
            assert builder_replay.status_code == 201
            assert builder_replay.json()["data"] == builder
            builder_conflict = await client.post(
                f"{builder_base}/initializations",
                json={**builder_payload, "expectedDesignSystemAssignmentRevision": 1},
                headers={"Idempotency-Key": "builder-initialization-1"},
            )
            assert builder_conflict.status_code == 409
            assert builder_conflict.json()["error"] == "BUILDER_IDEMPOTENCY_CONFLICT"

            await create_project_page_model_for_environment(
                client,
                encode_uuid(project.id),
                environment_key=str(preview_environment.key),
            )

            change_set_payload = {
                "baseRevisionId": builder["siteRevision"]["id"],
                "baseEtag": builder["siteRevision"]["manifestHash"],
                "operations": [
                    {
                        "type": "page.create",
                        "operationId": "create-about",
                        "clientPageId": "about-page",
                        "modelKey": "page",
                        "title": "About",
                        "slug": "about",
                        "path": "about/",
                        "fieldsSnapshot": {"summary": "Our story"},
                    }
                ],
                "provenanceSource": "human",
            }
            unbound_agent_preview = await client.post(
                f"{builder_base}/change-sets/preview",
                json={
                    **change_set_payload,
                    "provenanceSource": "agent",
                    "agentRunId": first_run_id,
                    "toolName": "builder.sitemap.preview",
                },
                headers={"Idempotency-Key": "builder-change-set-unbound-agent"},
            )
            assert unbound_agent_preview.status_code == 409
            assert unbound_agent_preview.json()["error"] == "AGENT_BUILDER_CONTEXT_REQUIRED"
            builder_run_response = await client.post(
                f"{workspace_ai_base}/threads/{thread_id}/runs",
                json={
                    **run_payload,
                    "siteRevisionId": builder["siteRevision"]["id"],
                    "executionMode": "build",
                    "message": "Create a product-ready About page proposal for the current Sitemap.",
                },
                headers={"Idempotency-Key": "builder-context-agent-run-1"},
            )
            assert builder_run_response.status_code == 202, builder_run_response.text
            builder_run_id = builder_run_response.json()["data"]["runId"]
            builder_run_snapshot = await AgentRunBuilderSnapshotV1Record.get(run_id=decode_public_id(builder_run_id))
            assert builder_run_snapshot.site_revision_id == decode_public_id(builder["siteRevision"]["id"])
            assert builder_run_snapshot.manifest_hash == builder["siteRevision"]["manifestHash"]
            assert builder_run_snapshot.content_structure_hash == builder["contentStructureRevision"]["structureHash"]

            generation_payload = {
                "targetStage": "sitemap",
                "baseRevisionId": builder["siteRevision"]["id"],
                "baseEtag": builder["siteRevision"]["manifestHash"],
                "agentRunId": builder_run_id,
                "objective": "Generate two reviewable Sitemap directions for the current site.",
                "locale": "en-US",
                "candidateCount": 2,
            }
            unbound_generation = await client.post(
                f"{builder_base}/generations",
                json={**generation_payload, "agentRunId": first_run_id},
                headers={"Idempotency-Key": "builder-generation-unbound"},
            )
            assert unbound_generation.status_code == 409
            assert unbound_generation.json()["error"] == "AGENT_BUILDER_CONTEXT_REQUIRED"
            generation_response = await client.post(
                f"{builder_base}/generations",
                json=generation_payload,
                headers={"Idempotency-Key": "builder-generation-1"},
            )
            assert generation_response.status_code == 202, generation_response.text
            generation = generation_response.json()["data"]
            assert generation["targetStage"] == "sitemap"
            assert generation["baseRevisionId"] == builder["siteRevision"]["id"]
            assert generation["status"] == "queued"
            assert generation["jobStatus"] == "queued"
            assert generation["phase"] == "queued"
            assert generation["statusKey"] == "BUILDER_GENERATION_STATUS_QUEUED"
            assert generation["progressCompleted"] == 0
            assert generation["candidates"] == []
            assert generation["failures"] == []
            assert generation["cancelRequestedAt"] is None
            generation_replay = await client.post(
                f"{builder_base}/generations",
                json=generation_payload,
                headers={"Idempotency-Key": "builder-generation-1"},
            )
            assert generation_replay.status_code == 202
            assert generation_replay.json()["data"] == generation
            generation_conflict = await client.post(
                f"{builder_base}/generations",
                json={**generation_payload, "objective": "Use a conflicting objective."},
                headers={"Idempotency-Key": "builder-generation-1"},
            )
            assert generation_conflict.status_code == 409
            assert generation_conflict.json()["error"] == "BUILDER_GENERATION_IDEMPOTENCY_CONFLICT"
            generation_get = await client.get(f"{builder_base}/generations/{generation['generationId']}")
            assert generation_get.status_code == 200
            assert generation_get.json()["data"] == generation
            generation_cancel = await client.post(
                f"{builder_base}/generations/{generation['generationId']}/cancel",
                json={"reason": "Review the objective before model execution."},
            )
            assert generation_cancel.status_code == 200, generation_cancel.text
            cancelled_generation = generation_cancel.json()["data"]
            assert cancelled_generation["status"] == "queued"
            assert cancelled_generation["jobStatus"] == "queued"
            assert cancelled_generation["cancelRequestedAt"] is not None
            assert cancelled_generation["cancellationAcknowledgedAt"] is None

            concept_generation_base = f"{project_base}/{fork['designSystemId']}/concept-generations"
            concept_generation_payload = {
                "baseVersionId": project_version["id"],
                "expectedBaseChecksum": project_version["manifestChecksum"],
                "baseRevisionId": builder["siteRevision"]["id"],
                "baseEtag": builder["siteRevision"]["manifestHash"],
                "agentRunId": builder_run_id,
                "objective": "Create two distinctive editorial Style Guide directions.",
                "locale": "en-US",
                "candidateCount": 2,
            }
            concept_generation_response = await client.post(
                concept_generation_base,
                json=concept_generation_payload,
                headers={"Idempotency-Key": "style-guide-concept-generation-1"},
            )
            assert concept_generation_response.status_code == 202, concept_generation_response.text
            concept_generation = concept_generation_response.json()["data"]
            assert concept_generation["designSystemId"] == fork["designSystemId"]
            assert concept_generation["baseVersionId"] == project_version["id"]
            assert concept_generation["baseRevisionId"] == builder["siteRevision"]["id"]
            assert concept_generation["status"] == "queued"
            assert concept_generation["jobStatus"] == "queued"
            assert concept_generation["phase"] == "queued"
            assert concept_generation["statusKey"] == "DESIGN_SYSTEM_CONCEPT_GENERATION_STATUS_QUEUED"
            assert concept_generation["progressCompleted"] == 0
            assert concept_generation["candidates"] == []
            assert concept_generation["failures"] == []
            assert concept_generation["cancelRequestedAt"] is None
            concept_generation_replay = await client.post(
                concept_generation_base,
                json=concept_generation_payload,
                headers={"Idempotency-Key": "style-guide-concept-generation-1"},
            )
            assert concept_generation_replay.status_code == 202
            assert concept_generation_replay.json()["data"] == concept_generation
            concept_generation_conflict = await client.post(
                concept_generation_base,
                json={**concept_generation_payload, "objective": "Use a conflicting direction."},
                headers={"Idempotency-Key": "style-guide-concept-generation-1"},
            )
            assert concept_generation_conflict.status_code == 409
            assert (
                concept_generation_conflict.json()["error"] == "DESIGN_SYSTEM_CONCEPT_GENERATION_IDEMPOTENCY_CONFLICT"
            )
            concept_generation_get = await client.get(f"{concept_generation_base}/{concept_generation['generationId']}")
            assert concept_generation_get.status_code == 200
            assert concept_generation_get.json()["data"] == concept_generation
            concept_generation_cancel = await client.post(
                f"{concept_generation_base}/{concept_generation['generationId']}/cancel",
                json={"reason": "Review the visual direction before model execution."},
            )
            assert concept_generation_cancel.status_code == 200, concept_generation_cancel.text
            cancelled_concept_generation = concept_generation_cancel.json()["data"]
            assert cancelled_concept_generation["status"] == "queued"
            assert cancelled_concept_generation["jobStatus"] == "queued"
            assert cancelled_concept_generation["cancelRequestedAt"] is not None
            assert cancelled_concept_generation["cancellationAcknowledgedAt"] is None

            direct_concept_generation_response = await client.post(
                concept_generation_base,
                json={
                    **concept_generation_payload,
                    "agentRunId": None,
                    "agentId": encode_uuid(_COORDINATOR_AGENT_ID),
                    "objective": "Create one exact direct Style Guide direction.",
                    "candidateCount": 1,
                },
                headers={"Idempotency-Key": "style-guide-direct-concept-generation-1"},
            )
            assert direct_concept_generation_response.status_code == 202, direct_concept_generation_response.text
            direct_concept_generation = direct_concept_generation_response.json()["data"]
            assert direct_concept_generation["agentRunId"] is None
            assert direct_concept_generation["agentId"] == encode_uuid(_COORDINATOR_AGENT_ID)
            assert direct_concept_generation["agentVersionId"]
            assert direct_concept_generation["agentAssignmentId"]
            concept_recovery_response = await client.get(f"{concept_generation_base}/recovery")
            assert concept_recovery_response.status_code == 200, concept_recovery_response.text
            concept_recovery = concept_recovery_response.json()["data"]
            assert concept_recovery["active"]["generationId"] == direct_concept_generation["generationId"]
            assert concept_recovery["latestTerminal"] is None
            direct_concept_cancel = await client.post(
                f"{concept_generation_base}/{direct_concept_generation['generationId']}/cancel",
                json={"reason": "Contract evidence only."},
            )
            assert direct_concept_cancel.status_code == 200, direct_concept_cancel.text

            tenant_context = await bind_workspace_tenant_context(
                workspace_id=workspace.id,
                organization_id=workspace.organization_id,
            )
            async with SiteBuilderRepository(tenant_context).connection() as tenant_conn:
                terminal_at = datetime.now(UTC)
                await (
                    DesignSystemConceptGenerationRecord
                    .filter(id=decode_public_id(direct_concept_generation["generationId"]))
                    .using_db(tenant_conn)
                    .update(
                        status=DesignSystemConceptGenerationStatus.CANCELLED,
                        terminal_at=terminal_at,
                    )
                )
                await (
                    BackgroundJobRecord
                    .filter(id=decode_public_id(direct_concept_generation["jobId"]))
                    .using_db(tenant_conn)
                    .update(
                        internal_status=JobInternalStatus.CANCELLED,
                        phase="cancelled",
                        status_key="DESIGN_SYSTEM_CONCEPT_GENERATION_STATUS_CANCELLED",
                        cancellation_acknowledged_at=terminal_at,
                        completed_at=terminal_at,
                    )
                )
                generation_record = (
                    await BuilderGenerationRecord
                    .filter(id=decode_public_id(generation["generationId"]))
                    .using_db(tenant_conn)
                    .get()
                )
                direct_concept_record = (
                    await DesignSystemConceptGenerationRecord
                    .filter(id=decode_public_id(direct_concept_generation["generationId"]))
                    .using_db(tenant_conn)
                    .get()
                )
            recovered_terminal_response = await client.get(f"{concept_generation_base}/recovery")
            assert recovered_terminal_response.status_code == 200, recovered_terminal_response.text
            recovered_terminal = recovered_terminal_response.json()["data"]
            assert recovered_terminal["active"]["generationId"] == concept_generation["generationId"]
            assert recovered_terminal["latestTerminal"]["generationId"] == direct_concept_generation["generationId"]
            assert recovered_terminal["latestTerminal"]["status"] == "cancelled"
            assert recovered_terminal["latestTerminal"]["jobStatus"] == "cancelled"
            generation_job = await BackgroundJobRecord.get(id=decode_public_id(generation["jobId"]))
            generation_outbox = await JobDispatchOutboxRecord.get(job_id=generation_job.id)
            assert generation_record.job_id == generation_job.id
            assert generation_record.agent_run_id == decode_public_id(builder_run_id)
            assert generation_record.candidates == []
            assert generation_job.job_type == "builder.sitemap.generate"
            assert generation_job.max_attempts == 1
            assert generation_job.cancel_requested_at is not None
            assert generation_outbox.job_id == generation_job.id
            assert direct_concept_record.agent_run_id is None
            assert direct_concept_record.agent_id == _COORDINATOR_AGENT_ID
            assert direct_concept_record.agent_version_id is not None
            assert direct_concept_record.agent_assignment_id is not None
            assert isinstance(direct_concept_record.design_system_context, dict)
            assert isinstance(direct_concept_record.builder_context, dict)
            assert "previewToken" not in str(generation_record.candidates)
            assert "previewToken" not in str(generation_job.input_reference)

            bound_agent_preview = await client.post(
                f"{builder_base}/change-sets/preview",
                json={
                    **change_set_payload,
                    "provenanceSource": "agent",
                    "agentRunId": builder_run_id,
                    "toolName": "builder.sitemap.apply",
                },
                headers={"Idempotency-Key": "builder-change-set-bound-agent"},
            )
            assert bound_agent_preview.status_code == 201, bound_agent_preview.text
            assert bound_agent_preview.json()["data"]["operations"][0]["path"] == "/about"
            preview_response = await client.post(
                f"{builder_base}/change-sets/preview",
                json=change_set_payload,
                headers={"Idempotency-Key": "builder-change-set-preview-1"},
            )
            assert preview_response.status_code == 201, preview_response.text
            preview = preview_response.json()["data"]
            assert preview["status"] == "previewed"
            assert preview["operations"][0]["path"] == "/about"
            assert preview["operations"][0]["fieldsSnapshot"] == {
                "summary": "Our story",
                "title": "About",
                "path": "/about",
            }
            assert preview["approvalClass"] == "none"
            assert preview["approval"] is None
            assert preview["issues"] == []
            assert preview["summaryParams"] == {
                "operationCount": 1,
                "affectedTargetCount": 4,
                "warningCount": 0,
            }

            tenant_context = await bind_workspace_tenant_context(
                workspace_id=workspace.id,
                organization_id=workspace.organization_id,
            )
            async with SiteBuilderRepository(tenant_context).connection() as tenant_conn:
                persisted_change_set = await BuilderChangeSetRecord.get(
                    id=decode_public_id(preview["changeSetId"]),
                    using_db=tenant_conn,
                )
                persisted_command = await BuilderChangeSetCommandRecord.get(
                    project_id=project.id,
                    command_kind="preview",
                    request_idempotency_key="builder-change-set-preview-1",
                    using_db=tenant_conn,
                )
                structure_revision_count = await (
                    ContentStructureRevisionRecord.filter(project_id=project.id).using_db(tenant_conn).count()
                )
                site_revision_count = await (
                    SiteRevisionManifestRecord.filter(project_id=project.id).using_db(tenant_conn).count()
                )
            assert persisted_change_set.preview_token_hash != preview["previewToken"]
            assert preview["previewToken"] not in str(persisted_change_set.operations)
            assert preview["previewToken"] not in str(persisted_command.result_snapshot)
            assert "previewToken" not in persisted_command.result_snapshot
            assert structure_revision_count == 1
            assert site_revision_count == 1

            apply_response = await client.post(
                f"{builder_base}/change-sets/{preview['changeSetId']}/apply",
                json={"previewToken": preview["previewToken"]},
                headers={"Idempotency-Key": "builder-change-set-apply-1"},
            )
            assert apply_response.status_code == 200, apply_response.text
            applied = apply_response.json()["data"]
            about_item_id = applied["clientPageIds"]["about-page"]
            about_item_uuid = decode_public_id(about_item_id)
            assert applied["status"] == "applied"
            assert applied["baseRevisionId"] == builder["siteRevision"]["id"]
            assert applied["contentStructureRevision"]["revisionNumber"] == 2
            assert applied["siteRevision"]["revisionNumber"] == 2
            assert applied["siteRevision"]["baseRevisionId"] == builder["siteRevision"]["id"]
            assert applied["siteRevision"]["pageVersions"][0]["itemId"] == about_item_id

            async with SiteBuilderRepository(tenant_context).connection() as tenant_conn:
                about_item = await ContentItemRecord.get(id=about_item_uuid, using_db=tenant_conn)
                about_version = await ContentVersionRecord.get(item_id=about_item.id, version=1, using_db=tenant_conn)
                about_route = await RouteBindingRecord.get(item_id=about_item.id, using_db=tenant_conn)
                about_hierarchy = await HierarchyNodeRecord.get(item_id=about_item.id, using_db=tenant_conn)
                applied_change_set = await BuilderChangeSetRecord.get(
                    id=decode_public_id(preview["changeSetId"]),
                    using_db=tenant_conn,
                )
                apply_command = await BuilderChangeSetCommandRecord.get(
                    project_id=project.id,
                    command_kind="apply",
                    using_db=tenant_conn,
                )
                base_status = await SiteRevisionStatusRecord.get(
                    site_revision_id=decode_public_id(builder["siteRevision"]["id"]),
                    using_db=tenant_conn,
                )
                next_status = await SiteRevisionStatusRecord.get(
                    site_revision_id=decode_public_id(applied["siteRevision"]["id"]),
                    using_db=tenant_conn,
                )
            assert about_item.title == "About"
            assert about_item.draft_version == 1
            assert {key: about_version.fields_snapshot[key] for key in ("summary", "title", "path")} == {
                "summary": "Our story",
                "title": "About",
                "path": "/about",
            }
            assert about_version.fields_snapshot["created_at"]
            assert about_version.fields_snapshot["updated_at"]
            assert about_route.path == "/about"
            assert about_route.is_active is True
            assert about_hierarchy.parent_item_id is None
            assert applied_change_set.status == "applied"
            assert applied_change_set.applied_site_revision_id == decode_public_id(applied["siteRevision"]["id"])
            assert preview["previewToken"] not in str(applied_change_set.apply_result)
            assert preview["previewToken"] not in str(apply_command.result_snapshot)
            assert base_status.status == "superseded"
            assert next_status.status == "draft"

            apply_replay = await client.post(
                f"{builder_base}/change-sets/{preview['changeSetId']}/apply",
                json={"previewToken": preview["previewToken"]},
                headers={"Idempotency-Key": "builder-change-set-apply-1"},
            )
            assert apply_replay.status_code == 200
            assert apply_replay.json()["data"] == applied
            already_applied = await client.post(
                f"{builder_base}/change-sets/{preview['changeSetId']}/apply",
                json={"previewToken": preview["previewToken"]},
                headers={"Idempotency-Key": "builder-change-set-apply-2"},
            )
            assert already_applied.status_code == 409
            assert already_applied.json()["error"] == "CHANGE_SET_ALREADY_APPLIED"

            delete_preview_response = await client.post(
                f"{builder_base}/change-sets/preview",
                json={
                    "baseRevisionId": applied["siteRevision"]["id"],
                    "baseEtag": applied["siteRevision"]["manifestHash"],
                    "operations": [
                        {
                            "type": "page.delete",
                            "operationId": "delete-about",
                            "itemId": about_item_id,
                            "expectedDraftVersion": 1,
                        }
                    ],
                    "provenanceSource": "human",
                },
                headers={"Idempotency-Key": "builder-change-set-delete-preview"},
            )
            assert delete_preview_response.status_code == 201, delete_preview_response.text
            delete_preview = delete_preview_response.json()["data"]
            assert delete_preview["approvalClass"] == "destructive"
            assert delete_preview["approval"]["status"] == "pending"
            missing_approval = await client.post(
                f"{builder_base}/change-sets/{delete_preview['changeSetId']}/apply",
                json={"previewToken": delete_preview["previewToken"]},
                headers={"Idempotency-Key": "builder-change-set-delete-missing-approval"},
            )
            assert missing_approval.status_code == 409
            assert missing_approval.json()["error"] == "CHANGE_SET_APPROVAL_REQUIRED"
            delete_apply_response = await client.post(
                f"{builder_base}/change-sets/{delete_preview['changeSetId']}/apply",
                json={
                    "previewToken": delete_preview["previewToken"],
                    "approval": {
                        "approvalId": delete_preview["approval"]["approvalId"],
                        "decision": "approve",
                        "expectedApprovalClass": "destructive",
                    },
                },
                headers={"Idempotency-Key": "builder-change-set-delete-apply"},
            )
            assert delete_apply_response.status_code == 200, delete_apply_response.text
            delete_applied = delete_apply_response.json()["data"]
            assert delete_applied["approval"]["status"] == "consumed"
            assert delete_applied["siteRevision"]["revisionNumber"] == 3
            assert delete_applied["contentStructureRevision"]["snapshot"]["pages"] == []
            async with SiteBuilderRepository(tenant_context).connection() as tenant_conn:
                assert not await ContentItemRecord.filter(id=about_item_uuid).using_db(tenant_conn).exists()
                approval_checkpoint = await BuilderChangeSetApprovalRecord.get(
                    id=decode_public_id(delete_preview["approval"]["approvalId"]),
                    using_db=tenant_conn,
                )
            assert approval_checkpoint.status == "consumed"
            assert approval_checkpoint.approved_by_user_id == owner.id

            preview_replay = await client.post(
                f"{builder_base}/change-sets/preview",
                json=change_set_payload,
                headers={"Idempotency-Key": "builder-change-set-preview-1"},
            )
            assert preview_replay.status_code == 201
            assert preview_replay.json()["data"] == preview
            preview_conflict = await client.post(
                f"{builder_base}/change-sets/preview",
                json={
                    **change_set_payload,
                    "operations": [
                        {
                            **change_set_payload["operations"][0],
                            "title": "About Arclayer",
                        }
                    ],
                },
                headers={"Idempotency-Key": "builder-change-set-preview-1"},
            )
            assert preview_conflict.status_code == 409
            assert preview_conflict.json()["error"] == "CHANGE_SET_IDEMPOTENCY_CONFLICT"
            stale_preview = await client.post(
                f"{builder_base}/change-sets/preview",
                json={**change_set_payload, "baseEtag": f"sha256:{'0' * 64}"},
                headers={"Idempotency-Key": "builder-change-set-preview-stale"},
            )
            assert stale_preview.status_code == 409
            assert stale_preview.json()["error"] == "SITE_REVISION_STALE"

            assignment_three_response = await client.put(
                f"{project_base}/assignment",
                json={
                    "designSystemId": system_id,
                    "versionId": version_two["id"],
                    "expectedManifestChecksum": version_two["manifestChecksum"],
                    "validationFindingHash": validation_two["findingHash"],
                    "expectedRevision": 2,
                },
                headers={"Idempotency-Key": "project-design-assignment-3"},
            )
            assert assignment_three_response.status_code == 200
            assert assignment_three_response.json()["data"]["current"]["metadataRevision"] == 3

            unchanged_first_snapshot = await client.get(f"{workspace_ai_base}/runs/{first_run_id}")
            assert unchanged_first_snapshot.json()["data"]["designSystemContext"] == first_context

            second_run_response = await client.post(
                f"{workspace_ai_base}/threads/{thread_id}/runs",
                json={**run_payload, "message": "Plan the updated visual direction."},
                headers={"Idempotency-Key": "design-system-agent-run-2"},
            )
            assert second_run_response.status_code == 202, second_run_response.text
            second_run_id = second_run_response.json()["data"]["runId"]
            second_run_snapshot = await client.get(f"{workspace_ai_base}/runs/{second_run_id}")
            second_context = second_run_snapshot.json()["data"]["designSystemContext"]
            assert second_context["assignmentRevision"] == 3
            assert second_context["versionId"] == version_two["id"]
            assert second_context["contextHash"] != first_context["contextHash"]

            builder_after_assignment_change = await client.get(builder_base)
            assert builder_after_assignment_change.status_code == 200
            projected_builder = builder_after_assignment_change.json()["data"]
            assert projected_builder["initializationRequired"] is False
            assert projected_builder["blockers"] == []
            assert projected_builder["currentSiteRevision"] == delete_applied["siteRevision"]
            assert projected_builder["currentStatus"]["siteRevisionId"] == delete_applied["siteRevision"]["id"]
            assert projected_builder["currentStatus"]["status"] == "draft"
            assert {item["code"] for item in projected_builder["currentStatus"]["readinessFindings"]} == {
                "BUILDER_SITE_EMPTY",
                "DESIGN_SYSTEM_PUBLICATION_NOT_READY",
                "DESIGN_SYSTEM_RENDERER_NOT_READY",
            }

            refresh_operation = {
                "type": "design-system.refresh",
                "operationId": "refresh-design-system",
                "expectedAssignmentRevision": 3,
                "designSystemId": system_id,
                "versionId": version_two["id"],
                "expectedManifestChecksum": version_two["manifestChecksum"],
                "validationFindingHash": validation_two["findingHash"],
            }
            stale_refresh_response = await client.post(
                f"{builder_base}/change-sets/preview",
                json={
                    "baseRevisionId": delete_applied["siteRevision"]["id"],
                    "baseEtag": delete_applied["siteRevision"]["manifestHash"],
                    "operations": [{**refresh_operation, "expectedAssignmentRevision": 2}],
                    "provenanceSource": "human",
                },
                headers={"Idempotency-Key": "builder-design-system-refresh-stale"},
            )
            assert stale_refresh_response.status_code == 409
            assert stale_refresh_response.json()["error"] == "DESIGN_SYSTEM_REVISION_CONFLICT"

            refresh_preview_response = await client.post(
                f"{builder_base}/change-sets/preview",
                json={
                    "baseRevisionId": delete_applied["siteRevision"]["id"],
                    "baseEtag": delete_applied["siteRevision"]["manifestHash"],
                    "operations": [refresh_operation],
                    "provenanceSource": "human",
                },
                headers={"Idempotency-Key": "builder-design-system-refresh-preview"},
            )
            assert refresh_preview_response.status_code == 201, refresh_preview_response.text
            refresh_preview = refresh_preview_response.json()["data"]
            assert refresh_preview["approvalClass"] == "review"
            assert refresh_preview["approval"]["status"] == "pending"
            assert refresh_preview["affectedTargets"] == [
                {
                    "kind": "design_system",
                    "targetId": version_two["id"],
                    "clientTargetId": None,
                    "targetKey": None,
                    "operationIds": ["refresh-design-system"],
                }
            ]
            assert refresh_preview["summaryParams"] == {
                "operationCount": 1,
                "fromDesignSystemId": project_version["designSystemId"],
                "fromVersionId": project_version["id"],
                "toDesignSystemId": system_id,
                "toVersionId": version_two["id"],
            }

            refresh_missing_approval = await client.post(
                f"{builder_base}/change-sets/{refresh_preview['changeSetId']}/apply",
                json={"previewToken": refresh_preview["previewToken"]},
                headers={"Idempotency-Key": "builder-design-system-refresh-missing-approval"},
            )
            assert refresh_missing_approval.status_code == 409
            assert refresh_missing_approval.json()["error"] == "CHANGE_SET_APPROVAL_REQUIRED"

            refresh_apply_response = await client.post(
                f"{builder_base}/change-sets/{refresh_preview['changeSetId']}/apply",
                json={
                    "previewToken": refresh_preview["previewToken"],
                    "approval": {
                        "approvalId": refresh_preview["approval"]["approvalId"],
                        "decision": "approve",
                        "expectedApprovalClass": "review",
                    },
                },
                headers={"Idempotency-Key": "builder-design-system-refresh-apply"},
            )
            assert refresh_apply_response.status_code == 200, refresh_apply_response.text
            refresh_applied = refresh_apply_response.json()["data"]
            assert refresh_applied["siteRevision"]["revisionNumber"] == 4
            assert refresh_applied["siteRevision"]["baseRevisionId"] == delete_applied["siteRevision"]["id"]
            assert refresh_applied["siteRevision"]["designSystemId"] == system_id
            assert refresh_applied["siteRevision"]["designSystemVersionId"] == version_two["id"]
            assert refresh_applied["siteRevision"]["designSystemManifestChecksum"] == version_two["manifestChecksum"]
            assert (
                refresh_applied["siteRevision"]["contentStructureRevisionId"]
                == delete_applied["siteRevision"]["contentStructureRevisionId"]
            )
            assert refresh_applied["contentStructureRevision"] == delete_applied["contentStructureRevision"]
            assert refresh_applied["siteRevision"]["pageVersions"] == delete_applied["siteRevision"]["pageVersions"]

            refreshed_builder_response = await client.get(builder_base)
            assert refreshed_builder_response.status_code == 200
            refreshed_builder = refreshed_builder_response.json()["data"]
            assert refreshed_builder["currentSiteRevision"] == refresh_applied["siteRevision"]
            unchanged_assignment = await client.get(f"{project_base}/assignment")
            assert unchanged_assignment.json()["data"]["metadataRevision"] == 3
            assert unchanged_assignment.json()["data"]["versionId"] == version_two["id"]

            tenant_context = await bind_workspace_tenant_context(
                workspace_id=workspace.id,
                organization_id=workspace.organization_id,
            )
            version_service = ProjectDesignSystemVersionService(
                repository=ProjectDesignSystemsRepository(tenant_context),
                component_catalog_resolver=get_official_component_catalog_registry(),
            )
            async with SiteBuilderRepository(tenant_context).connection() as tenant_conn:
                revision_count_before_concepts = await (
                    SiteRevisionManifestRecord.filter(project_id=project.id).using_db(tenant_conn).count()
                )
            builder_run_record = await AgentRunV1Record.get(id=decode_public_id(builder_run_id))
            assert builder_run_record.lead_agent_version_id is not None
            assert builder_run_record.lead_agent_assignment_id is not None
            concept_base = {
                "base_version_id": decode_public_id(project_version["id"]),
                "expected_base_checksum": project_version["manifestChecksum"],
                "agent_run_id": decode_public_id(builder_run_id),
                "agent_id": builder_run_record.lead_agent_id,
                "agent_version_id": builder_run_record.lead_agent_version_id,
                "agent_assignment_id": builder_run_record.lead_agent_assignment_id,
            }
            concept_one = await version_service.create_agent_concept_version(
                workspace_id=workspace.id,
                organization_id=workspace.organization_id,
                project_id=project.id,
                system_id=decode_public_id(fork["designSystemId"]),
                actor_user_id=owner.id,
                idempotency_key="agent-concept-version-1",
                payload=AgentDesignSystemConceptVersionCreate(
                    generation_id=uuid4(),
                    candidate_index=0,
                    summary="Warm editorial direction",
                    manifest=DesignSystemManifestInputV1.model_validate(
                        _manifest(name="Warm Editorial", action_color="#8B4513")
                    ),
                    **concept_base,
                ),
            )
            concept_one_replay = await version_service.create_agent_concept_version(
                workspace_id=workspace.id,
                organization_id=workspace.organization_id,
                project_id=project.id,
                system_id=decode_public_id(fork["designSystemId"]),
                actor_user_id=owner.id,
                idempotency_key="agent-concept-version-1",
                payload=AgentDesignSystemConceptVersionCreate(
                    generation_id=UUID(str(concept_one.version.provenance["generationId"])),
                    candidate_index=0,
                    summary="Warm editorial direction",
                    manifest=DesignSystemManifestInputV1.model_validate(
                        _manifest(name="Warm Editorial", action_color="#8B4513")
                    ),
                    **concept_base,
                ),
            )
            concept_two = await version_service.create_agent_concept_version(
                workspace_id=workspace.id,
                organization_id=workspace.organization_id,
                project_id=project.id,
                system_id=decode_public_id(fork["designSystemId"]),
                actor_user_id=owner.id,
                idempotency_key="agent-concept-version-2",
                payload=AgentDesignSystemConceptVersionCreate(
                    generation_id=uuid4(),
                    candidate_index=1,
                    summary="Modern editorial direction",
                    manifest=DesignSystemManifestInputV1.model_validate(
                        _manifest(name="Modern Editorial", action_color="#6D28D9")
                    ),
                    **concept_base,
                ),
            )

            assert concept_one_replay == concept_one
            assert concept_one.version.version_number == 3
            assert concept_two.version.version_number == 4
            assert concept_one.version.parent_version_id == decode_public_id(project_version["id"])
            assert concept_two.version.parent_version_id == decode_public_id(project_version["id"])
            assert concept_one.version.source == "agent"
            assert concept_two.version.source == "agent"
            assert concept_one.validation.validator_version == 2
            assert concept_two.validation.validator_version == 2
            assert concept_one.version.provenance["candidateIndex"] == 0
            assert concept_two.version.provenance["candidateIndex"] == 1
            assignment_after_concepts = await client.get(f"{project_base}/assignment")
            assert assignment_after_concepts.json()["data"] == unchanged_assignment.json()["data"]
            async with SiteBuilderRepository(tenant_context).connection() as tenant_conn:
                revision_count_after_concepts = await (
                    SiteRevisionManifestRecord.filter(project_id=project.id).using_db(tenant_conn).count()
                )
            assert revision_count_after_concepts == revision_count_before_concepts

        events = await AuditEvent.filter(
            workspace_id=workspace.id,
            event_name__startswith="workspace.design_system",
        ).order_by("created_at")
        assert [event.event_name for event in events] == [
            "workspace.design_system.created",
            "workspace.design_system.version.created",
            "workspace.design_system.version.validated",
            "workspace.design_system.default.assigned",
            "workspace.design_system.version.created",
            "workspace.design_system.version.validated",
            "workspace.design_system.default.assigned",
        ]
        project_events = await AuditEvent.filter(
            project_id=project.id,
            event_name__startswith="project.design_system",
        ).order_by("created_at")
        assert [event.event_name for event in project_events] == [
            "project.design_system.assigned",
            "project.design_system.forked",
            "project.design_system.version.created",
            "project.design_system.version.validated",
            "project.design_system.version.superseded",
            "project.design_system.assigned",
            "project.design_system.concept_generation.created",
            "project.design_system.concept_generation.created",
            "project.design_system.assigned",
            "project.design_system.version.created",
            "project.design_system.version.validated",
            "project.design_system.version.created",
            "project.design_system.version.validated",
        ]
        builder_events = await AuditEvent.filter(
            project_id=project.id,
            event_name__startswith="project.builder",
        ).order_by("created_at")
        assert [event.event_name for event in builder_events] == [
            "project.builder.initialized",
            "project.builder.generation.created",
            "project.builder.change_set.previewed",
            "project.builder.change_set.previewed",
            "project.builder.change_set.applied",
            "project.builder.change_set.previewed",
            "project.builder.change_set.applied",
            "project.builder.change_set.previewed",
            "project.builder.change_set.applied",
        ]
