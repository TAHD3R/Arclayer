from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import time
from typing import Any, Protocol, cast
from uuid import UUID

import httpx

from src.common.protocols.tortoise import HasWorkspaceId
from src.common.services import BaseService
from src.config import Settings
from src.core.exceptions import BadRequest, ServiceUnavailable
from src.core.i18n import t
from src.core.logging import get_logger
from src.models.integrations.webhook_delivery import WebhookDelivery
from src.models.integrations.webhook_subscription import WebhookSubscription
from src.modules.workspaces.settings.integrations.webhooks.repository import WebhooksRepository
from src.modules.workspaces.settings.integrations.webhooks.schema import (
    WebhookDeliveryOut,
    WebhookSubscriptionOut,
)
from src.settings.crypto import (
    decrypt_secret,
    encrypt_secret,
    ensure_master_key,
    is_encrypted,
    master_key_exists,
)
from src.settings.scopes import SCOPE_TYPE_WORKSPACE

logger = get_logger(__name__)

SIGNATURE_HEADER = "X-Arclayer-Signature"
TIMESTAMP_HEADER = "X-Arclayer-Timestamp"
EVENT_HEADER = "X-Arclayer-Event"

DEFAULT_WEBHOOK_TIMEOUT_S = 3.0


class _HasSubscriptionId(Protocol):
    subscription_id: UUID


class WebhooksService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = WebhooksRepository()

    async def list_subscriptions(self, *, workspace_id: UUID) -> list[WebhookSubscription]:
        return await self.repo.list_subscriptions(workspace_id=workspace_id)

    async def list_subscriptions_out(self, *, workspace_id: UUID) -> list[WebhookSubscriptionOut]:
        rows = await self.list_subscriptions(workspace_id=workspace_id)
        return [self._to_subscription_out(r) for r in rows]

    async def create_subscription(
        self,
        *,
        workspace_id: UUID,
        capability_id: str | None,
        event: str,
        endpoint_url: str,
        enabled: bool,
        secret: str | None,
    ) -> WebhookSubscription:
        normalized_event = str(event or "").strip()
        if not normalized_event:
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="WEBHOOK_EVENT_REQUIRED")

        encrypted_secret = await self._encrypt_secret_if_needed(
            workspace_id=workspace_id,
            event=normalized_event,
            endpoint_url=endpoint_url,
            secret=secret,
        )
        return await self.repo.create_subscription(
            workspace_id=workspace_id,
            capability_id=(str(capability_id).strip() if capability_id else None),
            event=normalized_event,
            endpoint_url=endpoint_url,
            enabled=bool(enabled),
            secret=encrypted_secret,
        )

    async def create_subscription_out(
        self,
        *,
        workspace_id: UUID,
        capability_id: str | None,
        event: str,
        endpoint_url: str,
        enabled: bool,
        secret: str | None,
    ) -> WebhookSubscriptionOut:
        row = await self.create_subscription(
            workspace_id=workspace_id,
            capability_id=capability_id,
            event=event,
            endpoint_url=endpoint_url,
            enabled=enabled,
            secret=secret,
        )
        return self._to_subscription_out(row)

    async def list_deliveries_out(self, *, workspace_id: UUID, limit: int) -> list[WebhookDeliveryOut]:
        rows = await self.repo.list_deliveries(workspace_id=workspace_id, limit=limit)
        return [self._to_delivery_out(r) for r in rows]

    def emit_workspace_event_fire_and_forget(
        self,
        *,
        workspace_id: UUID,
        event: str,
        payload: dict[str, Any],
    ) -> None:
        asyncio.create_task(self._emit_workspace_event(workspace_id=workspace_id, event=event, payload=payload))

    async def _emit_workspace_event(self, *, workspace_id: UUID, event: str, payload: dict[str, Any]) -> None:
        subs = await self.repo.list_enabled_subscriptions(workspace_id=workspace_id, event=event)
        if not subs:
            return
        for sub in subs:
            await self._deliver_one(subscription=sub, event=event, payload=payload)

    async def _deliver_one(
        self,
        *,
        subscription: WebhookSubscription,
        event: str,
        payload: dict[str, Any],
    ) -> None:
        started = time.perf_counter()
        body, headers = await self._build_request(subscription=subscription, event=event, payload=payload)
        status, response_code, error = await self._send_request(
            endpoint_url=str(subscription.endpoint_url),
            body=body,
            headers=headers,
        )
        duration_ms = int((time.perf_counter() - started) * 1000)
        await self._write_delivery_log(
            subscription_id=UUID(str(subscription.id)),
            event=event,
            status=status,
            response_code=response_code,
            error=error,
            duration_ms=duration_ms,
        )

        if status != "success":
            logger.warning(
                "Webhook delivery failed",
                action="webhook_delivery_failed",
                event_name=event,
                subscription_id=str(subscription.id),
                error=error,
            )

    async def _build_request(
        self,
        *,
        subscription: WebhookSubscription,
        event: str,
        payload: dict[str, Any],
    ) -> tuple[bytes, dict[str, str]]:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str).encode("utf-8")
        timestamp = str(int(time.time()))
        headers: dict[str, str] = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            TIMESTAMP_HEADER: timestamp,
            EVENT_HEADER: event,
        }

        secret = await self._decrypt_secret_best_effort(subscription, aad=self._build_aad(subscription))
        if secret:
            headers[SIGNATURE_HEADER] = _sign(secret=secret, timestamp=timestamp, body=body)
        return body, headers

    async def _send_request(
        self,
        *,
        endpoint_url: str,
        body: bytes,
        headers: dict[str, str],
    ) -> tuple[str, int | None, str | None]:
        try:
            async with httpx.AsyncClient(timeout=DEFAULT_WEBHOOK_TIMEOUT_S) as client:
                resp = await client.post(endpoint_url, content=body, headers=headers)
            code = int(resp.status_code)
            if 200 <= code < 300:
                return "success", code, None
            return "failed", code, f"HTTP_{code}"
        except httpx.HTTPError as exc:
            return "failed", None, str(exc)

    async def _write_delivery_log(
        self,
        *,
        subscription_id: UUID,
        event: str,
        status: str,
        response_code: int | None,
        error: str | None,
        duration_ms: int | None,
    ) -> None:
        try:
            await self.repo.create_delivery(
                subscription_id=subscription_id,
                event=event,
                status=status,
                response_code=response_code,
                error=error,
                duration_ms=duration_ms,
            )
        except Exception as exc:
            logger.warning(
                "Webhook delivery log write failed",
                action="webhook_delivery_log_write",
                event_name=event,
                subscription_id=str(subscription_id),
                error=str(exc),
            )

    async def _encrypt_secret_if_needed(
        self,
        *,
        workspace_id: UUID,
        event: str,
        endpoint_url: str,
        secret: str | None,
    ) -> str | None:
        raw = (secret or "").strip()
        if not raw:
            return None
        if is_encrypted(raw):
            return raw

        key_path = self.settings.security.master_key_path
        if not master_key_exists(key_path):
            raise ServiceUnavailable(
                message=t("settings", "MASTER_KEY_MISSING"),
                error="MASTER_KEY_MISSING",
            )
        key, _fp = ensure_master_key(key_path)

        aad = f"{SCOPE_TYPE_WORKSPACE}:{workspace_id}:webhook:{event}:{endpoint_url}"
        return encrypt_secret(raw, key=key, aad=aad)

    async def _decrypt_secret_best_effort(self, sub: WebhookSubscription, *, aad: str) -> str | None:
        raw = (sub.secret or "").strip()
        if not raw:
            return None
        if not is_encrypted(raw):
            return raw
        key_path = self.settings.security.master_key_path
        if not master_key_exists(key_path):
            return None
        key, _fp = ensure_master_key(key_path)
        try:
            return decrypt_secret(raw, key=key, aad=aad)
        except Exception as exc:
            logger.warning(
                "Webhook secret decrypt failed",
                action="webhook_secret_decrypt_failed",
                subscription_id=str(sub.id),
                error=str(exc),
            )
            return None

    @staticmethod
    def _build_aad(sub: WebhookSubscription) -> str:
        workspace_id = cast(HasWorkspaceId, sub).workspace_id
        return f"{SCOPE_TYPE_WORKSPACE}:{workspace_id}:webhook:{sub.event}:{sub.endpoint_url}"

    @staticmethod
    def _to_subscription_out(row: WebhookSubscription) -> WebhookSubscriptionOut:
        return WebhookSubscriptionOut(
            id=row.id,
            capability_id=row.capability_id,
            event=row.event,
            endpoint_url=row.endpoint_url,
            enabled=bool(row.enabled),
            created_at=row.created_at,
        )

    @staticmethod
    def _to_delivery_out(row: WebhookDelivery) -> WebhookDeliveryOut:
        return WebhookDeliveryOut(
            id=row.id,
            subscription_id=cast(_HasSubscriptionId, row).subscription_id,
            event=row.event,
            status=row.status,
            response_code=row.response_code,
            error=row.error,
            duration_ms=row.duration_ms,
            created_at=row.created_at,
        )


def _sign(*, secret: str, timestamp: str, body: bytes) -> str:
    msg = timestamp.encode("utf-8") + b"." + body
    digest = hmac.new(secret.encode("utf-8"), msg=msg, digestmod=hashlib.sha256).hexdigest()
    return f"sha256={digest}"
