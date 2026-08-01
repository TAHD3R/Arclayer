from __future__ import annotations

from collections.abc import AsyncIterator, Iterable
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import F, Q
from tortoise.transactions import in_transaction

from src.core.exceptions import Conflict, Forbidden, NotFound
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.analytics.audit_event import AuditEvent
from src.models.organization.user import User, UserStatus
from src.models.platform_identity.identity import (
    PlatformInstanceOwnership,
    PlatformInvitationStatus,
    PlatformOperator,
    PlatformOperatorInvitation,
    PlatformOperatorStatus,
)
from src.models.platform_identity.mfa import PlatformMfaMethod, PlatformMfaMethodKind, PlatformMfaMethodStatus
from src.models.platform_identity.operations import (
    PlatformActionPolicy,
    PlatformOwnershipTransfer,
    PlatformOwnershipTransferFormerOwnerRole,
    PlatformOwnershipTransferStatus,
    PlatformSession,
    PlatformStepUpProof,
    PlatformStepUpProofStatus,
)
from src.models.platform_identity.roles import (
    PlatformOperatorInvitationRole,
    PlatformOperatorRoleAssignment,
    PlatformPermission,
    PlatformRoleRevision,
    PlatformRoleRevisionPermission,
)
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.schema import (
    PlatformAuditEvent,
    PlatformIdentitySnapshot,
    PlatformMutationReceipt,
    PlatformOffboardingCommand,
    PlatformOperatorInvitationCommand,
    PlatformOwnerBootstrapCommand,
    PlatformOwnershipAcceptanceCommand,
    PlatformOwnershipNominationCommand,
    PlatformRoleBinding,
)

INVITATION_CANDIDATE_LIMIT = 50


class PlatformIdentityRepository(TortoiseORMRepository):
    """Persistence primitives for server-authoritative Platform identity decisions."""

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[BaseDBAsyncClient]:
        async with in_transaction() as conn:
            yield conn

    async def get_instance_ownership(
        self, *, conn: BaseDBAsyncClient | None = None, for_update: bool = False
    ) -> PlatformInstanceOwnership | None:
        query = PlatformInstanceOwnership.filter(singleton_key="instance")
        if conn is not None:
            query = query.using_db(conn)
        if for_update:
            query = query.select_for_update()
        return await query.first()

    async def get_instance_owner_user_id(self, *, conn: BaseDBAsyncClient | None = None) -> UUID | None:
        ownership = await self.get_instance_ownership(conn=conn)
        return None if ownership is None else UUID(str(ownership.owner_user_id))

    async def is_instance_owner(self, *, user_id: UUID, conn: BaseDBAsyncClient | None = None) -> bool:
        query = PlatformInstanceOwnership.filter(singleton_key="instance", owner_user_id=user_id)
        if conn is not None:
            query = query.using_db(conn)
        return await query.exists()

    async def get_operator_by_user_id(
        self, *, user_id: UUID, conn: BaseDBAsyncClient | None = None, for_update: bool = False
    ) -> PlatformOperator | None:
        query = PlatformOperator.filter(user_id=user_id)
        if conn is not None:
            query = query.using_db(conn)
        if for_update:
            query = query.select_for_update()
        return await query.first()

    async def get_active_operator_by_user_id(
        self, *, user_id: UUID, conn: BaseDBAsyncClient | None = None
    ) -> PlatformOperator | None:
        query = PlatformOperator.filter(user_id=user_id, status=PlatformOperatorStatus.ACTIVE)
        if conn is not None:
            query = query.using_db(conn)
        return await query.first()

    async def get_invitation_by_id(
        self, *, invitation_id: UUID, conn: BaseDBAsyncClient | None = None, for_update: bool = False
    ) -> PlatformOperatorInvitation | None:
        query = PlatformOperatorInvitation.filter(id=invitation_id)
        if conn is not None:
            query = query.using_db(conn)
        if for_update:
            query = query.select_for_update()
        return await query.first()

    async def get_invitation_by_idempotency_key(
        self,
        *,
        inviter_user_id: UUID,
        idempotency_key: str,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> PlatformOperatorInvitation | None:
        query = PlatformOperatorInvitation.filter(
            invited_by_user_id=inviter_user_id,
            idempotency_key=idempotency_key,
        )
        if conn is not None:
            query = query.using_db(conn)
        if for_update:
            query = query.select_for_update()
        return await query.first()

    async def list_invitation_role_bindings(
        self, *, invitation_id: UUID, conn: BaseDBAsyncClient | None = None
    ) -> list[PlatformOperatorInvitationRole]:
        query = PlatformOperatorInvitationRole.filter(invitation_id=invitation_id)
        if conn is not None:
            query = query.using_db(conn)
        return await query.order_by("id")

    async def list_current_role_revisions(
        self, *, role_ids: Iterable[UUID], conn: BaseDBAsyncClient | None = None
    ) -> list[PlatformRoleRevision]:
        resolved_role_ids = list(role_ids)
        if not resolved_role_ids:
            return []
        query = PlatformRoleRevision.filter(role_id__in=resolved_role_ids, is_current=True, role__is_active=True)
        if conn is not None:
            query = query.using_db(conn)
        return await query.order_by("role_id", "sequence")

    async def list_active_role_assignments(
        self, *, operator_id: UUID, at: datetime, conn: BaseDBAsyncClient | None = None
    ) -> list[PlatformOperatorRoleAssignment]:
        query = PlatformOperatorRoleAssignment.filter(operator_id=operator_id, started_at__lte=at).filter(
            Q(ended_at__isnull=True) | Q(ended_at__gt=at)
        )
        if conn is not None:
            query = query.using_db(conn)
        return await query.order_by("role_id", "started_at")

    async def resolve_current_role_permissions(
        self, *, operator_id: UUID, at: datetime, conn: BaseDBAsyncClient | None = None
    ) -> frozenset[str]:
        assignments = await self.list_active_role_assignments(operator_id=operator_id, at=at, conn=conn)
        revisions = await self.list_current_role_revisions(
            role_ids=(UUID(str(assignment.role_id)) for assignment in assignments),
            conn=conn,
        )
        revision_ids = [UUID(str(revision.id)) for revision in revisions]
        if not revision_ids:
            return frozenset()
        query = PlatformRoleRevisionPermission.filter(role_revision_id__in=revision_ids)
        if conn is not None:
            query = query.using_db(conn)
        codes = await query.values_list("permission__code", flat=True)
        return frozenset(str(code) for code in codes)

    async def list_effective_permission_codes(
        self, *, operator_id: UUID, at: datetime, conn: BaseDBAsyncClient | None = None
    ) -> frozenset[str]:
        return await self.resolve_current_role_permissions(operator_id=operator_id, at=at, conn=conn)

    async def operator_has_permission(
        self,
        *,
        operator_id: UUID,
        permission_code: str,
        at: datetime,
        conn: BaseDBAsyncClient | None = None,
    ) -> bool:
        return permission_code in await self.resolve_current_role_permissions(
            operator_id=operator_id,
            at=at,
            conn=conn,
        )

    async def list_verified_mfa_methods(
        self, *, user_id: UUID, conn: BaseDBAsyncClient | None = None
    ) -> list[PlatformMfaMethod]:
        query = PlatformMfaMethod.filter(
            user_id=user_id, status=PlatformMfaMethodStatus.VERIFIED, revoked_at__isnull=True
        )
        if conn is not None:
            query = query.using_db(conn)
        return await query.order_by("verified_at", "id")

    async def try_advance_totp_counter(
        self,
        *,
        method_id: UUID,
        counter: int,
        used_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> bool:
        """Atomically advance one Platform TOTP method's anti-replay counter."""

        updated = await (
            PlatformMfaMethod
            .filter(
                id=method_id,
                kind=PlatformMfaMethodKind.TOTP,
                status=PlatformMfaMethodStatus.VERIFIED,
                revoked_at__isnull=True,
            )
            .filter(Q(last_totp_counter__isnull=True) | Q(last_totp_counter__lt=counter))
            .using_db(conn)
            .update(last_totp_counter=counter, last_used_at=used_at)
        )
        return updated == 1

    async def get_platform_session_by_identifier_hash(
        self,
        *,
        session_identifier_hash: str,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> PlatformSession | None:
        query = PlatformSession.filter(session_identifier_hash=session_identifier_hash, revoked_at__isnull=True)
        if conn is not None:
            query = query.using_db(conn)
        if for_update:
            query = query.select_for_update()
        return await query.first()

    async def list_active_sessions_for_user(
        self, *, user_id: UUID, conn: BaseDBAsyncClient | None = None
    ) -> list[PlatformSession]:
        query = PlatformSession.filter(actor_user_id=user_id, revoked_at__isnull=True)
        if conn is not None:
            query = query.using_db(conn)
        return await query.order_by("recent_activity_at", "id")

    async def get_step_up_proof_by_hash(
        self,
        *,
        proof_hash: str,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> PlatformStepUpProof | None:
        query = PlatformStepUpProof.filter(proof_hash=proof_hash)
        if conn is not None:
            query = query.using_db(conn)
        if for_update:
            query = query.select_for_update()
        return await query.first()

    async def get_identity_snapshot(self, *, user_id: UUID, at: datetime) -> PlatformIdentitySnapshot:
        ownership = await self.get_instance_ownership()
        is_owner = ownership is not None and UUID(str(ownership.owner_user_id)) == user_id
        operator = await self.get_operator_by_user_id(user_id=user_id)
        if operator is None:
            return PlatformIdentitySnapshot(
                user_id=user_id, is_instance_owner=is_owner, operator_id=None, operator_status=None
            )
        operator_id = UUID(str(operator.id))
        if operator.status != PlatformOperatorStatus.ACTIVE:
            return PlatformIdentitySnapshot(
                user_id=user_id,
                is_instance_owner=is_owner,
                operator_id=operator_id,
                operator_status=operator.status,
                operator_revision=operator.revision,
            )
        bindings = await self._resolve_current_role_bindings_for_operator(operator_id=operator_id, at=at)
        permission_codes = frozenset().union(*(binding.permission_codes for binding in bindings))
        delegable_permissions = await self._resolve_delegable_permissions(bindings=bindings)
        return PlatformIdentitySnapshot(
            user_id=user_id,
            is_instance_owner=is_owner,
            operator_id=operator_id,
            operator_status=operator.status,
            operator_revision=operator.revision,
            effective_permissions=permission_codes,
            delegable_permissions=delegable_permissions,
        )

    async def list_invitation_candidates(self, *, q: str | None, at: datetime) -> list[User]:
        ownership = await self.get_instance_ownership()
        operator_ids = await PlatformOperator.all().values_list("user_id", flat=True)
        pending_invitee_ids = await PlatformOperatorInvitation.filter(
            status=PlatformInvitationStatus.PENDING,
            expires_at__gt=at,
        ).values_list("recipient_user_id", flat=True)
        unavailable = {UUID(str(user_id)) for user_id in operator_ids}
        unavailable.update(UUID(str(user_id)) for user_id in pending_invitee_ids)
        if ownership is not None:
            unavailable.add(UUID(str(ownership.owner_user_id)))
        users = User.filter(status=UserStatus.ACTIVE).exclude(id__in=list(unavailable))
        normalized_query = q.strip() if q is not None else ""
        if normalized_query:
            users = users.filter(
                Q(username__icontains=normalized_query)
                | Q(email__icontains=normalized_query)
                | Q(display_name__icontains=normalized_query)
            )
        return await users.order_by("username", "id").limit(INVITATION_CANDIDATE_LIMIT)

    async def resolve_current_role_bindings(
        self, *, role_ids: frozenset[UUID], at: datetime
    ) -> tuple[PlatformRoleBinding, ...]:
        _ = at
        return await self._resolve_role_bindings(role_ids=role_ids)

    async def bootstrap_instance_owner(
        self, *, command: PlatformOwnerBootstrapCommand, audit: PlatformAuditEvent
    ) -> PlatformMutationReceipt:
        async with self.transaction() as conn:
            ownership = await self.get_instance_ownership(conn=conn, for_update=True)
            if ownership is not None:
                raise Conflict(error="PLATFORM_INSTANCE_OWNER_ALREADY_EXISTS")
            ownership = await PlatformInstanceOwnership.create(
                using_db=conn,
                owner_user_id=command.owner_user_id,
                singleton_key="instance",
                revision=1,
            )
            await self._write_audit(
                audit=audit, entity_type="platform_instance_ownership", entity_id=ownership.id, conn=conn
            )
            return PlatformMutationReceipt(
                entity_id=ownership.id,
                mutation="bootstrap_owner",
                correlation_id=command.correlation_id,
            )

    async def create_operator_invitation(
        self, *, command: PlatformOperatorInvitationCommand, audit: PlatformAuditEvent
    ) -> PlatformMutationReceipt:
        now = datetime.now(UTC)
        async with self.transaction() as conn:
            await self.get_instance_ownership(conn=conn, for_update=True)
            existing_by_key = await self.get_invitation_by_idempotency_key(
                inviter_user_id=command.inviter_user_id,
                idempotency_key=command.idempotency_key,
                conn=conn,
                for_update=True,
            )
            if existing_by_key is not None:
                await self._require_matching_invitation(existing=existing_by_key, command=command, conn=conn)
                return PlatformMutationReceipt(
                    entity_id=existing_by_key.id,
                    mutation="invite_operator",
                    replayed=True,
                    correlation_id=command.correlation_id,
                )
            existing = await self.get_invitation_by_id(invitation_id=command.invitation_id, conn=conn, for_update=True)
            if existing is not None:
                await self._require_matching_invitation(existing=existing, command=command, conn=conn)
                return PlatformMutationReceipt(
                    entity_id=existing.id,
                    mutation="invite_operator",
                    replayed=True,
                    correlation_id=command.correlation_id,
                )
            if command.expires_at <= now:
                raise Conflict(error="PLATFORM_INVITATION_EXPIRED")
            if await self.is_instance_owner(user_id=command.recipient_user_id, conn=conn):
                raise Conflict(error="PLATFORM_INSTANCE_OWNER_CANNOT_BE_INVITED")
            bindings = await self._resolve_role_bindings(
                role_ids=frozenset(binding.role_id for binding in command.intended_roles),
                conn=conn,
                for_update=True,
            )
            self._require_exact_bindings(expected=command.intended_roles, actual=bindings)
            invitation = await PlatformOperatorInvitation.create(
                using_db=conn,
                id=command.invitation_id,
                recipient_user_id=command.recipient_user_id,
                invited_by_user_id=command.inviter_user_id,
                status=PlatformInvitationStatus.PENDING,
                expires_at=command.expires_at,
                revision=1,
                idempotency_key=command.idempotency_key,
                correlation_id=command.correlation_id,
            )
            await self._create_invitation_bindings(invitation_id=invitation.id, bindings=bindings, conn=conn)
            await self._write_audit(
                audit=audit, entity_type="platform_operator_invitation", entity_id=invitation.id, conn=conn
            )
            return PlatformMutationReceipt(
                entity_id=invitation.id,
                mutation="invite_operator",
                correlation_id=command.correlation_id,
            )

    async def accept_operator_invitation(
        self,
        *,
        command: PlatformOperatorInvitationCommand,
        accepter_user_id: UUID,
        audit: PlatformAuditEvent,
    ) -> PlatformMutationReceipt:
        now = datetime.now(UTC)
        async with self.transaction() as conn:
            await self.get_instance_ownership(conn=conn, for_update=True)
            invitation = await self.get_invitation_by_id(
                invitation_id=command.invitation_id, conn=conn, for_update=True
            )
            if invitation is None:
                raise NotFound(error="PLATFORM_INVITATION_NOT_FOUND")
            if (
                accepter_user_id != command.recipient_user_id
                or UUID(str(invitation.recipient_user_id)) != accepter_user_id
            ):
                raise Forbidden(error="PLATFORM_INVITATION_RECIPIENT_REQUIRED")
            if invitation.status == PlatformInvitationStatus.ACCEPTED:
                await self._require_matching_invitation(existing=invitation, command=command, conn=conn)
                return PlatformMutationReceipt(
                    entity_id=invitation.id,
                    mutation="accept_operator_invitation",
                    replayed=True,
                    correlation_id=command.correlation_id,
                )
            if invitation.status != PlatformInvitationStatus.PENDING or invitation.expires_at <= now:
                raise Conflict(error="PLATFORM_INVITATION_INEFFECTIVE")
            if (
                command.expected_invitation_revision is not None
                and invitation.revision != command.expected_invitation_revision
            ):
                raise Conflict(error="PLATFORM_INVITATION_REVISION_STALE")
            await self._require_matching_invitation(existing=invitation, command=command, conn=conn)
            stored_bindings = await self.list_invitation_role_bindings(invitation_id=invitation.id, conn=conn)
            expected_bindings = self._bindings_from_invitation_rows(stored_bindings)
            self._require_binding_references(expected=command.intended_roles, actual=expected_bindings)
            current_bindings = await self._resolve_role_bindings(
                role_ids=frozenset(binding.role_id for binding in expected_bindings),
                conn=conn,
                for_update=True,
            )
            self._require_exact_bindings(expected=command.intended_roles, actual=current_bindings)
            await self._require_inviter_can_issue_roles(
                inviter_user_id=UUID(str(invitation.invited_by_user_id)),
                intended_roles=current_bindings,
                at=now,
                conn=conn,
            )
            if not await self._has_verified_platform_mfa(user_id=accepter_user_id, conn=conn):
                raise Conflict(error="PLATFORM_MFA_ENROLLMENT_REQUIRED")
            operator = await self.get_operator_by_user_id(user_id=accepter_user_id, conn=conn, for_update=True)
            if operator is not None and operator.status == PlatformOperatorStatus.ACTIVE:
                raise Conflict(error="PLATFORM_OPERATOR_ALREADY_ACTIVE")
            if operator is None:
                operator = await PlatformOperator.create(
                    using_db=conn,
                    user_id=accepter_user_id,
                    status=PlatformOperatorStatus.ACTIVE,
                    activated_at=now,
                    revision=1,
                )
            else:
                await (
                    PlatformOperatorRoleAssignment
                    .filter(operator_id=operator.id, ended_at__isnull=True)
                    .using_db(conn)
                    .update(ended_at=now)
                )
                operator.status = PlatformOperatorStatus.ACTIVE
                operator.activated_at = now
                operator.deactivated_at = None
                operator.deactivated_by_user_id = None
                operator.revision += 1
                await operator.save(
                    update_fields=["status", "activated_at", "deactivated_at", "deactivated_by_user_id", "revision"],
                    using_db=conn,
                )
            await self._create_role_assignments(
                operator_id=operator.id,
                bindings=current_bindings,
                assigned_by_user_id=UUID(str(invitation.invited_by_user_id)),
                started_at=now,
                conn=conn,
            )
            invitation.status = PlatformInvitationStatus.ACCEPTED
            invitation.accepted_at = now
            invitation.revision += 1
            await invitation.save(update_fields=["status", "accepted_at", "revision"], using_db=conn)
            await self._write_audit(audit=audit, entity_type="platform_operator", entity_id=operator.id, conn=conn)
            return PlatformMutationReceipt(
                entity_id=operator.id,
                mutation="accept_operator_invitation",
                correlation_id=command.correlation_id,
            )

    async def offboard_operator(
        self, *, command: PlatformOffboardingCommand, audit: PlatformAuditEvent
    ) -> PlatformMutationReceipt:
        now = datetime.now(UTC)
        async with self.transaction() as conn:
            ownership = await self.get_instance_ownership(conn=conn, for_update=True)
            if ownership is not None and UUID(str(ownership.owner_user_id)) == command.target_user_id:
                raise Conflict(error="PLATFORM_INSTANCE_OWNER_OFFBOARDING_FORBIDDEN")
            operator = await self.get_operator_by_user_id(user_id=command.target_user_id, conn=conn, for_update=True)
            if operator is None or operator.status != PlatformOperatorStatus.ACTIVE:
                raise NotFound(error="PLATFORM_ACTIVE_OPERATOR_NOT_FOUND")
            if operator.revision != command.expected_operator_revision:
                raise Conflict(error="PLATFORM_OPERATOR_REVISION_STALE")
            await (
                PlatformOperatorRoleAssignment
                .filter(operator_id=operator.id, ended_at__isnull=True)
                .using_db(conn)
                .update(ended_at=now)
            )
            await self._invalidate_pending_invitations(
                user_ids=(command.target_user_id,), invalidated_at=now, conn=conn
            )
            await self._revoke_actor_sessions_and_proofs(
                user_id=command.target_user_id,
                revoked_by_user_id=command.actor_user_id,
                revoked_at=now,
                conn=conn,
            )
            operator.status = PlatformOperatorStatus.DEACTIVATED
            operator.deactivated_at = now
            operator.deactivated_by_user_id = command.actor_user_id
            operator.revision += 1
            await operator.save(
                update_fields=["status", "deactivated_at", "deactivated_by_user_id", "revision"], using_db=conn
            )
            await self._write_audit(audit=audit, entity_type="platform_operator", entity_id=operator.id, conn=conn)
            return PlatformMutationReceipt(
                entity_id=operator.id,
                mutation="offboard_operator",
                correlation_id=command.correlation_id,
            )

    async def nominate_ownership_transfer(
        self, *, command: PlatformOwnershipNominationCommand, audit: PlatformAuditEvent
    ) -> PlatformMutationReceipt:
        now = datetime.now(UTC)
        async with self.transaction() as conn:
            ownership = await self.get_instance_ownership(conn=conn, for_update=True)
            if ownership is None or UUID(str(ownership.owner_user_id)) != command.owner_user_id:
                raise Conflict(error="PLATFORM_INSTANCE_OWNER_CHANGED")
            if ownership.revision != command.expected_ownership_revision:
                raise Conflict(error="PLATFORM_OWNERSHIP_REVISION_STALE")
            existing = (
                await PlatformOwnershipTransfer
                .filter(id=command.transfer_id)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if existing is not None:
                self._require_matching_nomination(existing=existing, command=command)
                return PlatformMutationReceipt(
                    entity_id=existing.id,
                    mutation="nominate_ownership_transfer",
                    replayed=True,
                    correlation_id=command.correlation_id,
                )
            if command.expires_at <= now:
                raise Conflict(error="PLATFORM_OWNERSHIP_TRANSFER_EXPIRED")
            target = await self.get_operator_by_user_id(user_id=command.target_user_id, conn=conn, for_update=True)
            if target is None or target.status != PlatformOperatorStatus.ACTIVE:
                raise Conflict(error="PLATFORM_OWNERSHIP_TRANSFER_TARGET_INELIGIBLE")
            if target.revision != command.expected_target_operator_revision:
                raise Conflict(error="PLATFORM_OPERATOR_REVISION_STALE")
            bindings = await self._resolve_role_bindings(
                role_ids=frozenset(binding.role_id for binding in command.former_owner_roles),
                conn=conn,
                for_update=True,
            )
            self._require_exact_bindings(expected=command.former_owner_roles, actual=bindings)
            transfer = await PlatformOwnershipTransfer.create(
                using_db=conn,
                id=command.transfer_id,
                previous_owner_user_id=command.owner_user_id,
                next_owner_user_id=command.target_user_id,
                initiated_by_user_id=command.owner_user_id,
                status=PlatformOwnershipTransferStatus.PENDING,
                revision=1,
                ownership_revision=ownership.revision,
                target_operator_revision=target.revision,
                expires_at=command.expires_at,
                idempotency_key=command.idempotency_key,
                correlation_id=command.correlation_id,
            )
            await self._create_transfer_role_bindings(transfer_id=transfer.id, bindings=bindings, conn=conn)
            await self._write_audit(
                audit=audit, entity_type="platform_ownership_transfer", entity_id=transfer.id, conn=conn
            )
            return PlatformMutationReceipt(
                entity_id=transfer.id,
                mutation="nominate_ownership_transfer",
                correlation_id=command.correlation_id,
            )

    async def accept_ownership_transfer(
        self, *, command: PlatformOwnershipAcceptanceCommand, audit: PlatformAuditEvent
    ) -> PlatformMutationReceipt:
        now = datetime.now(UTC)
        async with self.transaction() as conn:
            transfer = (
                await PlatformOwnershipTransfer
                .filter(id=command.transfer_id)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if transfer is None:
                raise NotFound(error="PLATFORM_OWNERSHIP_TRANSFER_NOT_FOUND")
            if transfer.status == PlatformOwnershipTransferStatus.ACCEPTED:
                if (
                    UUID(str(transfer.next_owner_user_id)) == command.target_user_id
                    and transfer.acceptance_idempotency_key == command.idempotency_key
                ):
                    return PlatformMutationReceipt(
                        entity_id=transfer.id,
                        mutation="accept_ownership_transfer",
                        replayed=True,
                        correlation_id=command.correlation_id,
                    )
                raise Conflict(error="PLATFORM_OWNERSHIP_TRANSFER_ALREADY_ACCEPTED")
            if transfer.status != PlatformOwnershipTransferStatus.PENDING or transfer.expires_at <= now:
                raise Conflict(error="PLATFORM_OWNERSHIP_TRANSFER_INEFFECTIVE")
            if transfer.revision != command.expected_transfer_revision:
                raise Conflict(error="PLATFORM_OWNERSHIP_TRANSFER_REVISION_STALE")
            if UUID(str(transfer.next_owner_user_id)) != command.target_user_id:
                raise Forbidden(error="PLATFORM_OWNERSHIP_TRANSFER_TARGET_REQUIRED")
            ownership = await self.get_instance_ownership(conn=conn, for_update=True)
            if ownership is None or UUID(str(ownership.owner_user_id)) != UUID(str(transfer.previous_owner_user_id)):
                raise Conflict(error="PLATFORM_INSTANCE_OWNER_CHANGED")
            if ownership.revision != transfer.ownership_revision:
                raise Conflict(error="PLATFORM_OWNERSHIP_REVISION_STALE")
            target = await self.get_operator_by_user_id(user_id=command.target_user_id, conn=conn, for_update=True)
            if target is None or target.status != PlatformOperatorStatus.ACTIVE:
                raise Conflict(error="PLATFORM_OWNERSHIP_TRANSFER_TARGET_INELIGIBLE")
            if target.revision != transfer.target_operator_revision:
                raise Conflict(error="PLATFORM_OPERATOR_REVISION_STALE")
            former_bindings = await self._transfer_role_bindings(transfer_id=transfer.id, conn=conn)
            current_bindings = await self._resolve_role_bindings(
                role_ids=frozenset(binding.role_id for binding in former_bindings), conn=conn, for_update=True
            )
            self._require_binding_references(expected=former_bindings, actual=current_bindings)
            previous_owner_id = UUID(str(transfer.previous_owner_user_id))
            await (
                PlatformOperatorRoleAssignment
                .filter(operator_id=target.id, ended_at__isnull=True)
                .using_db(conn)
                .update(ended_at=now)
            )
            target.status = PlatformOperatorStatus.DEACTIVATED
            target.deactivated_at = now
            target.deactivated_by_user_id = command.target_user_id
            target.revision += 1
            await target.save(
                update_fields=["status", "deactivated_at", "deactivated_by_user_id", "revision"], using_db=conn
            )
            former_operator = await self.get_operator_by_user_id(user_id=previous_owner_id, conn=conn, for_update=True)
            if former_operator is not None:
                await (
                    PlatformOperatorRoleAssignment
                    .filter(operator_id=former_operator.id, ended_at__isnull=True)
                    .using_db(conn)
                    .update(ended_at=now)
                )
            if current_bindings:
                former_operator = await self._activate_former_owner_as_operator(
                    operator=former_operator,
                    user_id=previous_owner_id,
                    actor_user_id=command.target_user_id,
                    at=now,
                    conn=conn,
                )
                await self._create_role_assignments(
                    operator_id=former_operator.id,
                    bindings=current_bindings,
                    assigned_by_user_id=command.target_user_id,
                    started_at=now,
                    conn=conn,
                )
            elif former_operator is not None:
                former_operator.status = PlatformOperatorStatus.DEACTIVATED
                former_operator.deactivated_at = now
                former_operator.deactivated_by_user_id = command.target_user_id
                former_operator.revision += 1
                await former_operator.save(
                    update_fields=["status", "deactivated_at", "deactivated_by_user_id", "revision"], using_db=conn
                )
            ownership.owner_user_id = command.target_user_id
            ownership.revision += 1
            await ownership.save(update_fields=["owner_user_id", "revision"], using_db=conn)
            await self._revalidate_pending_invitations_after_ownership_transfer(
                former_owner_user_id=previous_owner_id,
                next_owner_user_id=command.target_user_id,
                former_owner_roles=current_bindings,
                invalidated_at=now,
                conn=conn,
            )
            await self._revoke_actor_sessions_and_proofs(
                user_id=previous_owner_id,
                revoked_by_user_id=command.target_user_id,
                revoked_at=now,
                conn=conn,
            )
            await self._revoke_actor_sessions_and_proofs(
                user_id=command.target_user_id,
                revoked_by_user_id=command.target_user_id,
                revoked_at=now,
                conn=conn,
            )
            transfer.status = PlatformOwnershipTransferStatus.ACCEPTED
            transfer.accepted_at = now
            transfer.acceptance_idempotency_key = command.idempotency_key
            transfer.revision += 1
            await transfer.save(
                update_fields=["status", "accepted_at", "acceptance_idempotency_key", "revision"], using_db=conn
            )
            await self._write_audit(
                audit=audit, entity_type="platform_ownership_transfer", entity_id=transfer.id, conn=conn
            )
            return PlatformMutationReceipt(
                entity_id=transfer.id,
                mutation="accept_ownership_transfer",
                correlation_id=command.correlation_id,
            )

    async def get_action_policy(
        self, *, action_code: str, conn: BaseDBAsyncClient, for_update: bool = False
    ) -> PlatformActionPolicy | None:
        query = PlatformActionPolicy.filter(code=action_code).using_db(conn).select_related("permission")
        if for_update:
            query = query.select_for_update()
        return await query.first()

    async def get_platform_session(
        self, *, session_id: UUID, conn: BaseDBAsyncClient, for_update: bool = False
    ) -> PlatformSession | None:
        query = PlatformSession.filter(id=session_id).using_db(conn)
        if for_update:
            query = query.select_for_update()
        return await query.first()

    async def actor_has_permission(
        self, *, actor_user_id: UUID, permission_code: str, at: datetime, conn: BaseDBAsyncClient
    ) -> bool:
        if await self.is_instance_owner(user_id=actor_user_id, conn=conn):
            return True
        operator = await self.get_active_operator_by_user_id(user_id=actor_user_id, conn=conn)
        return operator is not None and await self.operator_has_permission(
            operator_id=UUID(str(operator.id)), permission_code=permission_code, at=at, conn=conn
        )

    async def create_step_up_proof(self, *, values: dict[str, Any], conn: BaseDBAsyncClient) -> PlatformStepUpProof:
        return await PlatformStepUpProof.create(using_db=conn, **values)

    async def mark_step_up_proof_consumed(
        self, *, proof: PlatformStepUpProof, consumed_at: datetime, conn: BaseDBAsyncClient
    ) -> None:
        updated = (
            await PlatformStepUpProof
            .filter(id=proof.id, status=PlatformStepUpProofStatus.ACTIVE)
            .using_db(conn)
            .update(status=PlatformStepUpProofStatus.CONSUMED, consumed_at=consumed_at)
        )
        if updated != 1:
            raise Conflict(error="PLATFORM_STEP_UP_PROOF_CONSUME_CONFLICT")

    async def _resolve_current_role_bindings_for_operator(
        self, *, operator_id: UUID, at: datetime
    ) -> tuple[PlatformRoleBinding, ...]:
        assignments = await self.list_active_role_assignments(operator_id=operator_id, at=at)
        return await self._resolve_role_bindings(role_ids=frozenset(UUID(str(item.role_id)) for item in assignments))

    async def _resolve_role_bindings(
        self,
        *,
        role_ids: frozenset[UUID],
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> tuple[PlatformRoleBinding, ...]:
        if not role_ids:
            return ()
        query = PlatformRoleRevision.filter(role_id__in=list(role_ids), is_current=True, role__is_active=True)
        if conn is not None:
            query = query.using_db(conn)
        if for_update:
            query = query.select_for_update()
        revisions = await query.order_by("role_id", "sequence")
        permission_rows = await self._role_permission_rows(
            revision_ids=frozenset(UUID(str(revision.id)) for revision in revisions), conn=conn
        )
        permissions_by_revision: dict[UUID, set[str]] = {}
        for row in permission_rows:
            revision_id = UUID(str(row["role_revision_id"]))
            permissions_by_revision.setdefault(revision_id, set()).add(str(row["permission__code"]))
        return tuple(
            PlatformRoleBinding(
                role_id=UUID(str(revision.role_id)),
                role_revision_id=UUID(str(revision.id)),
                permission_codes=frozenset(permissions_by_revision.get(UUID(str(revision.id)), set())),
            )
            for revision in revisions
        )

    async def _resolve_delegable_permissions(
        self, *, bindings: tuple[PlatformRoleBinding, ...], conn: BaseDBAsyncClient | None = None
    ) -> frozenset[str]:
        codes = frozenset().union(*(binding.permission_codes for binding in bindings))
        if not codes:
            return frozenset()
        query = PlatformPermission.filter(code__in=list(codes), is_delegable=True, is_active=True)
        if conn is not None:
            query = query.using_db(conn)
        rows = await query.values_list("code", flat=True)
        return frozenset(str(code) for code in rows)

    async def _role_permission_rows(
        self, *, revision_ids: frozenset[UUID], conn: BaseDBAsyncClient | None = None
    ) -> list[dict[str, object]]:
        if not revision_ids:
            return []
        query = PlatformRoleRevisionPermission.filter(role_revision_id__in=list(revision_ids))
        if conn is not None:
            query = query.using_db(conn)
        return await query.values("role_revision_id", "permission__code")

    @staticmethod
    def _require_exact_bindings(
        *, expected: tuple[PlatformRoleBinding, ...], actual: tuple[PlatformRoleBinding, ...]
    ) -> None:
        if len(expected) != len({binding.role_id for binding in expected}) or set(expected) != set(actual):
            raise Conflict(error="PLATFORM_ROLE_REVISION_STALE")

    @staticmethod
    def _require_binding_references(
        *, expected: tuple[PlatformRoleBinding, ...], actual: tuple[PlatformRoleBinding, ...]
    ) -> None:
        expected_references = {(binding.role_id, binding.role_revision_id) for binding in expected}
        actual_references = {(binding.role_id, binding.role_revision_id) for binding in actual}
        if len(expected) != len(expected_references) or expected_references != actual_references:
            raise Conflict(error="PLATFORM_ROLE_REVISION_STALE")

    @staticmethod
    def _bindings_from_invitation_rows(
        rows: list[PlatformOperatorInvitationRole],
    ) -> tuple[PlatformRoleBinding, ...]:
        return tuple(
            PlatformRoleBinding(
                role_id=UUID(str(row.role_id)),
                role_revision_id=UUID(str(row.role_revision_id)),
            )
            for row in rows
        )

    async def _create_invitation_bindings(
        self, *, invitation_id: UUID, bindings: tuple[PlatformRoleBinding, ...], conn: BaseDBAsyncClient
    ) -> None:
        await PlatformOperatorInvitationRole.bulk_create(
            [
                PlatformOperatorInvitationRole(
                    invitation_id=invitation_id,
                    role_id=binding.role_id,
                    role_revision_id=binding.role_revision_id,
                )
                for binding in bindings
            ],
            using_db=conn,
        )

    async def _create_role_assignments(
        self,
        *,
        operator_id: UUID,
        bindings: tuple[PlatformRoleBinding, ...],
        assigned_by_user_id: UUID,
        started_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> None:
        await PlatformOperatorRoleAssignment.bulk_create(
            [
                PlatformOperatorRoleAssignment(
                    operator_id=operator_id,
                    role_id=binding.role_id,
                    assigned_by_user_id=assigned_by_user_id,
                    started_at=started_at,
                )
                for binding in bindings
            ],
            using_db=conn,
        )

    async def _create_transfer_role_bindings(
        self, *, transfer_id: UUID, bindings: tuple[PlatformRoleBinding, ...], conn: BaseDBAsyncClient
    ) -> None:
        await PlatformOwnershipTransferFormerOwnerRole.bulk_create(
            [
                PlatformOwnershipTransferFormerOwnerRole(
                    transfer_id=transfer_id,
                    role_id=binding.role_id,
                    role_revision_id=binding.role_revision_id,
                )
                for binding in bindings
            ],
            using_db=conn,
        )

    async def _transfer_role_bindings(
        self, *, transfer_id: UUID, conn: BaseDBAsyncClient
    ) -> tuple[PlatformRoleBinding, ...]:
        rows = (
            await PlatformOwnershipTransferFormerOwnerRole.filter(transfer_id=transfer_id).using_db(conn).order_by("id")
        )
        return tuple(
            PlatformRoleBinding(
                role_id=UUID(str(row.role_id)),
                role_revision_id=UUID(str(row.role_revision_id)),
            )
            for row in rows
        )

    async def _activate_former_owner_as_operator(
        self,
        *,
        operator: PlatformOperator | None,
        user_id: UUID,
        actor_user_id: UUID,
        at: datetime,
        conn: BaseDBAsyncClient,
    ) -> PlatformOperator:
        if operator is None:
            return await PlatformOperator.create(
                using_db=conn,
                user_id=user_id,
                status=PlatformOperatorStatus.ACTIVE,
                activated_at=at,
                revision=1,
            )
        operator.status = PlatformOperatorStatus.ACTIVE
        operator.activated_at = at
        operator.deactivated_at = None
        operator.deactivated_by_user_id = actor_user_id
        operator.revision += 1
        await operator.save(
            update_fields=["status", "activated_at", "deactivated_at", "deactivated_by_user_id", "revision"],
            using_db=conn,
        )
        return operator

    async def _invalidate_pending_invitations(
        self, *, user_ids: tuple[UUID, ...], invalidated_at: datetime, conn: BaseDBAsyncClient
    ) -> None:
        await (
            PlatformOperatorInvitation
            .filter(
                Q(recipient_user_id__in=list(user_ids)) | Q(invited_by_user_id__in=list(user_ids)),
                status=PlatformInvitationStatus.PENDING,
            )
            .using_db(conn)
            .update(
                status=PlatformInvitationStatus.INVALIDATED,
                invalidated_at=invalidated_at,
                revision=F("revision") + 1,
            )
        )

    async def _require_inviter_can_issue_roles(
        self,
        *,
        inviter_user_id: UUID,
        intended_roles: tuple[PlatformRoleBinding, ...],
        at: datetime,
        conn: BaseDBAsyncClient,
    ) -> None:
        ownership = await self.get_instance_ownership(conn=conn, for_update=True)
        if ownership is not None and UUID(str(ownership.owner_user_id)) == inviter_user_id:
            return
        inviter = await self.get_operator_by_user_id(user_id=inviter_user_id, conn=conn, for_update=True)
        if inviter is None or inviter.status != PlatformOperatorStatus.ACTIVE:
            raise Forbidden(error="PLATFORM_OPERATOR_INVITATION_PERMISSION_REQUIRED")
        assignments = await self.list_active_role_assignments(operator_id=UUID(str(inviter.id)), at=at, conn=conn)
        inviter_roles = await self._resolve_role_bindings(
            role_ids=frozenset(UUID(str(assignment.role_id)) for assignment in assignments),
            conn=conn,
            for_update=True,
        )
        inviter_permissions = frozenset().union(*(role.permission_codes for role in inviter_roles))
        if PlatformPermissionCode.ACCESS_TEAM_INVITE not in inviter_permissions:
            raise Forbidden(error="PLATFORM_OPERATOR_INVITATION_PERMISSION_REQUIRED")
        delegable_permissions = await self._resolve_delegable_permissions(bindings=inviter_roles, conn=conn)
        requested_permissions = frozenset().union(*(role.permission_codes for role in intended_roles))
        if not requested_permissions.issubset(delegable_permissions):
            raise Forbidden(error="PLATFORM_DELEGABLE_AUTHORITY_EXCEEDED")

    async def _revalidate_pending_invitations_after_ownership_transfer(
        self,
        *,
        former_owner_user_id: UUID,
        next_owner_user_id: UUID,
        former_owner_roles: tuple[PlatformRoleBinding, ...],
        invalidated_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> None:
        former_owner_permissions = frozenset().union(*(role.permission_codes for role in former_owner_roles))
        former_owner_delegable = await self._resolve_delegable_permissions(
            bindings=former_owner_roles,
            conn=conn,
        )
        invitations = await (
            PlatformOperatorInvitation
            .filter(
                Q(invited_by_user_id=former_owner_user_id) | Q(recipient_user_id=next_owner_user_id),
                status=PlatformInvitationStatus.PENDING,
            )
            .using_db(conn)
            .select_for_update()
            .order_by("id")
        )
        for invitation in invitations:
            invalid = UUID(str(invitation.recipient_user_id)) == next_owner_user_id
            if UUID(str(invitation.invited_by_user_id)) == former_owner_user_id:
                stored_bindings = self._bindings_from_invitation_rows(
                    await self.list_invitation_role_bindings(invitation_id=invitation.id, conn=conn)
                )
                current_bindings = await self._resolve_role_bindings(
                    role_ids=frozenset(binding.role_id for binding in stored_bindings),
                    conn=conn,
                    for_update=True,
                )
                intended_permissions = frozenset().union(*(role.permission_codes for role in current_bindings))
                invalid = invalid or (
                    PlatformPermissionCode.ACCESS_TEAM_INVITE not in former_owner_permissions
                    or {(binding.role_id, binding.role_revision_id) for binding in stored_bindings}
                    != {(binding.role_id, binding.role_revision_id) for binding in current_bindings}
                    or not intended_permissions.issubset(former_owner_delegable)
                )
            if invalid:
                invitation.status = PlatformInvitationStatus.INVALIDATED
                invitation.invalidated_at = invalidated_at
                invitation.revision += 1
                await invitation.save(update_fields=["status", "invalidated_at", "revision"], using_db=conn)

    async def _revoke_actor_sessions_and_proofs(
        self,
        *,
        user_id: UUID,
        revoked_by_user_id: UUID,
        revoked_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> None:
        await (
            PlatformSession
            .filter(actor_user_id=user_id, revoked_at__isnull=True)
            .using_db(conn)
            .update(
                revoked_at=revoked_at,
                revoked_by_user_id=revoked_by_user_id,
                token_version=F("token_version") + 1,
            )
        )
        await (
            PlatformStepUpProof
            .filter(actor_user_id=user_id, status=PlatformStepUpProofStatus.ACTIVE)
            .using_db(conn)
            .update(status=PlatformStepUpProofStatus.INVALIDATED)
        )

    async def _has_verified_platform_mfa(self, *, user_id: UUID, conn: BaseDBAsyncClient) -> bool:
        return (
            await PlatformMfaMethod
            .filter(
                user_id=user_id,
                status=PlatformMfaMethodStatus.VERIFIED,
                revoked_at__isnull=True,
            )
            .using_db(conn)
            .exists()
        )

    async def _require_matching_invitation(
        self,
        *,
        existing: PlatformOperatorInvitation,
        command: PlatformOperatorInvitationCommand,
        conn: BaseDBAsyncClient,
    ) -> None:
        stored_bindings = self._bindings_from_invitation_rows(
            await self.list_invitation_role_bindings(invitation_id=existing.id, conn=conn)
        )
        matches = (
            UUID(str(existing.recipient_user_id)) == command.recipient_user_id
            and UUID(str(existing.invited_by_user_id)) == command.inviter_user_id
            and existing.expires_at == command.expires_at
            and existing.idempotency_key == command.idempotency_key
            and UUID(str(existing.correlation_id)) == command.correlation_id
            and {(binding.role_id, binding.role_revision_id) for binding in stored_bindings}
            == {(binding.role_id, binding.role_revision_id) for binding in command.intended_roles}
        )
        if not matches:
            raise Conflict(error="PLATFORM_INVITATION_IDEMPOTENCY_CONFLICT")

    @staticmethod
    def _require_matching_nomination(
        *, existing: PlatformOwnershipTransfer, command: PlatformOwnershipNominationCommand
    ) -> None:
        matches = (
            UUID(str(existing.previous_owner_user_id)) == command.owner_user_id
            and UUID(str(existing.next_owner_user_id)) == command.target_user_id
            and existing.idempotency_key == command.idempotency_key
            and UUID(str(existing.correlation_id)) == command.correlation_id
        )
        if not matches:
            raise Conflict(error="PLATFORM_OWNERSHIP_TRANSFER_IDEMPOTENCY_CONFLICT")

    async def _write_audit(
        self, *, audit: PlatformAuditEvent, entity_type: str, entity_id: UUID, conn: BaseDBAsyncClient
    ) -> None:
        await AuditEvent.create(
            using_db=conn,
            occurred_at=datetime.now(UTC),
            event_name=audit.event_name,
            actor_user_id=audit.actor_user_id,
            subject_user_id=audit.subject_user_id,
            entity_type=entity_type,
            entity_id=entity_id,
            source="platform",
            properties={
                "correlation_id": str(audit.correlation_id),
                "idempotency_key": audit.idempotency_key,
            },
        )
