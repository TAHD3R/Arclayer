from __future__ import annotations


async def project_context_ids(client, workspace_id: str) -> tuple[str, str]:
    list_res = await client.get("/api/v1/projects", params={"workspaceId": workspace_id})
    assert list_res.status_code == 200, list_res.text
    items = list_res.json()["data"]["items"]
    if items:
        project_id = items[0]["id"]
    else:
        create_res = await client.post(
            "/api/v1/projects",
            json={
                "workspaceId": workspace_id,
                "name": "Test Project",
                "slug": "test-project",
            },
        )
        assert create_res.status_code == 201, create_res.text
        project_id = create_res.json()["data"]["id"]

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
