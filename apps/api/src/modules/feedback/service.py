from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime
from hashlib import sha256
from typing import TypedDict
from uuid import UUID

import orjson
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q

from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.http.pagination import PageData, PageParams
from src.core.i18n import t
from src.core.services import BaseService
from src.models.feedback.feedback import (
    FeedbackCategory,
    FeedbackIntent,
    FeedbackMessage,
    FeedbackMessageKind,
    FeedbackPriority,
    FeedbackSource,
    FeedbackStatus,
    FeedbackTicket,
)
from src.models.organization.user import User
from src.models.projects.project import ProjectRecord
from src.models.system.notification import NotificationCategory, NotificationRecord
from src.models.system.notification_campaign import (
    NotificationCampaignChannel,
    NotificationDeliveryRecord,
    NotificationDeliverySourceKind,
    NotificationDeliveryState,
    NotificationPresentation,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.analytics.ingest.service import sanitize_properties
from src.modules.auth.repository import UserRepository
from src.modules.feedback.schema import (
    FeedbackMessageCreate,
    FeedbackMessageOut,
    FeedbackOrdering,
    FeedbackSubmitRequest,
    FeedbackTicketDetailOut,
    FeedbackTicketListItemOut,
    FeedbackTicketUpdate,
    FeedbackUserOut,
    project_feedback_context_type,
)
from src.modules.platform_identity.repository import PlatformIdentityRepository
from src.modules.system.admin.notifications.catalog import (
    NotificationRecordCreateDisposition,
    create_notification_record,
)
from src.modules.system.admin.notifications.schema import NotificationFeedbackTicketTarget
from src.modules.workspaces.http.service import resolve_workspace_context_by_id

_GLOBAL_NOTIFICATION_WORKSPACE_ID = UUID(int=0)
_FEEDBACK_REPLY_EVENT_NAME = "feedback.ticket.reply"


class _FeedbackReplyDelivery(TypedDict):
    state: NotificationDeliveryState
    failure_code: str | None
    is_retryable: bool


def _user_out(user: User) -> FeedbackUserOut:
    return FeedbackUserOut(
        id=user.id,
        email=user.email,
        username=user.username,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        status=str(user.status),
        last_login_at=user.last_login_at,
        created_at=user.created_at,
    )


def _ticket_reporter_out(ticket: FeedbackTicket, user: User | None) -> FeedbackUserOut:
    if user is not None:
        return _user_out(user)
    return FeedbackUserOut(
        id=ticket.reporter_user_id,
        email=ticket.reporter_email,
        username=ticket.reporter_username,
        display_name=ticket.reporter_display_name,
        avatar_url=ticket.reporter_avatar_url,
        status="unknown",
        last_login_at=None,
        created_at=ticket.created_at,
    )


def _message_author_out(message: FeedbackMessage, user: User | None) -> FeedbackUserOut:
    if user is not None:
        return _user_out(user)
    return FeedbackUserOut(
        id=message.author_user_id,
        email=message.author_email,
        username=message.author_username,
        display_name=message.author_display_name,
        avatar_url=message.author_avatar_url,
        status="unknown",
        last_login_at=None,
        created_at=message.created_at,
    )


def _message_out(
    message: FeedbackMessage,
    user: User | None,
    delivery: _FeedbackReplyDelivery | None,
) -> FeedbackMessageOut:
    return FeedbackMessageOut(
        id=message.id,
        kind=message.kind,
        body=message.body,
        author=_message_author_out(message, user),
        delivery_state=delivery["state"] if delivery is not None else None,
        delivery_failure_code=delivery["failure_code"] if delivery is not None else None,
        delivery_is_retryable=delivery["is_retryable"] if delivery is not None else None,
        created_at=message.created_at,
    )


async def _is_platform_assignee_eligible(
    *,
    user_id: UUID,
    repository: PlatformIdentityRepository,
    conn: BaseDBAsyncClient,
) -> bool:
    if await repository.is_instance_owner(user_id=user_id, conn=conn):
        return True
    return await repository.get_active_operator_by_user_id(user_id=user_id, conn=conn) is not None


class FeedbackService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        user_repository: UserRepository | None = None,
        platform_identity_repository: PlatformIdentityRepository | None = None,
    ) -> None:
        super().__init__(settings)
        self._settings = settings
        self._user_repository = user_repository or UserRepository()
        self._platform_identity_repository = platform_identity_repository or PlatformIdentityRepository()

    async def _resolve_scope(
        self,
        *,
        payload: FeedbackSubmitRequest,
        user_id: UUID,
    ) -> tuple[UUID | None, UUID | None]:
        workspace_id = payload.workspace_id
        project_id = payload.project_id
        if project_id is not None:
            project = await ProjectRecord.get_or_none(id=project_id, is_active=True)
            if project is None:
                raise NotFound(
                    message=t("errors", "FEEDBACK_PROJECT_NOT_FOUND"),
                    error="FEEDBACK_PROJECT_NOT_FOUND",
                )
            resolved_workspace_id = UUID(str(project.workspace_id))
            if workspace_id is not None and UUID(str(workspace_id)) != resolved_workspace_id:
                raise BadRequest(
                    message=t("errors", "FEEDBACK_SCOPE_MISMATCH"),
                    error="FEEDBACK_SCOPE_MISMATCH",
                )
            workspace_id = resolved_workspace_id
        if workspace_id is not None:
            await resolve_workspace_context_by_id(workspace_id=workspace_id, user_id=user_id)
        return workspace_id, project_id

    async def submit(self, *, payload: FeedbackSubmitRequest, reporter: User) -> FeedbackTicketDetailOut:
        workspace_id, project_id = await self._resolve_scope(payload=payload, user_id=reporter.id)
        audit = self._settings.analytics.audit_log
        safe_context = sanitize_properties(
            payload.context,
            max_keys=audit.max_property_keys,
            max_string_length=audit.max_string_length,
            max_depth=audit.max_depth,
        )
        if not isinstance(safe_context, dict) or safe_context != payload.context:
            raise BadRequest(
                message=t("errors", "FEEDBACK_CONTEXT_INVALID"),
                error="FEEDBACK_CONTEXT_INVALID",
            )
        fingerprint_payload = payload.model_dump(mode="json", by_alias=True)
        fingerprint_payload["workspaceId"] = str(workspace_id) if workspace_id is not None else None
        fingerprint_payload["projectId"] = str(project_id) if project_id is not None else None
        fingerprint_payload["context"] = safe_context
        fingerprint = sha256(orjson.dumps(fingerprint_payload, option=orjson.OPT_SORT_KEYS)).hexdigest()
        now = datetime.now(UTC)
        async with self.tx() as conn:
            ticket, created = await FeedbackTicket.get_or_create(
                reporter_user_id=reporter.id,
                client_request_id=payload.client_request_id,
                using_db=conn,
                defaults={
                    "submission_fingerprint": fingerprint,
                    "reporter_email": reporter.email,
                    "reporter_username": reporter.username,
                    "reporter_display_name": reporter.display_name,
                    "reporter_avatar_url": reporter.avatar_url,
                    "workspace_id": workspace_id,
                    "project_id": project_id,
                    "source": payload.source,
                    "context_type": payload.context_type,
                    "intent": payload.intent,
                    "message": payload.message,
                    "rating": payload.rating,
                    "context_url": payload.context_url,
                    "context": safe_context,
                    "last_activity_at": now,
                },
            )
            if not created and ticket.submission_fingerprint != fingerprint:
                raise Conflict(
                    message=t("errors", "FEEDBACK_IDEMPOTENCY_CONFLICT"),
                    error="FEEDBACK_IDEMPOTENCY_CONFLICT",
                )
            if created:
                await write_required_activity_event(
                    settings=self._settings,
                    conn=conn,
                    payload=ActivityAuditPayload(
                        event_name="feedback.submitted",
                        actor_user_id=reporter.id,
                        workspace_id=workspace_id,
                        entity_type="feedback_ticket",
                        entity_id=ticket.id,
                        properties={"source": str(payload.source), "intent": str(payload.intent)},
                    ),
                )
        return await self.get_detail(ticket_id=ticket.id, include_internal_notes=False, reporter_user_id=reporter.id)

    async def _user_map(self, ids: set[UUID]) -> dict[UUID, User]:
        if not ids:
            return {}
        users = await self._user_repository.list_by_ids(list(ids))
        return {UUID(str(user.id)): user for user in users}

    async def _list_page(
        self,
        *,
        query,
        params: PageParams,
        ordering: FeedbackOrdering = FeedbackOrdering.LAST_ACTIVITY_DESC,
    ) -> PageData[FeedbackTicketListItemOut]:
        total = int(await query.count())
        order_fields = [str(ordering)]
        if str(ordering).lstrip("-") != "created_at":
            order_fields.append("-created_at")
        rows = await query.order_by(*order_fields).limit(params.limit).offset(params.offset)
        ticket_ids = [row.id for row in rows]
        message_ids = await FeedbackMessage.filter(ticket_id__in=ticket_ids).values_list("ticket_id", flat=True)
        message_counts = Counter(UUID(str(ticket_id)) for ticket_id in message_ids)
        user_ids = {UUID(str(row.reporter_user_id)) for row in rows}
        user_ids.update(UUID(str(row.assigned_to_user_id)) for row in rows if row.assigned_to_user_id is not None)
        users = await self._user_map(user_ids)
        items = [
            FeedbackTicketListItemOut(
                id=row.id,
                client_request_id=row.client_request_id,
                source=row.source,
                context_type=project_feedback_context_type(row.context_type),
                intent=row.intent,
                legacy_category=row.category,
                message_preview=row.message[:240],
                rating=row.rating,
                status=row.status,
                priority=row.priority,
                revision=row.revision,
                workspace_id=row.workspace_id,
                project_id=row.project_id,
                reporter=_ticket_reporter_out(row, users.get(UUID(str(row.reporter_user_id)))),
                assignee=(
                    _user_out(users[UUID(str(row.assigned_to_user_id))])
                    if row.assigned_to_user_id is not None and UUID(str(row.assigned_to_user_id)) in users
                    else None
                ),
                message_count=message_counts.get(UUID(str(row.id)), 0),
                last_activity_at=row.last_activity_at,
                first_response_at=row.first_response_at,
                resolved_at=row.resolved_at,
                closed_at=row.closed_at,
                created_at=row.created_at,
                updated_at=row.updated_at,
            )
            for row in rows
        ]
        pages = (total + params.size - 1) // params.size if total else 0
        return PageData(
            items=items,
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=params.page + 1 if params.page < pages else None,
            prev=params.page - 1 if params.page > 1 and pages else None,
        )

    async def list_mine(self, *, reporter_user_id: UUID, params: PageParams) -> PageData[FeedbackTicketListItemOut]:
        return await self._list_page(
            query=FeedbackTicket.filter(reporter_user_id=reporter_user_id),
            params=params,
        )

    async def list_system(
        self,
        *,
        params: PageParams,
        status: FeedbackStatus | None,
        priority: FeedbackPriority | None,
        source: FeedbackSource | None,
        intent: FeedbackIntent | None,
        legacy_category: FeedbackCategory | None,
        workspace_id: UUID | None,
        project_id: UUID | None,
        assignee_user_id: UUID | None,
        reporter_user_id: UUID | None,
        created_from: datetime | None,
        created_to: datetime | None,
        activity_from: datetime | None,
        activity_to: datetime | None,
        ordering: FeedbackOrdering,
        search: str | None,
    ) -> PageData[FeedbackTicketListItemOut]:
        query = FeedbackTicket.all()
        if status is not None:
            query = query.filter(status=status)
        if priority is not None:
            query = query.filter(priority=priority)
        if source is not None:
            query = query.filter(source=source)
        if intent is not None:
            query = query.filter(intent=intent)
        if legacy_category is not None:
            query = query.filter(category=legacy_category)
        if workspace_id is not None:
            query = query.filter(workspace_id=workspace_id)
        if project_id is not None:
            query = query.filter(project_id=project_id)
        if assignee_user_id is not None:
            query = query.filter(assigned_to_user_id=assignee_user_id)
        if reporter_user_id is not None:
            query = query.filter(reporter_user_id=reporter_user_id)
        if created_from is not None:
            query = query.filter(created_at__gte=created_from)
        if created_to is not None:
            query = query.filter(created_at__lte=created_to)
        if activity_from is not None:
            query = query.filter(last_activity_at__gte=activity_from)
        if activity_to is not None:
            query = query.filter(last_activity_at__lte=activity_to)
        if search:
            query = query.filter(
                Q(message__icontains=search)
                | Q(reporter_email__icontains=search)
                | Q(reporter_username__icontains=search)
            )
        return await self._list_page(query=query, params=params, ordering=ordering)

    async def get_detail(
        self,
        *,
        ticket_id: UUID,
        include_internal_notes: bool,
        reporter_user_id: UUID | None = None,
    ) -> FeedbackTicketDetailOut:
        query = FeedbackTicket.filter(id=ticket_id)
        if reporter_user_id is not None:
            query = query.filter(reporter_user_id=reporter_user_id)
        ticket = await query.first()
        if ticket is None:
            raise NotFound(message=t("errors", "FEEDBACK_NOT_FOUND"), error="FEEDBACK_NOT_FOUND")
        messages_query = FeedbackMessage.filter(ticket_id=ticket.id)
        if not include_internal_notes:
            messages_query = messages_query.filter(kind=FeedbackMessageKind.REPLY)
        messages = await messages_query.order_by("created_at")
        delivery_map = await self._feedback_reply_delivery_map(messages)
        user_ids = {UUID(str(ticket.reporter_user_id))}
        if ticket.assigned_to_user_id is not None:
            user_ids.add(UUID(str(ticket.assigned_to_user_id)))
        user_ids.update(UUID(str(message.author_user_id)) for message in messages)
        users = await self._user_map(user_ids)
        return FeedbackTicketDetailOut(
            id=ticket.id,
            client_request_id=ticket.client_request_id,
            source=ticket.source,
            context_type=project_feedback_context_type(ticket.context_type),
            intent=ticket.intent,
            legacy_category=ticket.category,
            message=ticket.message,
            rating=ticket.rating,
            status=ticket.status,
            priority=ticket.priority,
            revision=ticket.revision,
            workspace_id=ticket.workspace_id,
            project_id=ticket.project_id,
            context_url=ticket.context_url,
            context=ticket.context,
            reporter=_ticket_reporter_out(ticket, users.get(UUID(str(ticket.reporter_user_id)))),
            assignee=(
                _user_out(users[UUID(str(ticket.assigned_to_user_id))])
                if ticket.assigned_to_user_id is not None and UUID(str(ticket.assigned_to_user_id)) in users
                else None
            ),
            messages=[
                _message_out(
                    message,
                    users.get(UUID(str(message.author_user_id))),
                    delivery_map.get(UUID(str(message.id))),
                )
                for message in messages
            ],
            last_activity_at=ticket.last_activity_at,
            first_response_at=ticket.first_response_at,
            resolved_at=ticket.resolved_at,
            closed_at=ticket.closed_at,
            created_at=ticket.created_at,
            updated_at=ticket.updated_at,
        )

    @staticmethod
    async def _feedback_reply_delivery_map(messages: list[FeedbackMessage]) -> dict[UUID, _FeedbackReplyDelivery]:
        reply_ids = [UUID(str(message.id)) for message in messages if message.kind == FeedbackMessageKind.REPLY]
        if not reply_ids:
            return {}
        identities = [f"feedback-reply:{message_id}" for message_id in reply_ids]
        rows = await NotificationDeliveryRecord.filter(
            source_kind=NotificationDeliverySourceKind.FEEDBACK_REPLY,
            source_identity__in=identities,
        ).all()
        return {
            UUID(row.source_identity.removeprefix("feedback-reply:")): {
                "state": row.state,
                "failure_code": row.failure_code,
                "is_retryable": row.is_retryable,
            }
            for row in rows
        }

    async def update_ticket(
        self,
        *,
        ticket_id: UUID,
        payload: FeedbackTicketUpdate,
        actor_user_id: UUID,
    ) -> FeedbackTicketDetailOut:
        async with self.tx() as conn:
            ticket = await FeedbackTicket.filter(id=ticket_id).using_db(conn).select_for_update().first()
            if ticket is None:
                raise NotFound(message=t("errors", "FEEDBACK_NOT_FOUND"), error="FEEDBACK_NOT_FOUND")
            if int(ticket.revision) != payload.expected_revision:
                raise Conflict(error="FEEDBACK_REVISION_CONFLICT")
            if payload.assignee_user_id is not None:
                if not await _is_platform_assignee_eligible(
                    user_id=payload.assignee_user_id,
                    repository=self._platform_identity_repository,
                    conn=conn,
                ):
                    raise BadRequest(
                        message=t("errors", "FEEDBACK_ASSIGNEE_INVALID"),
                        error="FEEDBACK_ASSIGNEE_INVALID",
                    )
                ticket.assigned_to_user_id = payload.assignee_user_id
            elif payload.clear_assignee:
                ticket.assigned_to_user_id = None
            now = datetime.now(UTC)
            if payload.status is not None:
                ticket.status = payload.status
                ticket.resolved_at = now if payload.status == FeedbackStatus.RESOLVED else None
                ticket.closed_at = now if payload.status == FeedbackStatus.CLOSED else None
            if payload.priority is not None:
                ticket.priority = payload.priority
            ticket.last_activity_at = now
            ticket.revision = int(ticket.revision) + 1
            await ticket.save(using_db=conn)
            await write_required_activity_event(
                settings=self._settings,
                conn=conn,
                payload=ActivityAuditPayload(
                    event_name="feedback.updated",
                    actor_user_id=actor_user_id,
                    workspace_id=ticket.workspace_id,
                    entity_type="feedback_ticket",
                    entity_id=ticket.id,
                    properties={
                        "status": str(ticket.status),
                        "priority": str(ticket.priority),
                        "revision": ticket.revision,
                    },
                ),
            )
        return await self.get_detail(ticket_id=ticket_id, include_internal_notes=True)

    async def add_message(
        self,
        *,
        ticket_id: UUID,
        payload: FeedbackMessageCreate,
        author: User,
    ) -> FeedbackTicketDetailOut:
        delivery_id: UUID | None = None
        async with self.tx() as conn:
            ticket = await FeedbackTicket.filter(id=ticket_id).using_db(conn).select_for_update().first()
            if ticket is None:
                raise NotFound(message=t("errors", "FEEDBACK_NOT_FOUND"), error="FEEDBACK_NOT_FOUND")
            fingerprint = sha256(
                orjson.dumps({"kind": str(payload.kind), "body": payload.body}, option=orjson.OPT_SORT_KEYS)
            ).hexdigest()
            existing = (
                await FeedbackMessage
                .filter(
                    ticket_id=ticket.id,
                    client_request_id=payload.client_request_id,
                )
                .using_db(conn)
                .first()
            )
            if existing is not None:
                if existing.request_fingerprint != fingerprint:
                    raise Conflict(error="FEEDBACK_MESSAGE_IDEMPOTENCY_CONFLICT")
                return await self.get_detail(ticket_id=ticket_id, include_internal_notes=True)
            if int(ticket.revision) != payload.expected_revision:
                raise Conflict(error="FEEDBACK_REVISION_CONFLICT")
            message = await FeedbackMessage.create(
                ticket_id=ticket.id,
                author_user_id=author.id,
                author_email=author.email,
                author_username=author.username,
                author_display_name=author.display_name,
                author_avatar_url=author.avatar_url,
                kind=payload.kind,
                client_request_id=payload.client_request_id,
                request_fingerprint=fingerprint,
                body=payload.body,
                using_db=conn,
            )
            if payload.kind == FeedbackMessageKind.REPLY:
                delivery = await NotificationDeliveryRecord.create(
                    source_kind=NotificationDeliverySourceKind.FEEDBACK_REPLY,
                    source_identity=f"feedback-reply:{message.id}",
                    recipient_user_id=ticket.reporter_user_id,
                    recipient_locale="und",
                    channel=NotificationCampaignChannel.IN_APP,
                    presentation=NotificationPresentation.INBOX,
                    idempotency_key=f"feedback-reply:{message.id}:user:{ticket.reporter_user_id}:inbox",
                    state=NotificationDeliveryState.PENDING,
                    using_db=conn,
                )
                delivery_id = UUID(str(delivery.id))
            now = datetime.now(UTC)
            ticket.last_activity_at = now
            if payload.kind == FeedbackMessageKind.REPLY and ticket.first_response_at is None:
                ticket.first_response_at = now
            ticket.revision = int(ticket.revision) + 1
            await ticket.save(using_db=conn)
            await write_required_activity_event(
                settings=self._settings,
                conn=conn,
                payload=ActivityAuditPayload(
                    event_name="feedback.message.added",
                    actor_user_id=author.id,
                    workspace_id=ticket.workspace_id,
                    entity_type="feedback_ticket",
                    entity_id=ticket.id,
                    properties={
                        "messageId": str(message.id),
                        "kind": str(payload.kind),
                        "revision": ticket.revision,
                    },
                ),
            )
        if delivery_id is not None:
            await self._dispatch_feedback_reply(
                delivery_id=delivery_id,
                ticket_id=UUID(str(ticket.id)),
                message_id=UUID(str(message.id)),
                actor_user_id=author.id,
            )
        return await self.get_detail(ticket_id=ticket_id, include_internal_notes=True)

    async def retry_reply_delivery(
        self,
        *,
        ticket_id: UUID,
        message_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
    ) -> FeedbackTicketDetailOut:
        async with self.tx() as conn:
            ticket = await FeedbackTicket.filter(id=ticket_id).using_db(conn).select_for_update().first()
            if ticket is None:
                raise NotFound(error="FEEDBACK_NOT_FOUND")
            delivery = (
                await NotificationDeliveryRecord
                .filter(
                    source_kind=NotificationDeliverySourceKind.FEEDBACK_REPLY,
                    source_identity=f"feedback-reply:{message_id}",
                )
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if delivery is None:
                raise NotFound(error="FEEDBACK_REPLY_DELIVERY_NOT_FOUND")
            if delivery.last_operator_retry_key == idempotency_key:
                return await self.get_detail(ticket_id=ticket_id, include_internal_notes=True)
            if delivery.state != NotificationDeliveryState.FAILED or not delivery.is_retryable:
                raise Conflict(error="FEEDBACK_REPLY_DELIVERY_NOT_RETRYABLE")
            message = (
                await FeedbackMessage
                .filter(
                    id=message_id,
                    ticket_id=ticket_id,
                    kind=FeedbackMessageKind.REPLY,
                )
                .using_db(conn)
                .first()
            )
            if message is None:
                raise NotFound(error="FEEDBACK_MESSAGE_NOT_FOUND")
            delivery.last_operator_retry_key = idempotency_key
            await delivery.save(using_db=conn, update_fields=["last_operator_retry_key", "updated_at"])
            await write_required_activity_event(
                settings=self._settings,
                conn=conn,
                payload=ActivityAuditPayload(
                    event_name="feedback.reply.delivery.retry_requested",
                    actor_user_id=actor_user_id,
                    workspace_id=ticket.workspace_id,
                    entity_type="notification_delivery",
                    entity_id=delivery.id,
                    properties={"source": delivery.source_identity, "messageId": str(message.id)},
                ),
            )
        await self._dispatch_feedback_reply(
            delivery_id=UUID(str(delivery.id)),
            ticket_id=ticket_id,
            message_id=message_id,
            actor_user_id=actor_user_id,
        )
        return await self.get_detail(ticket_id=ticket_id, include_internal_notes=True)

    async def _dispatch_feedback_reply(
        self,
        *,
        delivery_id: UUID,
        ticket_id: UUID,
        message_id: UUID,
        actor_user_id: UUID,
    ) -> None:
        delivery = await NotificationDeliveryRecord.get(id=delivery_id)
        message = await FeedbackMessage.get(id=message_id, ticket_id=ticket_id)
        ticket = await FeedbackTicket.get(id=ticket_id)
        delivery.state = NotificationDeliveryState.PROCESSING
        delivery.attempt_count = int(delivery.attempt_count) + 1
        delivery.failure_code = None
        delivery.failure_message = None
        delivery.is_retryable = False
        await delivery.save(
            update_fields=["state", "attempt_count", "failure_code", "failure_message", "is_retryable", "updated_at"]
        )
        try:
            result = await create_notification_record(
                settings=self._settings,
                workspace_id=ticket.workspace_id or _GLOBAL_NOTIFICATION_WORKSPACE_ID,
                recipient_user_id=ticket.reporter_user_id,
                actor_user_id=actor_user_id,
                category=NotificationCategory.SYSTEM,
                title=t("feedback", "FEEDBACK_REPLY_NOTIFICATION_TITLE"),
                body=message.body,
                target=NotificationFeedbackTicketTarget(ticket_id=ticket.id),
                event_name=_FEEDBACK_REPLY_EVENT_NAME,
                dedupe_key=delivery.idempotency_key,
            )
            if result.disposition == NotificationRecordCreateDisposition.GROUP_SUPPRESSED:
                await self._mark_feedback_reply_suppressed(
                    delivery,
                    reason="NOTIFICATION_SYSTEM_POLICY_DISABLED",
                )
                return
            if result.disposition == NotificationRecordCreateDisposition.PREFERENCE_SUPPRESSED:
                await self._mark_feedback_reply_suppressed(
                    delivery,
                    reason="NOTIFICATION_IN_APP_PREFERENCE_DISABLED",
                )
                return
            notification = result.record
            if result.disposition == NotificationRecordCreateDisposition.DEDUPLICATED:
                notification = await NotificationRecord.filter(
                    workspace_id=ticket.workspace_id or _GLOBAL_NOTIFICATION_WORKSPACE_ID,
                    recipient_user_id=ticket.reporter_user_id,
                    dedupe_key=delivery.idempotency_key,
                ).first()
            if notification is None:
                raise RuntimeError("FEEDBACK_REPLY_DEDUPLICATED_NOTIFICATION_UNAVAILABLE")
        except Exception as exc:
            delivery.state = NotificationDeliveryState.FAILED
            delivery.failure_code = "FEEDBACK_REPLY_DELIVERY_FAILED"
            delivery.failure_message = str(exc)[:512]
            delivery.is_retryable = True
            await delivery.save(
                update_fields=["state", "failure_code", "failure_message", "is_retryable", "updated_at"]
            )
            return
        delivery.state = NotificationDeliveryState.DELIVERED
        delivery.sent_at = datetime.now(UTC)
        delivery.delivered_at = delivery.sent_at
        delivery.notification_id = notification.id
        await delivery.save(update_fields=["state", "sent_at", "delivered_at", "notification_id", "updated_at"])

    @staticmethod
    async def _mark_feedback_reply_suppressed(
        delivery: NotificationDeliveryRecord,
        *,
        reason: str,
    ) -> None:
        delivery.state = NotificationDeliveryState.SUPPRESSED
        delivery.failure_code = reason
        delivery.failure_message = None
        delivery.is_retryable = False
        await delivery.save(update_fields=["state", "failure_code", "failure_message", "is_retryable", "updated_at"])
