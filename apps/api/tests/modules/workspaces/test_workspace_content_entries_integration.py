from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.src.common.utils.public_ids import encode_uuid, is_public_id
from apps.api.src.config import get_settings
from apps.api.src.core.database.orm import verify_db_ready
from apps.api.src.core.registry import create_app
from apps.api.src.models.organization.org_membership import OrgMembership, OrgRole
from apps.api.src.models.organization.user import User
from apps.api.src.models.workspaces.workspace import Workspace
from apps.api.src.modules.auth.http.service import get_current_user, get_current_user_id
from apps.api.src.modules.auth.repository import UserRepository
from apps.api.src.modules.organization.repository import OrganizationRepository

pytestmark = pytest.mark.integration


def _doc(title: str) -> dict:
    return {
        "version": 1,
        "rootId": "page",
        "nodesById": {
            "page": {
                "id": "page",
                "type": "page_root",
                "name": "Page",
                "children": ["h1"],
                "seo": {"title": {"en-US": title}},
                "layout": {
                    "children": {
                        "mode": "auto",
                        "direction": "column",
                        "gap": 0,
                        "padding": 0,
                        "alignItems": "start",
                        "justifyContent": "start",
                        "wrap": "nowrap",
                    }
                },
            },
            "h1": {
                "id": "h1",
                "type": "text",
                "name": "Title",
                "text": {"en-US": title},
                "tag": "h1",
                "layout": {
                    "self": {"rect": {"x": 0, "y": 0, "width": 720, "height": 0}, "alignX": "start", "alignY": "start"},
                    "children": {"mode": "absolute"},
                },
                "style": {"typography": {"fontSize": 32, "lineHeight": 40, "fontWeight": 700}},
            },
        },
    }


@pytest.mark.asyncio
async def test_workspace_content_entries_flow(prepared_db, integration_valkey_settings) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        settings = get_settings()
        await verify_db_ready(settings)

        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")
        owner = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:10]}",
            email="owner@example.com",
            display_name="Owner",
            password_hash="x",
        )
        await OrgMembership.create(organization_id=org.id, user_id=owner.id, role=OrgRole.OWNER, status="active")
        ws = await Workspace.create(
            organization_id=org.id,
            slug=f"ws_{uuid4().hex[:8]}",
            name="Workspace",
            is_active=True,
            created_by_user_id=owner.id,
        )
        ws_pid = encode_uuid(ws.id)

        current_user: User | None = owner

        async def _get_user() -> User:
            assert current_user is not None
            return current_user

        async def _get_user_id() -> UUID:
            assert current_user is not None
            return current_user.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            # Ensure site exists for workspace scope.
            site_res = await client.get(f"/api/v1/workspaces/{ws_pid}/site")
            assert site_res.status_code == 200, site_res.text

            # Create content type.
            create_type_res = await client.post(
                f"/api/v1/workspaces/{ws_pid}/content/types",
                json={
                    "code": "article",
                    "name": "Article",
                    "kind": "post",
                    "fieldSchema": {
                        "title": {"type": "string", "required": True},
                        "excerpt": {"type": "string", "required": False},
                    },
                },
            )
            assert create_type_res.status_code == 201, create_type_res.text
            content_type = create_type_res.json()["data"]
            assert content_type["code"] == "article"
            assert content_type["kind"] == "post"

            # List types.
            list_type_res = await client.get(f"/api/v1/workspaces/{ws_pid}/content/types")
            assert list_type_res.status_code == 200, list_type_res.text
            assert list_type_res.json()["data"]["total"] >= 1

            # Create entry.
            create_entry_res = await client.post(
                f"/api/v1/workspaces/{ws_pid}/content/entries",
                json={"typeCode": "article", "slug": "hello-phase1", "title": "Hello"},
            )
            assert create_entry_res.status_code == 201, create_entry_res.text
            entry = create_entry_res.json()["data"]
            entry_id = entry["id"]

            # Save draft revision.
            draft_res = await client.post(
                f"/api/v1/workspaces/{ws_pid}/content/entries/{entry_id}/draft",
                json={
                    "pageBlueprint": _doc("Hello phase1"),
                    "fieldValues": {"title": "Hello", "excerpt": "Phase 1"},
                    "expectedRevision": 0,
                },
            )
            assert draft_res.status_code == 201, draft_res.text
            assert draft_res.json()["data"]["revision"] == 1

            # Publish.
            publish_res = await client.post(
                f"/api/v1/workspaces/{ws_pid}/content/entries/{entry_id}/publish",
                json={},
            )
            assert publish_res.status_code == 200, publish_res.text
            assert publish_res.json()["data"]["revision"] == 1

            # Deleting a published entry should fail.
            delete_published_res = await client.delete(f"/api/v1/workspaces/{ws_pid}/content/entries/{entry_id}")
            assert delete_published_res.status_code == 409, delete_published_res.text
            assert delete_published_res.json()["error"] == "CONTENT_ENTRY_MUST_UNPUBLISH"

            # Deleting a type in use should fail.
            delete_type_in_use_res = await client.delete(
                f"/api/v1/workspaces/{ws_pid}/content/types/{content_type['id']}",
            )
            assert delete_type_in_use_res.status_code == 409, delete_type_in_use_res.text
            assert delete_type_in_use_res.json()["error"] == "CONTENT_TYPE_IN_USE"

            # Save second draft revision.
            draft_v2_res = await client.post(
                f"/api/v1/workspaces/{ws_pid}/content/entries/{entry_id}/draft",
                json={
                    "fieldValues": {"title": "Hello", "excerpt": "Phase 2"},
                    "pageBlueprint": _doc("Hello phase2"),
                    "expectedRevision": 1,
                },
            )
            assert draft_v2_res.status_code == 201, draft_v2_res.text
            assert draft_v2_res.json()["data"]["revision"] == 2

            # List entries with type filter.
            list_entries_res = await client.get(
                f"/api/v1/workspaces/{ws_pid}/content/entries",
                params={"typeCode": "article"},
            )
            assert list_entries_res.status_code == 200, list_entries_res.text
            rows = list_entries_res.json()["data"]["items"]
            row = next((item for item in rows if item["id"] == entry_id), None)
            assert row is not None
            assert row["draftRevision"] == 2
            assert row["publishedRevision"] == 1

            # Read published revision.
            published_rev_res = await client.get(
                f"/api/v1/workspaces/{ws_pid}/content/entries/{entry_id}/revisions/published",
            )
            assert published_rev_res.status_code == 200, published_rev_res.text
            assert published_rev_res.json()["data"]["revision"] == 1

            # Rollback draft pointer to revision 1.
            rollback_draft_res = await client.post(
                f"/api/v1/workspaces/{ws_pid}/content/entries/{entry_id}/revisions/rollback",
                json={"target": "draft", "revision": 1},
            )
            assert rollback_draft_res.status_code == 200, rollback_draft_res.text
            assert rollback_draft_res.json()["data"]["fromRevision"] == 2
            assert rollback_draft_res.json()["data"]["toRevision"] == 1

            # Rollback published pointer to revision 2.
            rollback_published_res = await client.post(
                f"/api/v1/workspaces/{ws_pid}/content/entries/{entry_id}/revisions/rollback",
                json={"target": "published", "revision": 2},
            )
            assert rollback_published_res.status_code == 200, rollback_published_res.text
            assert rollback_published_res.json()["data"]["fromRevision"] == 1
            assert rollback_published_res.json()["data"]["toRevision"] == 2

            # Read published revision after rollback.
            published_rev_after_rollback_res = await client.get(
                f"/api/v1/workspaces/{ws_pid}/content/entries/{entry_id}/revisions/published",
            )
            assert published_rev_after_rollback_res.status_code == 200, published_rev_after_rollback_res.text
            assert published_rev_after_rollback_res.json()["data"]["revision"] == 2

            # Unpublish.
            unpublish_res = await client.post(
                f"/api/v1/workspaces/{ws_pid}/content/entries/{entry_id}/unpublish",
                json={},
            )
            assert unpublish_res.status_code == 200, unpublish_res.text

            # Create and manage a structure route.
            create_route_res = await client.post(
                f"/api/v1/workspaces/{ws_pid}/content/structure/routes",
                json={"pathPattern": "/blog/:slug", "entryTypeCode": "article"},
            )
            assert create_route_res.status_code == 201, create_route_res.text
            route_id = create_route_res.json()["data"]["id"]

            list_routes_res = await client.get(f"/api/v1/workspaces/{ws_pid}/content/structure/routes")
            assert list_routes_res.status_code == 200, list_routes_res.text
            assert list_routes_res.json()["data"]["total"] >= 1

            update_route_res = await client.patch(
                f"/api/v1/workspaces/{ws_pid}/content/structure/routes/{route_id}",
                json={"isActive": False},
            )
            assert update_route_res.status_code == 200, update_route_res.text

            delete_route_res = await client.delete(
                f"/api/v1/workspaces/{ws_pid}/content/structure/routes/{route_id}",
            )
            assert delete_route_res.status_code == 200, delete_route_res.text

            # Global slots.
            upsert_slot_res = await client.put(
                f"/api/v1/workspaces/{ws_pid}/content/structure/global-slots/header",
                json={"value": {"layout": "default"}},
            )
            assert upsert_slot_res.status_code == 200, upsert_slot_res.text
            assert upsert_slot_res.json()["data"]["slotKey"] == "header"

            list_slots_res = await client.get(f"/api/v1/workspaces/{ws_pid}/content/structure/global-slots")
            assert list_slots_res.status_code == 200, list_slots_res.text
            assert any(item["slotKey"] == "header" for item in list_slots_res.json()["data"]["items"])

            # Menus and items.
            create_menu_res = await client.post(
                f"/api/v1/workspaces/{ws_pid}/content/structure/menus",
                json={"key": "main", "name": "Main Menu"},
            )
            assert create_menu_res.status_code == 201, create_menu_res.text
            menu = create_menu_res.json()["data"]
            menu_id = menu["id"]
            assert is_public_id(menu_id)

            create_menu_item_res = await client.post(
                f"/api/v1/workspaces/{ws_pid}/content/structure/menus/{menu_id}/items",
                json={"label": "Home", "kind": "link", "target": "/"},
            )
            assert create_menu_item_res.status_code == 201, create_menu_item_res.text
            menu_after_item = create_menu_item_res.json()["data"]
            assert len(menu_after_item["items"]) == 1
            menu_item_id = menu_after_item["items"][0]["id"]
            assert is_public_id(menu_item_id)

            reorder_menu_items_res = await client.post(
                f"/api/v1/workspaces/{ws_pid}/content/structure/menus/{menu_id}/items/reorder",
                json={"items": [{"id": menu_item_id, "children": []}]},
            )
            assert reorder_menu_items_res.status_code == 200, reorder_menu_items_res.text

            update_menu_item_res = await client.patch(
                f"/api/v1/workspaces/{ws_pid}/content/structure/menus/{menu_id}/items/{menu_item_id}",
                json={"label": "Homepage"},
            )
            assert update_menu_item_res.status_code == 200, update_menu_item_res.text

            delete_menu_item_res = await client.delete(
                f"/api/v1/workspaces/{ws_pid}/content/structure/menus/{menu_id}/items/{menu_item_id}",
            )
            assert delete_menu_item_res.status_code == 200, delete_menu_item_res.text

            delete_menu_res = await client.delete(f"/api/v1/workspaces/{ws_pid}/content/structure/menus/{menu_id}")
            assert delete_menu_res.status_code == 200, delete_menu_res.text

            # Blocks.
            create_block_res = await client.post(
                f"/api/v1/workspaces/{ws_pid}/content/blocks",
                json={"code": "hero", "name": "Hero", "payload": {"kind": "hero"}},
            )
            assert create_block_res.status_code == 201, create_block_res.text
            block = create_block_res.json()["data"]
            block_id = block["id"]
            assert is_public_id(block_id)

            list_blocks_res = await client.get(f"/api/v1/workspaces/{ws_pid}/content/blocks")
            assert list_blocks_res.status_code == 200, list_blocks_res.text
            assert list_blocks_res.json()["data"]["total"] >= 1

            usages_res = await client.get(f"/api/v1/workspaces/{ws_pid}/content/blocks/{block_id}/usages")
            assert usages_res.status_code == 200, usages_res.text
            assert usages_res.json()["data"]["blockId"] == block_id

            delete_block_res = await client.delete(f"/api/v1/workspaces/{ws_pid}/content/blocks/{block_id}")
            assert delete_block_res.status_code == 200, delete_block_res.text

            # Views + preview.
            create_view_res = await client.post(
                f"/api/v1/workspaces/{ws_pid}/content/views",
                json={
                    "code": "article_list",
                    "name": "Article List",
                    "typeCode": "article",
                    "dsl": {"filters": [{"field": "typeCode", "op": "eq", "value": "article"}]},
                    "enabled": True,
                },
            )
            assert create_view_res.status_code == 201, create_view_res.text
            view_id = create_view_res.json()["data"]["id"]
            assert is_public_id(view_id)

            preview_view_res = await client.post(
                f"/api/v1/workspaces/{ws_pid}/content/views/{view_id}/preview",
                json={"limit": 20, "offset": 0},
            )
            assert preview_view_res.status_code == 200, preview_view_res.text
            assert preview_view_res.json()["data"]["total"] >= 1

            delete_view_res = await client.delete(f"/api/v1/workspaces/{ws_pid}/content/views/{view_id}")
            assert delete_view_res.status_code == 200, delete_view_res.text

            # Appearance: active theme + styles.
            set_theme_res = await client.put(
                f"/api/v1/workspaces/{ws_pid}/content/appearance/themes/active",
                json={"themeId": "core/default", "version": "1.0.0"},
            )
            assert set_theme_res.status_code == 200, set_theme_res.text

            get_theme_res = await client.get(f"/api/v1/workspaces/{ws_pid}/content/appearance/themes/active")
            assert get_theme_res.status_code == 200, get_theme_res.text
            assert get_theme_res.json()["data"]["themeId"] == "core/default"

            set_global_style_res = await client.put(
                f"/api/v1/workspaces/{ws_pid}/content/appearance/styles/global",
                json={"value": {"color": "black"}},
            )
            assert set_global_style_res.status_code == 200, set_global_style_res.text

            set_type_style_res = await client.put(
                f"/api/v1/workspaces/{ws_pid}/content/appearance/styles/types/article",
                json={"value": {"fontSize": "16px"}},
            )
            assert set_type_style_res.status_code == 200, set_type_style_res.text

            set_entry_style_res = await client.put(
                f"/api/v1/workspaces/{ws_pid}/content/appearance/styles/entries/{entry_id}",
                json={"value": {"lineHeight": 1.6}},
            )
            assert set_entry_style_res.status_code == 200, set_entry_style_res.text

            effective_style_res = await client.get(
                f"/api/v1/workspaces/{ws_pid}/content/appearance/styles/effective",
                params={"typeCode": "article", "entryId": entry_id},
            )
            assert effective_style_res.status_code == 200, effective_style_res.text
            effective = effective_style_res.json()["data"]["effective"]
            assert effective["color"] == "black"
            assert effective["fontSize"] == "16px"
            assert effective["lineHeight"] == 1.6

            # Delete entry.
            delete_entry_res = await client.delete(f"/api/v1/workspaces/{ws_pid}/content/entries/{entry_id}")
            assert delete_entry_res.status_code == 200, delete_entry_res.text

            # Delete type.
            delete_type_res = await client.delete(
                f"/api/v1/workspaces/{ws_pid}/content/types/{content_type['id']}",
            )
            assert delete_type_res.status_code == 200, delete_type_res.text
