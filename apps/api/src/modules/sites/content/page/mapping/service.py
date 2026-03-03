from __future__ import annotations

from typing import Literal, cast
from uuid import UUID

from apps.api.src.common.protocols.tortoise import HasParentId
from apps.api.src.models.organization.user import User
from apps.api.src.modules.sites.schema import SitePageTreeNodeOut, SitePageUserSummaryOut


def _as_visibility(value: str) -> Literal["public", "private"]:
    return cast(Literal["public", "private"], value)


def _get_parent_id(value: object) -> UUID | None:
    raw = cast(HasParentId, value).parent_id
    return UUID(str(raw)) if raw is not None else None


def _get_updated_by_user_id(value: object) -> UUID | None:
    raw = getattr(value, "updated_by_user_id", None)
    return UUID(str(raw)) if raw is not None else None


class PageNodeMapper:
    async def load_page_user_summaries(
        self,
        *,
        user_ids: set[UUID],
    ) -> dict[UUID, SitePageUserSummaryOut]:
        if not user_ids:
            return {}

        rows = await User.filter(id__in=list(user_ids)).values("id", "display_name", "email", "avatar_url")
        out: dict[UUID, SitePageUserSummaryOut] = {}
        for row in rows:
            raw_id = row.get("id")
            if raw_id is None:
                continue
            user_id = UUID(str(raw_id))
            out[user_id] = SitePageUserSummaryOut(
                id=user_id,
                display_name=(str(row.get("display_name")) if row.get("display_name") is not None else None),
                email=(str(row.get("email")) if row.get("email") is not None else None),
                avatar_url=(str(row.get("avatar_url")) if row.get("avatar_url") is not None else None),
            )
        return out

    def to_page_tree_node(
        self,
        *,
        page,
        user_summary_by_id: dict[UUID, SitePageUserSummaryOut],
    ) -> SitePageTreeNodeOut:
        updated_by_user_id = _get_updated_by_user_id(page)
        return SitePageTreeNodeOut(
            id=UUID(str(page.id)),
            title=(page.title if isinstance(page.title, str) else None),
            description=(page.description if isinstance(page.description, str) else None),
            path=page.path,
            parent_id=_get_parent_id(page),
            sort_order=int(page.sort_order or 0),
            visibility=_as_visibility(str(page.visibility)),
            draft_revision=int(page.draft_rev or 0),
            published_revision=(int(page.published_rev) if page.published_rev is not None else None),
            updated_at=page.updated_at,
            updated_by=(user_summary_by_id.get(updated_by_user_id) if updated_by_user_id is not None else None),
            children=[],
        )
