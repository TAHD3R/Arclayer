from __future__ import annotations

from fastapi import APIRouter
from fastapi.routing import APIRoute

from src.modules.ai.runtime_http_router import router as ai_runtime_router
from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect
from src.modules.projects.agents.router import router as project_agents_router
from src.modules.projects.api_keys.router import router as project_api_keys_router
from src.modules.projects.assets.assets_router import router as assets_router
from src.modules.projects.assets.uploads_router import router as uploads_router
from src.modules.projects.assets.usages_router import router as asset_usages_router
from src.modules.projects.automation.router import router as project_automation_router
from src.modules.projects.databases.router import router as project_databases_router
from src.modules.projects.environments.router import router as project_environments_router
from src.modules.workspaces.design_systems.router import router as design_systems_router
from src.modules.workspaces.knowledge.router import router as knowledge_router
from src.modules.workspaces.skills.router import router as skills_router
from src.modules.workspaces.uploads_router import router as workspace_uploads_router


def _route(router: APIRouter, *, path: str, method: str) -> APIRoute:
    for route in router.routes:
        if isinstance(route, APIRoute) and route.path == path and method in route.methods:
            return route
    raise AssertionError(f"Route not found: {method} {path}")


def _commercial_effects(route: APIRoute) -> set[RestrictedRecoveryEffect]:
    effects: set[RestrictedRecoveryEffect] = set()
    for dependency in route.dependencies:
        call = dependency.dependency
        closure = getattr(call, "__closure__", ()) or ()
        effects.update(value for cell in closure if isinstance(value := cell.cell_contents, RestrictedRecoveryEffect))
    return effects


def _assert_classified_mutations(
    router: APIRouter,
    classifications: dict[tuple[str, str], RestrictedRecoveryEffect | None],
) -> None:
    actual = {
        (route.path, method): _commercial_effects(route)
        for route in router.routes
        if isinstance(route, APIRoute)
        for method in route.methods or set()
        if method in {"POST", "PUT", "PATCH", "DELETE"}
    }
    assert actual.keys() == classifications.keys()
    for key, effect in classifications.items():
        assert actual[key] == ({effect} if effect is not None else set())


def test_project_asset_mutations_are_classified_and_downloads_are_preserved() -> None:
    content_mutation = RestrictedRecoveryEffect.CONTENT_MUTATION
    metered_effect = RestrictedRecoveryEffect.METERED_EXTERNAL_EFFECT
    _assert_classified_mutations(
        assets_router,
        {
            ("/projects/{project_id}/asset-tags", "POST"): content_mutation,
            ("/projects/{project_id}/assets/{asset_id}", "PATCH"): content_mutation,
            ("/projects/{project_id}/assets/{asset_id}", "DELETE"): content_mutation,
            ("/projects/{project_id}/asset-folders", "POST"): content_mutation,
            ("/projects/{project_id}/asset-folders/{folder_id}", "PUT"): content_mutation,
            ("/projects/{project_id}/asset-folders/{folder_id}", "DELETE"): content_mutation,
            ("/projects/{project_id}/asset-folders/{folder_id}/delete", "POST"): content_mutation,
            ("/projects/{project_id}/assets/bulk/move", "PUT"): content_mutation,
            ("/projects/{project_id}/assets/bulk/delete", "POST"): content_mutation,
            ("/projects/{project_id}/assets/bulk/update", "PUT"): content_mutation,
            ("/projects/{project_id}/assets/{asset_id}/move", "PUT"): content_mutation,
        },
    )
    _assert_classified_mutations(
        uploads_router,
        {
            ("/projects/{project_id}/uploads/init", "POST"): metered_effect,
            ("/projects/{project_id}/uploads/{upload_id}/parts/{part_number}", "PUT"): metered_effect,
            ("/projects/{project_id}/uploads/{upload_id}/complete", "POST"): metered_effect,
            ("/projects/{project_id}/uploads/{upload_id}/abort", "POST"): None,
            ("/projects/{project_id}/uploads/{upload_id}/parts/{part_number}/presign", "POST"): metered_effect,
            ("/projects/{project_id}/uploads/{upload_id}/parts/{part_number}/commit", "POST"): metered_effect,
        },
    )
    _assert_classified_mutations(
        asset_usages_router,
        {
            ("/projects/{project_id}/asset-usages", "PUT"): content_mutation,
            ("/projects/{project_id}/asset-usages/delete", "POST"): content_mutation,
        },
    )

    assert (
        _commercial_effects(
            _route(assets_router, path="/projects/{project_id}/assets/{asset_id}/content", method="GET")
        )
        == set()
    )
    assert (
        _commercial_effects(_route(uploads_router, path="/projects/{project_id}/uploads/{upload_id}", method="GET"))
        == set()
    )


def test_workspace_customization_mutations_have_explicit_commercial_classifications() -> None:
    content_mutation = RestrictedRecoveryEffect.CONTENT_MUTATION
    metered_effect = RestrictedRecoveryEffect.METERED_EXTERNAL_EFFECT
    _assert_classified_mutations(
        knowledge_router,
        {
            ("/workspaces/{workspace_id}/guidance/draft", "PUT"): content_mutation,
            ("/workspaces/{workspace_id}/guidance/projects/{project_id}", "PUT"): content_mutation,
            ("/workspaces/{workspace_id}/guidance/projects/{project_id}/publish", "POST"): content_mutation,
            ("/workspaces/{workspace_id}/guidance/projects/{project_id}/references", "POST"): content_mutation,
            (
                "/workspaces/{workspace_id}/guidance/projects/{project_id}/references/{knowledge_base_id}/detach",
                "POST",
            ): content_mutation,
            (
                "/workspaces/{workspace_id}/guidance/projects/{project_id}/remove-previews",
                "POST",
            ): content_mutation,
            (
                "/workspaces/{workspace_id}/guidance/projects/{project_id}/remove-previews/{preview_id}/apply",
                "POST",
            ): content_mutation,
            (
                "/workspaces/{workspace_id}/guidance/projects/{project_id}/restore-previews",
                "POST",
            ): content_mutation,
            (
                "/workspaces/{workspace_id}/guidance/projects/{project_id}/restore-previews/{preview_id}/apply",
                "POST",
            ): content_mutation,
            ("/workspaces/{workspace_id}/guidance/publish", "POST"): content_mutation,
            ("/workspaces/{workspace_id}/guidance/references", "POST"): content_mutation,
            (
                "/workspaces/{workspace_id}/guidance/references/{knowledge_base_id}/detach",
                "POST",
            ): content_mutation,
            ("/workspaces/{workspace_id}/guidance/remove-previews", "POST"): content_mutation,
            (
                "/workspaces/{workspace_id}/guidance/remove-previews/{preview_id}/apply",
                "POST",
            ): content_mutation,
            ("/workspaces/{workspace_id}/guidance/restore-previews", "POST"): content_mutation,
            (
                "/workspaces/{workspace_id}/guidance/restore-previews/{preview_id}/apply",
                "POST",
            ): content_mutation,
            ("/workspaces/{workspace_id}/knowledge-bases", "POST"): content_mutation,
            ("/workspaces/{workspace_id}/knowledge-bases/{base_id}", "PATCH"): content_mutation,
            ("/workspaces/{workspace_id}/knowledge-bases/{base_id}/sources", "POST"): content_mutation,
            ("/workspaces/{workspace_id}/knowledge-bases/{base_id}/sources/{source_id}", "PATCH"): content_mutation,
            (
                "/workspaces/{workspace_id}/knowledge-bases/{base_id}/sources/{source_id}/ingestions",
                "POST",
            ): metered_effect,
            (
                "/workspaces/{workspace_id}/knowledge-bases/{base_id}/sources/{source_id}/versions",
                "POST",
            ): content_mutation,
        },
    )
    _assert_classified_mutations(
        skills_router,
        {
            ("/workspaces/{workspace_id}/skills/imports", "POST"): metered_effect,
            ("/workspaces/{workspace_id}/skills/imports/zip", "POST"): content_mutation,
            ("/workspaces/{workspace_id}/skills/packages/{package_id}/refreshes", "POST"): metered_effect,
            ("/workspaces/{workspace_id}/skills/packages", "POST"): content_mutation,
            ("/workspaces/{workspace_id}/skills/packages/{package_id}", "DELETE"): content_mutation,
            ("/workspaces/{workspace_id}/skills/packages/{package_id}/versions", "POST"): content_mutation,
            (
                "/workspaces/{workspace_id}/skills/packages/{package_id}/versions/{version_id}/validations",
                "POST",
            ): content_mutation,
            ("/workspaces/{workspace_id}/skills/installations", "POST"): content_mutation,
            ("/workspaces/{workspace_id}/skills/installations/{installation_id}", "DELETE"): content_mutation,
            (
                "/workspaces/{workspace_id}/skills/installations/{installation_id}/update-previews",
                "POST",
            ): content_mutation,
            ("/workspaces/{workspace_id}/skills/installations/{installation_id}/updates", "POST"): content_mutation,
            ("/workspaces/{workspace_id}/skills/installations/{installation_id}", "PATCH"): content_mutation,
        },
    )
    _assert_classified_mutations(
        design_systems_router,
        {
            ("/workspaces/{workspace_id}/design-systems", "POST"): content_mutation,
            ("/workspaces/{workspace_id}/design-systems/default-assignment", "PUT"): content_mutation,
            ("/workspaces/{workspace_id}/design-systems/{system_id}/versions", "POST"): content_mutation,
            (
                "/workspaces/{workspace_id}/design-systems/{system_id}/versions/{version_id}/previews",
                "POST",
            ): metered_effect,
            (
                "/workspaces/{workspace_id}/design-systems/{system_id}/versions/{version_id}/publications",
                "POST",
            ): metered_effect,
            (
                "/workspaces/{workspace_id}/design-systems/{system_id}/versions/{version_id}/validations",
                "POST",
            ): content_mutation,
        },
    )


def test_workspace_upload_and_ai_runtime_commands_preserve_recovery_boundaries() -> None:
    content_mutation = RestrictedRecoveryEffect.CONTENT_MUTATION
    metered_effect = RestrictedRecoveryEffect.METERED_EXTERNAL_EFFECT
    _assert_classified_mutations(
        workspace_uploads_router,
        {
            ("/workspaces/{workspace_id}/uploads/init", "POST"): metered_effect,
            ("/workspaces/{workspace_id}/uploads/{upload_id}/parts/{part_number}", "PUT"): metered_effect,
            ("/workspaces/{workspace_id}/uploads/{upload_id}/complete", "POST"): metered_effect,
            ("/workspaces/{workspace_id}/uploads/{upload_id}/abort", "POST"): None,
            (
                "/workspaces/{workspace_id}/uploads/{upload_id}/parts/{part_number}/presign",
                "POST",
            ): metered_effect,
            (
                "/workspaces/{workspace_id}/uploads/{upload_id}/parts/{part_number}/commit",
                "POST",
            ): metered_effect,
        },
    )
    _assert_classified_mutations(
        ai_runtime_router,
        {
            ("/workspaces/{workspace_id}/ai/runs/{run_id}/cancel", "POST"): None,
            ("/workspaces/{workspace_id}/ai/tool-calls/{tool_call_id}/responses", "POST"): None,
            ("/workspaces/{workspace_id}/ai/runs/{run_id}/resume", "POST"): metered_effect,
            ("/workspaces/{workspace_id}/ai/threads", "POST"): content_mutation,
            ("/workspaces/{workspace_id}/ai/threads/{thread_id}/runs", "POST"): metered_effect,
            ("/workspaces/{workspace_id}/ai/threads/{thread_id}", "PATCH"): content_mutation,
            ("/workspaces/{workspace_id}/ai/threads/{thread_id}", "DELETE"): None,
        },
    )


def test_project_control_plane_commands_are_commercially_classified() -> None:
    content_mutation = RestrictedRecoveryEffect.CONTENT_MUTATION
    metered_effect = RestrictedRecoveryEffect.METERED_EXTERNAL_EFFECT
    _assert_classified_mutations(
        project_api_keys_router,
        {
            ("/projects/{project_id}/api-keys", "POST"): RestrictedRecoveryEffect.ACCESS_EXPANSION,
            ("/projects/{project_id}/api-keys/{key_id}/revoke", "POST"): None,
            ("/projects/{project_id}/api-keys/{key_id}/rotate", "POST"): None,
        },
    )
    _assert_classified_mutations(
        project_databases_router,
        {
            ("/projects/{project_id}/databases", "POST"): metered_effect,
            ("/projects/{project_id}/databases/{database_id}/credentials/rotate", "POST"): None,
        },
    )
    _assert_classified_mutations(
        project_environments_router,
        {
            ("/projects/{project_id}/environments/{environment_id}", "PATCH"): content_mutation,
            ("/projects/{project_id}/environments/aliases/{alias_key}", "PATCH"): content_mutation,
            ("/projects/{project_id}/environments/clone", "POST"): content_mutation,
            ("/projects/{project_id}/environments/promote", "POST"): content_mutation,
        },
    )
    _assert_classified_mutations(
        project_automation_router,
        {
            ("/projects/{project_id}/automation/flows", "POST"): content_mutation,
            ("/projects/{project_id}/automation/flows/{flow_id}", "PATCH"): content_mutation,
            ("/projects/{project_id}/automation/flows/{flow_id}", "DELETE"): None,
        },
    )


def test_legacy_project_agent_effects_cannot_bypass_commercial_state() -> None:
    content_mutation = RestrictedRecoveryEffect.CONTENT_MUTATION
    metered_effect = RestrictedRecoveryEffect.METERED_EXTERNAL_EFFECT
    _assert_classified_mutations(
        project_agents_router,
        {
            ("/projects/{project_id}/agents/content-draft-proposals", "POST"): metered_effect,
            ("/projects/{project_id}/agents/content-model-draft-proposals", "POST"): metered_effect,
            ("/projects/{project_id}/agents/approvals/dry-run", "POST"): content_mutation,
            ("/projects/{project_id}/agents/approvals/{approval_id}", "PATCH"): content_mutation,
            ("/projects/{project_id}/agents/approvals/{approval_id}/approve", "POST"): content_mutation,
            ("/projects/{project_id}/agents/approvals/{approval_id}/reject", "POST"): None,
            ("/projects/{project_id}/agents/approvals/{approval_id}/apply", "POST"): content_mutation,
            ("/projects/{project_id}/agents/runs", "POST"): metered_effect,
            ("/projects/{project_id}/agents/runs/{run_id}/resume", "POST"): metered_effect,
            ("/projects/{project_id}/agents/runs/stream", "POST"): metered_effect,
            ("/projects/{project_id}/agents/runs/{run_id}/cancel", "POST"): None,
        },
    )
