from __future__ import annotations


async def project_context_ids(client, workspace_id: str) -> tuple[str, str]:
    workspace_res = await client.get(f"/api/v1/workspaces/{workspace_id}")
    assert workspace_res.status_code == 200, workspace_res.text
    project_id = workspace_res.json()["data"]["project"]["projectId"]

    project_res = await client.get(f"/api/v1/projects/{project_id}")
    assert project_res.status_code == 200, project_res.text
    runtime = project_res.json()["data"]["primaryRuntime"]
    assert runtime is not None
    return project_id, runtime["id"]


async def project_id_for_workspace(client, workspace_id: str) -> str:
    project_id, _runtime_id = await project_context_ids(client, workspace_id)
    return project_id


async def project_site_id(client, project_id: str) -> str:
    site_res = await client.get(f"/api/v1/projects/{project_id}/site")
    assert site_res.status_code == 200, site_res.text
    return site_res.json()["data"]["siteId"]
