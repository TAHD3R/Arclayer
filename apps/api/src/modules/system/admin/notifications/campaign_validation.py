from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Protocol
from urllib.parse import urlsplit
from uuid import UUID

from src.config import Settings
from src.core.exceptions import BadRequest
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.system.email_template import EmailTemplateRecord
from src.models.system.notification_campaign import (
    NotificationCampaignChannel,
    NotificationCampaignRecord,
    NotificationCampaignVariantRecord,
    NotificationPresentation,
)
from src.modules.system.admin.notifications.campaign_assets import CampaignAssetReader
from src.modules.system.admin.notifications.campaign_contracts import (
    NotificationAction,
    NotificationActionKind,
    NotificationBannerPayload,
    NotificationEmailPayload,
    NotificationInboxPayload,
    NotificationMedia,
    NotificationMediaKind,
    NotificationModalPayload,
    NotificationToastPayload,
)


class CampaignEmailTemplateReader(Protocol):
    async def get_templates(
        self, identities: Sequence[tuple[str, str]]
    ) -> dict[tuple[str, str], EmailTemplateRecord]: ...


class NotificationCampaignEmailTemplateRepository(TortoiseORMRepository[EmailTemplateRecord]):
    async def get_templates(
        self,
        identities: Sequence[tuple[str, str]],
    ) -> dict[tuple[str, str], EmailTemplateRecord]:
        rows: dict[tuple[str, str], EmailTemplateRecord] = {}
        for key, locale in identities:
            record = await EmailTemplateRecord.filter(key=key, locale=locale).first()
            if record is not None:
                rows[(key, locale)] = record
        return rows


async def validate_campaign_for_publish(
    *,
    campaign: NotificationCampaignRecord,
    variants: Sequence[NotificationCampaignVariantRecord],
    settings: Settings,
    assets: CampaignAssetReader,
    templates: CampaignEmailTemplateReader,
) -> None:
    _validate_campaign_shape(campaign=campaign, variants=variants)
    payloads = [_parse_variant(row) for row in variants]
    allowed_hosts = _allowed_action_hosts(settings)
    media: list[NotificationMedia] = []
    email_identities: list[tuple[str, str]] = []
    for locale, payload in payloads:
        actions, variant_media = _variant_actions_and_media(payload)
        for action in actions:
            _validate_action_host(action, allowed_hosts=allowed_hosts)
        media.extend(variant_media)
        email = payload.get(NotificationPresentation.EMAIL)
        if isinstance(email, NotificationEmailPayload):
            email_identities.append((email.template_key, locale))
    await _validate_media(media, assets=assets)
    await _validate_email_templates(email_identities, payloads=payloads, templates=templates)


def _validate_campaign_shape(
    *,
    campaign: NotificationCampaignRecord,
    variants: Sequence[NotificationCampaignVariantRecord],
) -> None:
    channels = set(campaign.channels or ())
    presentations = set(campaign.presentations or ())
    if not channels or not presentations:
        raise BadRequest(error="NOTIFICATION_CAMPAIGN_CHANNELS_REQUIRED")
    if not variants:
        raise BadRequest(error="NOTIFICATION_CAMPAIGN_VARIANTS_REQUIRED")
    if not campaign.fallback_locale or campaign.fallback_locale not in {row.locale for row in variants}:
        raise BadRequest(error="NOTIFICATION_CAMPAIGN_FALLBACK_LOCALE_REQUIRED")
    if NotificationPresentation.EMAIL in presentations and NotificationCampaignChannel.EMAIL not in channels:
        raise BadRequest(error="NOTIFICATION_CAMPAIGN_EMAIL_CHANNEL_REQUIRED")
    in_app_presentations = presentations - {NotificationPresentation.EMAIL}
    if in_app_presentations and NotificationCampaignChannel.IN_APP not in channels:
        raise BadRequest(error="NOTIFICATION_CAMPAIGN_IN_APP_CHANNEL_REQUIRED")
    for row in variants:
        present = {presentation for presentation, value in _parse_variant(row)[1].items() if value is not None}
        missing = presentations - present
        if missing:
            raise BadRequest(
                error="NOTIFICATION_CAMPAIGN_VARIANT_PRESENTATION_MISSING",
                meta={"locale": row.locale, "presentations": sorted(str(item) for item in missing)},
            )


def _parse_variant(
    row: NotificationCampaignVariantRecord,
) -> tuple[str, dict[NotificationPresentation, Any | None]]:
    return (
        str(row.locale),
        {
            NotificationPresentation.INBOX: _parse(NotificationInboxPayload, row.inbox_payload),
            NotificationPresentation.EMAIL: _parse(NotificationEmailPayload, row.email_payload),
            NotificationPresentation.MODAL: _parse(NotificationModalPayload, row.modal_payload),
            NotificationPresentation.BANNER: _parse(NotificationBannerPayload, row.banner_payload),
            NotificationPresentation.TOAST: _parse(NotificationToastPayload, row.toast_payload),
        },
    )


def _variant_actions_and_media(
    payloads: dict[NotificationPresentation, Any | None],
) -> tuple[list[NotificationAction], list[NotificationMedia]]:
    actions: list[NotificationAction] = []
    media: list[NotificationMedia] = []
    inbox = payloads[NotificationPresentation.INBOX]
    if inbox and inbox.action:
        actions.append(inbox.action)
    modal = payloads[NotificationPresentation.MODAL]
    if modal:
        actions.append(modal.primary_action)
        if modal.secondary_action:
            actions.append(modal.secondary_action)
        if modal.media:
            media.append(modal.media)
    for presentation in (NotificationPresentation.BANNER, NotificationPresentation.TOAST):
        payload = payloads[presentation]
        if payload and payload.action:
            actions.append(payload.action)
    return actions, media


def _allowed_action_hosts(settings: Settings) -> frozenset[str]:
    admin_host = urlsplit(settings.saas.admin_url).hostname
    configured = {host.strip().lower() for host in settings.saas.notification_external_action_hosts if host.strip()}
    if admin_host:
        configured.add(admin_host.lower())
    return frozenset(configured)


def _validate_action_host(action: NotificationAction, *, allowed_hosts: frozenset[str]) -> None:
    if action.kind != NotificationActionKind.EXTERNAL_HTTPS:
        return
    host = (urlsplit(action.target).hostname or "").lower()
    if host not in allowed_hosts:
        raise BadRequest(
            error="NOTIFICATION_EXTERNAL_ACTION_HOST_NOT_ALLOWED",
            meta={"host": host},
        )


async def _validate_media(media: Sequence[NotificationMedia], *, assets: CampaignAssetReader) -> None:
    asset_ids = {
        UUID(str(asset_id))
        for item in media
        for asset_id in (item.asset_id, item.poster_asset_id, item.captions_asset_id)
        if asset_id is not None
    }
    records = await assets.get_publishable_assets(sorted(asset_ids, key=lambda item: item.int))
    missing = asset_ids - records.keys()
    if missing:
        raise BadRequest(
            error="NOTIFICATION_CAMPAIGN_MEDIA_UNAVAILABLE",
            meta={"assetIds": [str(item) for item in sorted(missing, key=lambda item: item.int)]},
        )
    for item in media:
        record = records[UUID(str(item.asset_id))]
        expected_prefix = "image/" if item.kind == NotificationMediaKind.IMAGE else "video/"
        if not str(record.mime or "").startswith(expected_prefix):
            raise BadRequest(error="NOTIFICATION_CAMPAIGN_MEDIA_TYPE_INVALID")
        if item.poster_asset_id and not str(records[UUID(str(item.poster_asset_id))].mime or "").startswith("image/"):
            raise BadRequest(error="NOTIFICATION_CAMPAIGN_MEDIA_POSTER_INVALID")
        if item.captions_asset_id and records[UUID(str(item.captions_asset_id))].mime != "text/vtt":
            raise BadRequest(error="NOTIFICATION_CAMPAIGN_MEDIA_CAPTIONS_INVALID")


async def _validate_email_templates(
    identities: Sequence[tuple[str, str]],
    *,
    payloads: Sequence[tuple[str, dict[NotificationPresentation, Any | None]]],
    templates: CampaignEmailTemplateReader,
) -> None:
    records = await templates.get_templates(identities)
    for locale, variant_payloads in payloads:
        email = variant_payloads[NotificationPresentation.EMAIL]
        if not isinstance(email, NotificationEmailPayload):
            continue
        record = records.get((email.template_key, locale))
        if record is None or not record.is_enabled or int(record.version) != email.template_version:
            raise BadRequest(
                error="NOTIFICATION_CAMPAIGN_EMAIL_TEMPLATE_INVALID",
                meta={"locale": locale, "templateKey": email.template_key, "templateVersion": email.template_version},
            )


def _parse(schema: type[Any], value: Any | None) -> Any | None:
    return schema.model_validate(value) if value is not None else None
