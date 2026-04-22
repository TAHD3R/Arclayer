from __future__ import annotations

PROJECT_CORE_SETTINGS_UPDATED_EVENT = "settings.project.core.updated"


def build_project_settings_event_payload(
    *,
    project_id: str,
    workspace_id: str,
    paths: list[str],
) -> dict[str, object]:
    return {
        "project_id": project_id,
        "workspace_id": workspace_id,
        "namespace": "core",
        "paths": paths,
    }
