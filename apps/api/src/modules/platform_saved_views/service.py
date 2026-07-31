from __future__ import annotations

from uuid import UUID

from tortoise.transactions import in_transaction

from src.config import Settings
from src.core.exceptions import Conflict, Forbidden, NotFound
from src.models.platform_saved_views import PlatformSavedView
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.platform_identity.repository import PlatformIdentityRepository
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal
from src.modules.platform_identity.sessions import ensure_platform_permission
from src.modules.platform_saved_views.catalog import (
    CapabilityDefinition,
    effective_draft,
    get_capability,
    require_capability,
    validate_draft,
)
from src.modules.platform_saved_views.schema import (
    PlatformSavedViewDraft,
    PlatformSavedViewOmission,
    PlatformSavedViewOut,
    PlatformSavedViewReadOut,
)

_AUDIT_EVENTS = {
    "create": "platform.saved_view.created",
    "update": "platform.saved_view.updated",
    "delete": "platform.saved_view.deleted",
}


class PlatformSavedViewsService:
    """Actor-private saved views with current Platform authorization at every read and write."""

    def __init__(self, *, settings: Settings, identity_repository: PlatformIdentityRepository) -> None:
        self._settings = settings
        self._identity_repository = identity_repository

    async def list(
        self, *, actor: PlatformSessionPrincipal, capability_id: str
    ) -> tuple[PlatformSavedViewReadOut, ...]:
        capability = require_capability(capability_id)
        views = await PlatformSavedView.filter(
            actor_user_id=actor.actor_id, capability_id=capability.capability_id
        ).order_by("name", "id")
        items = [await self._read_out(view=view, actor=actor) for view in views]
        return tuple(items)

    async def get(self, *, actor: PlatformSessionPrincipal, view_id: UUID) -> PlatformSavedViewReadOut:
        view = await self._owned_view(actor_user_id=actor.actor_id, view_id=view_id)
        return await self._read_out(view=view, actor=actor)

    async def create(
        self, *, actor: PlatformSessionPrincipal, capability_id: str, draft: PlatformSavedViewDraft
    ) -> PlatformSavedViewOut:
        capability = await self._authorize(capability_id=capability_id, actor=actor)
        validate_draft(capability=capability, draft=draft)
        values = self._storage_values(draft)
        async with in_transaction() as conn:
            existing = (
                await PlatformSavedView
                .filter(actor_user_id=actor.actor_id, capability_id=capability.capability_id, name=draft.name)
                .using_db(conn)
                .exists()
            )
            if existing:
                raise Conflict(error="PLATFORM_SAVED_VIEW_NAME_CONFLICT")
            view = await PlatformSavedView.create(
                actor_user_id=actor.actor_id, capability_id=capability.capability_id, using_db=conn, **values
            )
            await self._write_audit(action="create", actor_user_id=actor.actor_id, view=view, conn=conn)
        return self._to_out(view)

    async def update(
        self, *, actor: PlatformSessionPrincipal, view_id: UUID, expected_revision: int, draft: PlatformSavedViewDraft
    ) -> PlatformSavedViewOut:
        async with in_transaction() as conn:
            view = await self._owned_view(actor_user_id=actor.actor_id, view_id=view_id, conn=conn, for_update=True)
            capability = await self._authorize(capability_id=view.capability_id, actor=actor)
            validate_draft(capability=capability, draft=draft)
            self._require_expected_revision(view=view, expected_revision=expected_revision)
            if (
                draft.name != view.name
                and await PlatformSavedView
                .filter(actor_user_id=actor.actor_id, capability_id=view.capability_id, name=draft.name)
                .using_db(conn)
                .exclude(id=view.id)
                .exists()
            ):
                raise Conflict(error="PLATFORM_SAVED_VIEW_NAME_CONFLICT")
            next_revision = view.revision + 1
            await (
                PlatformSavedView
                .filter(id=view.id)
                .using_db(conn)
                .update(**self._storage_values(draft), revision=next_revision)
            )
            updated = await PlatformSavedView.filter(id=view.id).using_db(conn).first()
            if updated is None:
                raise NotFound(error="PLATFORM_SAVED_VIEW_NOT_FOUND")
            await self._write_audit(action="update", actor_user_id=actor.actor_id, view=updated, conn=conn)
        return self._to_out(updated)

    async def delete(self, *, actor: PlatformSessionPrincipal, view_id: UUID, expected_revision: int) -> None:
        async with in_transaction() as conn:
            view = await self._owned_view(actor_user_id=actor.actor_id, view_id=view_id, conn=conn, for_update=True)
            await self._authorize(capability_id=view.capability_id, actor=actor)
            self._require_expected_revision(view=view, expected_revision=expected_revision)
            await self._write_audit(action="delete", actor_user_id=actor.actor_id, view=view, conn=conn)
            await PlatformSavedView.filter(id=view.id).using_db(conn).delete()

    async def _authorize(self, *, capability_id: str, actor: PlatformSessionPrincipal) -> CapabilityDefinition:
        capability = require_capability(capability_id)
        for permission_code in capability.required_permissions:
            try:
                await ensure_platform_permission(
                    permission_code=permission_code, principal=actor, repository=self._identity_repository
                )
            except Forbidden as exc:
                raise Forbidden(
                    error="PLATFORM_SAVED_VIEW_CAPABILITY_UNAUTHORIZED",
                    meta={"capability_id": capability_id, "permission_code": str(permission_code)},
                ) from exc
        return capability

    async def _read_out(self, *, view: PlatformSavedView, actor: PlatformSessionPrincipal) -> PlatformSavedViewReadOut:
        stored = self._to_out(view)
        capability = get_capability(view.capability_id)
        if capability is None:
            return PlatformSavedViewReadOut(
                view=stored,
                applicable=False,
                omissions=(
                    PlatformSavedViewOmission(kind="capability", code=view.capability_id, reason="unavailable"),
                ),
                effective=None,
            )
        if not await self._has_capability_access(capability=capability, actor=actor):
            return PlatformSavedViewReadOut(
                view=stored,
                applicable=False,
                omissions=tuple(
                    PlatformSavedViewOmission(kind="capability", code=str(permission), reason="unauthorized")
                    for permission in capability.required_permissions
                ),
                effective=None,
            )

        effective, omissions = effective_draft(view=view, capability=capability)
        return PlatformSavedViewReadOut(
            view=stored,
            applicable=not omissions,
            omissions=omissions,
            effective=effective,
        )

    async def _has_capability_access(
        self, *, capability: CapabilityDefinition, actor: PlatformSessionPrincipal
    ) -> bool:
        try:
            for permission_code in capability.required_permissions:
                await ensure_platform_permission(
                    permission_code=permission_code, principal=actor, repository=self._identity_repository
                )
        except Forbidden:
            return False
        return True

    async def _owned_view(
        self, *, actor_user_id: UUID, view_id: UUID, conn=None, for_update: bool = False
    ) -> PlatformSavedView:
        query = PlatformSavedView.filter(id=view_id, actor_user_id=actor_user_id)
        if conn is not None:
            query = query.using_db(conn)
        if for_update:
            query = query.select_for_update()
        view = await query.first()
        if view is None:
            raise NotFound(error="PLATFORM_SAVED_VIEW_NOT_FOUND")
        return view

    @staticmethod
    def _require_expected_revision(*, view: PlatformSavedView, expected_revision: int) -> None:
        if view.revision != expected_revision:
            raise Conflict(error="PLATFORM_SAVED_VIEW_REVISION_CONFLICT", meta={"actual_revision": view.revision})

    @staticmethod
    def _storage_values(draft: PlatformSavedViewDraft) -> dict[str, object]:
        return {
            "name": draft.name,
            "filter_schema_revision": draft.filter_schema_revision,
            "column_schema_revision": draft.column_schema_revision,
            "filters": [item.model_dump(mode="json") for item in draft.filters],
            "ordering": draft.ordering.model_dump(mode="json"),
            "visible_columns": list(draft.visible_columns),
            "column_order": list(draft.column_order),
            "density": draft.density,
        }

    @staticmethod
    def _to_out(view: PlatformSavedView) -> PlatformSavedViewOut:
        return PlatformSavedViewOut.model_validate(view)

    async def _write_audit(self, *, action: str, actor_user_id: UUID, view: PlatformSavedView, conn) -> None:
        await write_required_activity_event(
            settings=self._settings,
            payload=ActivityAuditPayload(
                event_name=_AUDIT_EVENTS[action],
                actor_user_id=actor_user_id,
                entity_type="platform_saved_view",
                entity_id=view.id,
                properties={"capabilityId": view.capability_id, "revision": view.revision},
            ),
            conn=conn,
        )
