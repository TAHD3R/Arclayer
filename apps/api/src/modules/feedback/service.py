from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime
from hashlib import sha256
from uuid import UUID

import orjson
from tortoise.expressions import Q
from tortoise.transactions import in_transaction

from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.http.pagination import PageData, PageParams
from src.core.i18n import t
from src.models.feedback.feedback import (
    FeedbackCategory,
    FeedbackMessage,
    FeedbackMessageKind,
    FeedbackPriority,
    FeedbackSource,
    FeedbackStatus,
    FeedbackTicket,
)
from src.models.organization.user import User, UserStatus
from src.models.projects.project import ProjectRecord
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.analytics.ingest.service import sanitize_properties
from src.modules.feedback.schema import (
    FeedbackMessageCreate,
    FeedbackMessageOut,
    FeedbackSubmitRequest,
    FeedbackTicketDetailOut,
    FeedbackTicketListItemOut,
    FeedbackTicketUpdate,
    FeedbackUserOut,
)
from src.modules.workspaces.http.service import resolve_workspace_context_by_id


def _user_out(user: User) -> FeedbackUserOut:
    return FeedbackUserOut(
        id=user.id,
        email=user.email,
        username=user.username,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
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
    )


class FeedbackService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

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
        async with in_transaction() as conn:
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
                    "category": payload.category,
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
                        properties={"source": str(payload.source), "category": str(payload.category)},
                    ),
                )
        return await self.get_detail(ticket_id=ticket.id, include_internal_notes=False, reporter_user_id=reporter.id)

    async def _user_map(self, ids: set[UUID]) -> dict[UUID, User]:
        if not ids:
            return {}
        users = await User.filter(id__in=list(ids))
        return {UUID(str(user.id)): user for user in users}

    async def _list_page(
        self,
        *,
        query,
        params: PageParams,
    ) -> PageData[FeedbackTicketListItemOut]:
        total = int(await query.count())
        rows = await query.order_by("-last_activity_at", "-created_at").limit(params.limit).offset(params.offset)
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
                context_type=row.context_type,
                category=row.category,
                message_preview=row.message[:240],
                rating=row.rating,
                status=row.status,
                priority=row.priority,
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
        category: FeedbackCategory | None,
        workspace_id: UUID | None,
        assignee_user_id: UUID | None,
        search: str | None,
    ) -> PageData[FeedbackTicketListItemOut]:
        query = FeedbackTicket.all()
        if status is not None:
            query = query.filter(status=status)
        if priority is not None:
            query = query.filter(priority=priority)
        if source is not None:
            query = query.filter(source=source)
        if category is not None:
            query = query.filter(category=category)
        if workspace_id is not None:
            query = query.filter(workspace_id=workspace_id)
        if assignee_user_id is not None:
            query = query.filter(assigned_to_user_id=assignee_user_id)
        if search:
            query = query.filter(
                Q(message__icontains=search)
                | Q(reporter_email__icontains=search)
                | Q(reporter_username__icontains=search)
            )
        return await self._list_page(query=query, params=params)

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
        user_ids = {UUID(str(ticket.reporter_user_id))}
        if ticket.assigned_to_user_id is not None:
            user_ids.add(UUID(str(ticket.assigned_to_user_id)))
        user_ids.update(UUID(str(message.author_user_id)) for message in messages)
        users = await self._user_map(user_ids)
        return FeedbackTicketDetailOut(
            id=ticket.id,
            client_request_id=ticket.client_request_id,
            source=ticket.source,
            context_type=ticket.context_type,
            category=ticket.category,
            message=ticket.message,
            rating=ticket.rating,
            status=ticket.status,
            priority=ticket.priority,
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
                FeedbackMessageOut(
                    id=message.id,
                    kind=message.kind,
                    body=message.body,
                    author=_message_author_out(message, users.get(UUID(str(message.author_user_id)))),
                    created_at=message.created_at,
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

    async def update_ticket(
        self,
        *,
        ticket_id: UUID,
        payload: FeedbackTicketUpdate,
        actor_user_id: UUID,
    ) -> FeedbackTicketDetailOut:
        async with in_transaction() as conn:
            ticket = await FeedbackTicket.filter(id=ticket_id).using_db(conn).select_for_update().first()
            if ticket is None:
                raise NotFound(message=t("errors", "FEEDBACK_NOT_FOUND"), error="FEEDBACK_NOT_FOUND")
            if payload.assignee_user_id is not None:
                assignee = await User.get_or_none(id=payload.assignee_user_id, using_db=conn)
                if assignee is None or assignee.status != UserStatus.ACTIVE or not assignee.is_super_admin:
                    raise BadRequest(
                        message=t("errors", "FEEDBACK_ASSIGNEE_INVALID"),
                        error="FEEDBACK_ASSIGNEE_INVALID",
                    )
                ticket.assigned_to_user_id = assignee.id
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
                    properties={"status": str(ticket.status), "priority": str(ticket.priority)},
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
        async with in_transaction() as conn:
            ticket = await FeedbackTicket.filter(id=ticket_id).using_db(conn).select_for_update().first()
            if ticket is None:
                raise NotFound(message=t("errors", "FEEDBACK_NOT_FOUND"), error="FEEDBACK_NOT_FOUND")
            message = await FeedbackMessage.create(
                ticket_id=ticket.id,
                author_user_id=author.id,
                author_email=author.email,
                author_username=author.username,
                author_display_name=author.display_name,
                author_avatar_url=author.avatar_url,
                kind=payload.kind,
                body=payload.body,
                using_db=conn,
            )
            now = datetime.now(UTC)
            ticket.last_activity_at = now
            if payload.kind == FeedbackMessageKind.REPLY and ticket.first_response_at is None:
                ticket.first_response_at = now
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
                    properties={"messageId": str(message.id), "kind": str(payload.kind)},
                ),
            )
        return await self.get_detail(ticket_id=ticket_id, include_internal_notes=True)
