from __future__ import annotations

from typing import Any
from uuid import UUID

from src.core.exceptions import Conflict
from src.models.system.notification_campaign import NotificationCampaignRecord, NotificationCampaignState
from src.modules.system.admin.notifications.campaign_contracts import (
    NotificationAudienceRule,
    NotificationCampaignCreateRequest,
    NotificationCampaignEditableFields,
    NotificationCampaignPatchRequest,
    NotificationCampaignVariantInput,
)
from src.modules.system.admin.notifications.campaign_projection import variant_input_to_record_data

_EDITABLE_FIELDS = (
    "name",
    "internal_description",
    "audience",
    "timezone",
    "display_start_at",
    "display_end_at",
    "priority",
    "conflict_policy",
    "channels",
    "presentations",
    "fallback_locale",
    "variants",
)


def campaign_record_data(
    payload: NotificationCampaignCreateRequest,
    *,
    actor_user_id: UUID,
) -> dict[str, Any]:
    return {"owner_user_id": actor_user_id, "revision": 1, **campaign_update_data(payload)}


def campaign_update_data(payload: NotificationCampaignEditableFields) -> dict[str, Any]:
    return {
        "name": payload.name,
        "internal_description": payload.internal_description,
        "audience": payload.audience.model_dump(mode="json", by_alias=True),
        "timezone": payload.timezone,
        "display_start_at": payload.display_start_at,
        "display_end_at": payload.display_end_at,
        "priority": payload.priority,
        "conflict_policy": payload.conflict_policy,
        "channels": [str(item) for item in payload.channels],
        "presentations": [str(item) for item in payload.presentations],
        "fallback_locale": payload.fallback_locale,
    }


def variant_record_data(
    variants: tuple[NotificationCampaignVariantInput, ...],
    *,
    fallback_locale: str | None,
    revision: int,
) -> list[dict[str, Any]]:
    return [variant_input_to_record_data(item, fallback_locale=fallback_locale, revision=revision) for item in variants]


def editable_campaign_from_record(
    campaign: NotificationCampaignRecord,
    *,
    variants: list[Any],
) -> NotificationCampaignEditableFields:
    return NotificationCampaignEditableFields(
        name=campaign.name,
        internal_description=campaign.internal_description,
        audience=NotificationAudienceRule.model_validate(campaign.audience),
        timezone=campaign.timezone,
        display_start_at=campaign.display_start_at,
        display_end_at=campaign.display_end_at,
        priority=campaign.priority,
        conflict_policy=campaign.conflict_policy,
        channels=tuple(campaign.channels or ()),
        presentations=tuple(campaign.presentations or ()),
        fallback_locale=campaign.fallback_locale,
        variants=tuple(
            NotificationCampaignVariantInput(
                locale=row.locale,
                inbox=row.inbox_payload,
                email=row.email_payload,
                modal=row.modal_payload,
                banner=row.banner_payload,
                toast=row.toast_payload,
            )
            for row in variants
        ),
    )


def merge_campaign_patch(
    current: NotificationCampaignEditableFields,
    patch: NotificationCampaignPatchRequest,
) -> NotificationCampaignEditableFields:
    data = current.model_dump()
    for field in patch.model_fields_set - {"expected_revision"}:
        data[field] = getattr(patch, field)
    return NotificationCampaignEditableFields.model_validate(data)


def changed_campaign_fields(
    current: NotificationCampaignEditableFields,
    merged: NotificationCampaignEditableFields,
) -> list[str]:
    before = current.model_dump(mode="json")
    after = merged.model_dump(mode="json")
    return [field for field in _EDITABLE_FIELDS if before[field] != after[field]]


def require_campaign_revision(campaign: NotificationCampaignRecord, expected_revision: int) -> None:
    if int(campaign.revision) != expected_revision:
        raise Conflict(
            error="NOTIFICATION_CAMPAIGN_REVISION_CONFLICT",
            meta={"expectedRevision": expected_revision, "currentRevision": int(campaign.revision)},
        )


def require_draft_campaign(campaign: NotificationCampaignRecord) -> None:
    if campaign.state != NotificationCampaignState.DRAFT:
        raise Conflict(error="NOTIFICATION_CAMPAIGN_NOT_DRAFT")
