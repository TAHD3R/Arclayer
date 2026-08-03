from __future__ import annotations

import json
from collections.abc import AsyncIterator, Iterable
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from hashlib import sha256
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
    PlatformOperatorSetupReason,
    PlatformOperatorStatus,
)
from src.models.platform_identity.mfa import (
    PlatformAuthFlowChallenge,
    PlatformMfaMethod,
    PlatformMfaMethodKind,
    PlatformMfaMethodStatus,
    PlatformMfaRecoveryCode,
)
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
    PlatformIdentityMutationReceipt,
    PlatformOperatorInvitationRole,
    PlatformOperatorRoleAssignment,
    PlatformPermission,
    PlatformRole,
    PlatformRoleChangePreview,
    PlatformRoleKind,
    PlatformRoleRevision,
    PlatformRoleRevisionPermission,
)
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.schema import (
    PlatformAuditEvent,
    PlatformIdentitySnapshot,
    PlatformInvitationAcceptanceCommand,
    PlatformInvitationSetupContext,
    PlatformMutationName,
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

    async def get_user_by_id(self, *, user_id: UUID) -> User | None:
        return await User.get_or_none(id=user_id)

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
        self,
        *,
        role_ids: Iterable[UUID],
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> list[PlatformRoleRevision]:
        resolved_role_ids = list(role_ids)
        if not resolved_role_ids:
            return []
        query = PlatformRoleRevision.filter(role_id__in=resolved_role_ids, is_current=True, role__is_active=True)
        if conn is not None:
            query = query.using_db(conn)
        if for_update:
            query = query.select_for_update()
        return await query.order_by("role_id", "sequence", "id")

    async def list_active_role_assignments(
        self,
        *,
        operator_id: UUID,
        at: datetime,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> list[PlatformOperatorRoleAssignment]:
        query = PlatformOperatorRoleAssignment.filter(operator_id=operator_id, started_at__lte=at).filter(
            Q(ended_at__isnull=True) | Q(ended_at__gt=at)
        )
        if conn is not None:
            query = query.using_db(conn)
        if for_update:
            query = query.select_for_update()
        return await query.order_by("operator_id", "role_id", "started_at", "id")

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

    async def load_authority_snapshots_for_update(
        self,
        *,
        user_ids: Iterable[UUID],
        at: datetime,
        conn: BaseDBAsyncClient,
    ) -> dict[UUID, PlatformIdentitySnapshot]:
        """Lock current authority rows in a deterministic order for one transaction."""

        resolved_user_ids = tuple(
            sorted((UUID(str(user_id)) for user_id in user_ids), key=lambda user_id: str(user_id))
        )
        if not resolved_user_ids:
            return {}
        ownerships = await (
            PlatformInstanceOwnership
            .filter(owner_user_id__in=list(resolved_user_ids))
            .using_db(conn)
            .select_for_update()
            .order_by("owner_user_id", "id")
        )
        owner_ids = {UUID(str(ownership.owner_user_id)) for ownership in ownerships}
        operator_rows = await (
            PlatformOperator
            .filter(user_id__in=list(set(resolved_user_ids) - owner_ids))
            .using_db(conn)
            .select_for_update()
            .order_by("user_id", "id")
        )
        operators_by_user_id = {UUID(str(operator.user_id)): operator for operator in operator_rows}
        active_operator_ids = [
            UUID(str(operator.id)) for operator in operator_rows if operator.status == PlatformOperatorStatus.ACTIVE
        ]
        candidate_role_ids = await self._active_role_ids_for_operators(
            operator_ids=active_operator_ids,
            at=at,
            conn=conn,
        )
        await self._lock_roles_for_update(role_ids=candidate_role_ids, conn=conn)
        assignments = await self._list_active_role_assignments_for_update(
            operator_ids=active_operator_ids,
            at=at,
            conn=conn,
        )
        role_bindings = await self._resolve_role_bindings(
            role_ids=frozenset(UUID(str(assignment.role_id)) for assignment in assignments),
            conn=conn,
            for_update=True,
        )
        bindings_by_role_id = {binding.role_id: binding for binding in role_bindings}
        assignments_by_operator_id: dict[UUID, list[PlatformOperatorRoleAssignment]] = {}
        for assignment in assignments:
            assignments_by_operator_id.setdefault(UUID(str(assignment.operator_id)), []).append(assignment)

        snapshots: dict[UUID, PlatformIdentitySnapshot] = {}
        for user_id in resolved_user_ids:
            if user_id in owner_ids:
                snapshots[user_id] = PlatformIdentitySnapshot(
                    user_id=user_id,
                    is_instance_owner=True,
                    operator_id=None,
                    operator_status=None,
                )
                continue
            operator = operators_by_user_id.get(user_id)
            if operator is None:
                snapshots[user_id] = PlatformIdentitySnapshot(
                    user_id=user_id,
                    is_instance_owner=False,
                    operator_id=None,
                    operator_status=None,
                )
                continue
            operator_id = UUID(str(operator.id))
            if operator.status != PlatformOperatorStatus.ACTIVE:
                snapshots[user_id] = PlatformIdentitySnapshot(
                    user_id=user_id,
                    is_instance_owner=False,
                    operator_id=operator_id,
                    operator_status=operator.status,
                    operator_revision=operator.revision,
                )
                continue
            bindings = tuple(
                bindings_by_role_id[UUID(str(assignment.role_id))]
                for assignment in assignments_by_operator_id.get(operator_id, [])
                if UUID(str(assignment.role_id)) in bindings_by_role_id
            )
            snapshots[user_id] = PlatformIdentitySnapshot(
                user_id=user_id,
                is_instance_owner=False,
                operator_id=operator_id,
                operator_status=operator.status,
                operator_revision=operator.revision,
                effective_permissions=frozenset().union(*(binding.permission_codes for binding in bindings)),
                delegable_permissions=await self._resolve_delegable_permissions(bindings=bindings, conn=conn),
            )
        return snapshots

    async def load_authority_snapshot_for_update(
        self, *, user_id: UUID, at: datetime, conn: BaseDBAsyncClient
    ) -> PlatformIdentitySnapshot:
        """Return one locked, current authority snapshot for an in-transaction command."""

        return (await self.load_authority_snapshots_for_update(user_ids=(user_id,), at=at, conn=conn))[user_id]

    async def assert_platform_permission_for_update(
        self,
        *,
        actor_user_id: UUID,
        permission_code: str,
        at: datetime,
        conn: BaseDBAsyncClient,
    ) -> PlatformIdentitySnapshot:
        """Require exact current authority while retaining the revocation barrier to commit."""

        snapshot = await self.load_authority_snapshot_for_update(user_id=actor_user_id, at=at, conn=conn)
        if snapshot.is_instance_owner or permission_code in snapshot.effective_permissions:
            return snapshot
        raise Forbidden(error="PLATFORM_PERMISSION_DENIED")

    async def lock_role_revision_authority_for_update(
        self, *, role_id: UUID, at: datetime, conn: BaseDBAsyncClient
    ) -> PlatformRoleBinding | None:
        """Lock one role's active assignments, current revision, and permission bindings before apply."""

        await self._lock_roles_for_update(role_ids=frozenset({role_id}), conn=conn)
        await self._list_active_role_assignments_for_update_for_role(role_id=role_id, at=at, conn=conn)
        bindings = await self._resolve_role_bindings(role_ids=frozenset({role_id}), conn=conn, for_update=True)
        return bindings[0] if bindings else None

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
            status__in=(PlatformInvitationStatus.PENDING, PlatformInvitationStatus.MFA_SETUP_REQUIRED),
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

    async def create_custom_role(
        self,
        *,
        actor_user_id: UUID,
        role_id: UUID,
        code: str,
        name: str,
        description: str | None,
        permission_codes: frozenset[str],
        idempotency_key: str,
        correlation_id: UUID,
        source_role_id: UUID | None = None,
        expected_source_revision_id: UUID | None = None,
    ) -> PlatformMutationReceipt:
        action = "copy_custom_role" if source_role_id else "create_custom_role"
        fingerprint = self._fingerprint((
            str(role_id),
            code,
            name,
            description,
            sorted(permission_codes),
            str(source_role_id),
            str(expected_source_revision_id),
        ))
        now = datetime.now(UTC)
        async with self.transaction() as conn:
            replay = await self._mutation_replay(
                actor_user_id=actor_user_id,
                action=action,
                idempotency_key=idempotency_key,
                correlation_id=correlation_id,
                fingerprint=fingerprint,
                conn=conn,
            )
            if replay:
                return replay
            actor = await self.assert_platform_permission_for_update(
                actor_user_id=actor_user_id,
                permission_code=PlatformPermissionCode.ACCESS_ROLES_MANAGE,
                at=now,
                conn=conn,
            )
            resolved_codes = permission_codes
            if source_role_id:
                source = (
                    await PlatformRole
                    .filter(id=source_role_id, is_active=True)
                    .using_db(conn)
                    .select_for_update()
                    .first()
                )
                revision = (
                    await PlatformRoleRevision
                    .filter(role_id=source_role_id, is_current=True)
                    .using_db(conn)
                    .select_for_update()
                    .first()
                )
                if source is None or revision is None:
                    raise NotFound(error="PLATFORM_ROLE_NOT_FOUND")
                if revision.id != expected_source_revision_id:
                    raise Conflict(error="PLATFORM_ROLE_REVISION_STALE")
                resolved_codes = await self._revision_permission_codes(revision.id, conn=conn)
                if resolved_codes != permission_codes:
                    raise Conflict(error="PLATFORM_ROLE_COPY_SOURCE_CHANGED")
            await self._require_active_permission_codes(permission_codes=resolved_codes, conn=conn)
            self._require_delegable_permissions(actor=actor, permission_codes=resolved_codes)
            if await PlatformRole.filter(Q(id=role_id) | Q(code=code)).using_db(conn).exists():
                raise Conflict(error="PLATFORM_ROLE_ALREADY_EXISTS")
            role = await PlatformRole.create(
                using_db=conn,
                id=role_id,
                code=code,
                kind=PlatformRoleKind.CUSTOM,
                name=name,
                description=description,
                created_by_user_id=actor_user_id,
                is_active=True,
            )
            revision = await PlatformRoleRevision.create(
                using_db=conn, role_id=role.id, sequence=1, is_current=True, created_by_user_id=actor_user_id
            )
            await self._create_role_revision_permissions(
                role_revision_id=revision.id, permission_codes=resolved_codes, conn=conn
            )
            await self._write_audit(
                audit=PlatformAuditEvent(
                    event_name=f"platform.role.{action}",
                    actor_user_id=actor_user_id,
                    correlation_id=correlation_id,
                    idempotency_key=idempotency_key,
                ),
                entity_type="platform_role",
                entity_id=role.id,
                conn=conn,
                properties={"permission_count": len(resolved_codes), "revision_id": str(revision.id)},
            )
            await self._record_mutation(
                actor_user_id=actor_user_id,
                action=action,
                idempotency_key=idempotency_key,
                fingerprint=fingerprint,
                entity_id=role.id,
                correlation_id=correlation_id,
                conn=conn,
            )
            return PlatformMutationReceipt(entity_id=role.id, mutation=action, correlation_id=correlation_id)

    async def preview_custom_role_revision(
        self,
        *,
        actor_user_id: UUID,
        role_id: UUID,
        expected_role_revision_id: UUID,
        name: str,
        description: str | None,
        permission_codes: frozenset[str],
    ) -> dict[str, object]:
        now = datetime.now(UTC)
        async with self.transaction() as conn:
            actor = await self.assert_platform_permission_for_update(
                actor_user_id=actor_user_id,
                permission_code=PlatformPermissionCode.ACCESS_ROLES_MANAGE,
                at=now,
                conn=conn,
            )
            role, revision = await self._lock_custom_role_revision(
                role_id=role_id, expected_revision_id=expected_role_revision_id, conn=conn
            )
            previous_codes = await self._revision_permission_codes(revision.id, conn=conn)
            await self._require_active_permission_codes(permission_codes=permission_codes, conn=conn)
            self._require_delegable_permissions(actor=actor, permission_codes=permission_codes - previous_codes)
            assignments = await self._active_role_assignments_for_role(role_id=role.id, at=now, conn=conn)
            invitation_count = (
                await PlatformOperatorInvitationRole
                .filter(
                    role_id=role.id,
                    role_revision_id=revision.id,
                    invitation__status__in=(
                        PlatformInvitationStatus.PENDING,
                        PlatformInvitationStatus.MFA_SETUP_REQUIRED,
                    ),
                )
                .using_db(conn)
                .count()
            )
            preview = await PlatformRoleChangePreview.create(
                using_db=conn,
                role_id=role.id,
                actor_user_id=actor_user_id,
                expected_role_revision_id=revision.id,
                proposed_name=name,
                proposed_description=description,
                proposed_permission_codes=sorted(permission_codes),
                assignment_fingerprint=self._fingerprint([str(item.id) for item in assignments]),
                catalog_fingerprint=await self._permission_catalog_fingerprint(
                    permission_codes=permission_codes, conn=conn
                ),
            )
            return {
                "preview_id": preview.id,
                "role_id": role.id,
                "expected_role_revision_id": revision.id,
                "added_permission_codes": tuple(sorted(permission_codes - previous_codes)),
                "removed_permission_codes": tuple(sorted(previous_codes - permission_codes)),
                "affected_operator_ids": tuple(sorted((UUID(str(item.operator_id)) for item in assignments), key=str)),
                "actor_loses_permissions": tuple(
                    sorted((previous_codes - permission_codes) & actor.effective_permissions)
                ),
                "invalidated_invitation_count": invitation_count,
            }

    async def apply_custom_role_revision(
        self,
        *,
        actor_user_id: UUID,
        preview_id: UUID,
        expected_role_revision_id: UUID,
        idempotency_key: str,
        correlation_id: UUID,
    ) -> PlatformMutationReceipt:
        action = "apply_custom_role_revision"
        fingerprint = self._fingerprint((str(preview_id), str(expected_role_revision_id)))
        now = datetime.now(UTC)
        async with self.transaction() as conn:
            replay = await self._mutation_replay(
                actor_user_id=actor_user_id,
                action=action,
                idempotency_key=idempotency_key,
                correlation_id=correlation_id,
                fingerprint=fingerprint,
                conn=conn,
            )
            if replay:
                return replay
            actor = await self.assert_platform_permission_for_update(
                actor_user_id=actor_user_id,
                permission_code=PlatformPermissionCode.ACCESS_ROLES_MANAGE,
                at=now,
                conn=conn,
            )
            preview = (
                await PlatformRoleChangePreview
                .filter(id=preview_id, actor_user_id=actor_user_id)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if preview is None:
                raise NotFound(error="PLATFORM_ROLE_PREVIEW_NOT_FOUND")
            if UUID(str(preview.expected_role_revision_id)) != expected_role_revision_id:
                raise Conflict(error="PLATFORM_ROLE_PREVIEW_STALE")
            role, revision = await self._lock_custom_role_revision(
                role_id=UUID(str(preview.role_id)), expected_revision_id=expected_role_revision_id, conn=conn
            )
            previous_codes = await self._revision_permission_codes(revision.id, conn=conn)
            permission_codes = frozenset(str(item) for item in preview.proposed_permission_codes)
            await self._require_active_permission_codes(permission_codes=permission_codes, conn=conn)
            self._require_delegable_permissions(actor=actor, permission_codes=permission_codes - previous_codes)
            assignments = await self._active_role_assignments_for_role(role_id=role.id, at=now, conn=conn)
            if self._fingerprint([str(item.id) for item in assignments]) != preview.assignment_fingerprint:
                raise Conflict(error="PLATFORM_ROLE_ASSIGNMENTS_CHANGED")
            if (
                await self._permission_catalog_fingerprint(permission_codes=permission_codes, conn=conn)
                != preview.catalog_fingerprint
            ):
                raise Conflict(error="PLATFORM_PERMISSION_CATALOG_CHANGED")
            revision.is_current = False
            revision.superseded_at = now
            await revision.save(update_fields=["is_current", "superseded_at"], using_db=conn)
            next_revision = await PlatformRoleRevision.create(
                using_db=conn,
                role_id=role.id,
                sequence=revision.sequence + 1,
                is_current=True,
                created_by_user_id=actor_user_id,
            )
            await self._create_role_revision_permissions(
                role_revision_id=next_revision.id, permission_codes=permission_codes, conn=conn
            )
            role.name, role.description = preview.proposed_name, preview.proposed_description
            await role.save(update_fields=["name", "description"], using_db=conn)
            invalidated = await self._invalidate_pending_role_revision_invitations(
                role_id=role.id, role_revision_id=revision.id, invalidated_at=now, conn=conn
            )
            await self._write_audit(
                audit=PlatformAuditEvent(
                    event_name="platform.role.revision_applied",
                    actor_user_id=actor_user_id,
                    correlation_id=correlation_id,
                    idempotency_key=idempotency_key,
                ),
                entity_type="platform_role",
                entity_id=role.id,
                conn=conn,
                properties={
                    "expected_revision_id": str(revision.id),
                    "committed_revision_id": str(next_revision.id),
                    "added_permission_codes": sorted(permission_codes - previous_codes),
                    "removed_permission_codes": sorted(previous_codes - permission_codes),
                    "affected_operator_count": len(assignments),
                    "invalidated_invitation_count": invalidated,
                },
            )
            await self._record_mutation(
                actor_user_id=actor_user_id,
                action=action,
                idempotency_key=idempotency_key,
                fingerprint=fingerprint,
                entity_id=role.id,
                correlation_id=correlation_id,
                conn=conn,
            )
            return PlatformMutationReceipt(entity_id=role.id, mutation=action, correlation_id=correlation_id)

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

    async def begin_operator_invitation_acceptance(
        self, *, command: PlatformInvitationAcceptanceCommand, audit: PlatformAuditEvent
    ) -> PlatformInvitationSetupContext:
        now = datetime.now(UTC)
        async with self.transaction() as conn:
            await self.get_instance_ownership(conn=conn, for_update=True)
            invitation = await self.get_invitation_by_id(
                invitation_id=command.invitation_id, conn=conn, for_update=True
            )
            if invitation is None:
                raise NotFound(error="PLATFORM_INVITATION_NOT_FOUND")
            if UUID(str(invitation.recipient_user_id)) != command.accepter_user_id:
                raise Forbidden(error="PLATFORM_INVITATION_RECIPIENT_REQUIRED")
            if invitation.status == PlatformInvitationStatus.MFA_SETUP_REQUIRED:
                if (
                    invitation.acceptance_idempotency_key != command.idempotency_key
                    or invitation.acceptance_correlation_id is None
                    or UUID(str(invitation.acceptance_correlation_id)) != command.correlation_id
                    or command.expected_invitation_revision != invitation.revision - 1
                ):
                    raise Conflict(error="PLATFORM_INVITATION_ACCEPTANCE_IDEMPOTENCY_CONFLICT")
                return await self._setup_context(
                    invitation=invitation,
                    user_id=command.accepter_user_id,
                    conn=conn,
                )
            if invitation.status != PlatformInvitationStatus.PENDING or invitation.expires_at <= now:
                raise Conflict(error="PLATFORM_INVITATION_INEFFECTIVE")
            if invitation.revision != command.expected_invitation_revision:
                raise Conflict(error="PLATFORM_INVITATION_REVISION_STALE")
            operator = await self.get_operator_by_user_id(user_id=command.accepter_user_id, conn=conn, for_update=True)
            if operator is not None and operator.status == PlatformOperatorStatus.ACTIVE:
                raise Conflict(error="PLATFORM_OPERATOR_ALREADY_ACTIVE")
            stored_bindings = await self.list_invitation_role_bindings(invitation_id=invitation.id, conn=conn)
            expected_bindings = self._bindings_from_invitation_rows(stored_bindings)
            current_bindings = await self._resolve_role_bindings(
                role_ids=frozenset(binding.role_id for binding in expected_bindings),
                conn=conn,
                for_update=True,
            )
            self._require_binding_references(expected=expected_bindings, actual=current_bindings)
            await self._require_inviter_can_issue_roles(
                inviter_user_id=UUID(str(invitation.invited_by_user_id)),
                intended_roles=current_bindings,
                at=now,
                conn=conn,
            )
            if operator is None:
                operator = await PlatformOperator.create(
                    using_db=conn,
                    user_id=command.accepter_user_id,
                    status=PlatformOperatorStatus.MFA_SETUP_REQUIRED,
                    setup_reason=PlatformOperatorSetupReason.INVITATION,
                    revision=1,
                )
            else:
                await (
                    PlatformMfaMethod
                    .filter(user_id=command.accepter_user_id, revoked_at__isnull=True)
                    .using_db(conn)
                    .update(status=PlatformMfaMethodStatus.REVOKED, revoked_at=now)
                )
                await (
                    PlatformMfaRecoveryCode
                    .filter(
                        operator_id=operator.id,
                        used_at__isnull=True,
                        invalidated_at__isnull=True,
                    )
                    .using_db(conn)
                    .update(invalidated_at=now)
                )
                await self._revoke_actor_sessions_and_proofs(
                    user_id=command.accepter_user_id,
                    revoked_by_user_id=command.accepter_user_id,
                    revoked_at=now,
                    conn=conn,
                )
                operator.status = PlatformOperatorStatus.MFA_SETUP_REQUIRED
                operator.setup_reason = PlatformOperatorSetupReason.INVITATION
                operator.deactivated_at = None
                operator.deactivated_by_user_id = None
                operator.revision += 1
                await operator.save(
                    update_fields=["status", "setup_reason", "deactivated_at", "deactivated_by_user_id", "revision"],
                    using_db=conn,
                )
            invitation.status = PlatformInvitationStatus.MFA_SETUP_REQUIRED
            invitation.recipient_accepted_at = now
            invitation.acceptance_idempotency_key = command.idempotency_key
            invitation.acceptance_correlation_id = command.correlation_id
            invitation.revision += 1
            await invitation.save(
                update_fields=[
                    "status",
                    "recipient_accepted_at",
                    "acceptance_idempotency_key",
                    "acceptance_correlation_id",
                    "revision",
                ],
                using_db=conn,
            )
            await self._write_audit(
                audit=audit,
                entity_type="platform_operator_invitation",
                entity_id=invitation.id,
                conn=conn,
            )
            return PlatformInvitationSetupContext(
                invitation_id=invitation.id,
                invitation_revision=invitation.revision,
                operator_id=operator.id,
                requires_phishing_resistant=await self._permissions_require_phishing_resistant_method(
                    permission_codes=frozenset().union(*(binding.permission_codes for binding in current_bindings)),
                    conn=conn,
                ),
            )

    async def get_operator_setup_context(self, *, user_id: UUID) -> PlatformInvitationSetupContext | None:
        now = datetime.now(UTC)
        invitation = await (
            PlatformOperatorInvitation
            .filter(
                recipient_user_id=user_id,
                status=PlatformInvitationStatus.MFA_SETUP_REQUIRED,
                expires_at__gt=now,
            )
            .order_by("id")
            .first()
        )
        if invitation is None:
            return None
        operator = await self.get_operator_by_user_id(user_id=user_id)
        if operator is None or operator.status != PlatformOperatorStatus.MFA_SETUP_REQUIRED:
            return None
        async with self.transaction() as conn:
            locked = await self.get_invitation_by_id(invitation_id=invitation.id, conn=conn, for_update=True)
            if locked is None:
                return None
            return await self._setup_context(invitation=locked, user_id=user_id, conn=conn)

    async def revoke_operator_invitation(
        self,
        *,
        actor_user_id: UUID,
        invitation_id: UUID,
        expected_invitation_revision: int,
        idempotency_key: str,
        correlation_id: UUID,
    ) -> PlatformMutationReceipt:
        action: PlatformMutationName = "revoke_operator_invitation"
        fingerprint = self._fingerprint((str(invitation_id), expected_invitation_revision))
        now = datetime.now(UTC)
        async with self.transaction() as conn:
            replay = await self._mutation_replay(
                actor_user_id=actor_user_id,
                action=action,
                idempotency_key=idempotency_key,
                correlation_id=correlation_id,
                fingerprint=fingerprint,
                conn=conn,
            )
            if replay is not None:
                return replay
            await self.assert_platform_permission_for_update(
                actor_user_id=actor_user_id,
                permission_code=PlatformPermissionCode.ACCESS_TEAM_INVITE,
                at=now,
                conn=conn,
            )
            invitation = await self.get_invitation_by_id(invitation_id=invitation_id, conn=conn, for_update=True)
            if invitation is None:
                raise NotFound(error="PLATFORM_INVITATION_NOT_FOUND")
            if invitation.revision != expected_invitation_revision:
                raise Conflict(error="PLATFORM_INVITATION_REVISION_STALE")
            if invitation.status not in {
                PlatformInvitationStatus.PENDING,
                PlatformInvitationStatus.MFA_SETUP_REQUIRED,
            }:
                raise Conflict(error="PLATFORM_INVITATION_INEFFECTIVE")
            if invitation.status == PlatformInvitationStatus.MFA_SETUP_REQUIRED:
                await self._deactivate_invitation_setup_operator(
                    invitation=invitation,
                    actor_user_id=actor_user_id,
                    changed_at=now,
                    conn=conn,
                )
            await (
                PlatformAuthFlowChallenge
                .filter(
                    invitation_id=invitation.id,
                    consumed_at__isnull=True,
                )
                .using_db(conn)
                .update(consumed_at=now)
            )
            invitation.status = PlatformInvitationStatus.REVOKED
            invitation.revoked_at = now
            invitation.revision += 1
            await invitation.save(update_fields=["status", "revoked_at", "revision"], using_db=conn)
            await self._write_audit(
                audit=PlatformAuditEvent(
                    event_name="platform.operator_invitation.revoked",
                    actor_user_id=actor_user_id,
                    subject_user_id=UUID(str(invitation.recipient_user_id)),
                    correlation_id=correlation_id,
                    idempotency_key=idempotency_key,
                ),
                entity_type="platform_operator_invitation",
                entity_id=invitation.id,
                conn=conn,
            )
            await self._record_mutation(
                actor_user_id=actor_user_id,
                action=action,
                idempotency_key=idempotency_key,
                fingerprint=fingerprint,
                entity_id=invitation.id,
                correlation_id=correlation_id,
                conn=conn,
            )
            return PlatformMutationReceipt(
                entity_id=invitation.id,
                mutation=action,
                correlation_id=correlation_id,
            )

    async def activate_operator_invitation(
        self,
        *,
        user_id: UUID,
        operator_id: UUID,
        invitation_id: UUID,
        expected_invitation_revision: int,
        correlation_id: UUID,
        idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> None:
        now = datetime.now(UTC)
        invitation = await self.get_invitation_by_id(invitation_id=invitation_id, conn=conn, for_update=True)
        operator = await self.get_operator_by_user_id(user_id=user_id, conn=conn, for_update=True)
        if invitation is None or operator is None or UUID(str(operator.id)) != operator_id:
            raise Conflict(error="PLATFORM_INVITATION_SETUP_STATE_CHANGED")
        if (
            invitation.status != PlatformInvitationStatus.MFA_SETUP_REQUIRED
            or invitation.revision != expected_invitation_revision
            or UUID(str(invitation.recipient_user_id)) != user_id
            or invitation.expires_at <= now
            or operator.status != PlatformOperatorStatus.MFA_SETUP_REQUIRED
            or operator.setup_reason != PlatformOperatorSetupReason.INVITATION
        ):
            raise Conflict(error="PLATFORM_INVITATION_SETUP_STATE_CHANGED")
        stored_bindings = self._bindings_from_invitation_rows(
            await self.list_invitation_role_bindings(invitation_id=invitation.id, conn=conn)
        )
        current_bindings = await self._resolve_role_bindings(
            role_ids=frozenset(binding.role_id for binding in stored_bindings),
            conn=conn,
            for_update=True,
        )
        self._require_binding_references(expected=stored_bindings, actual=current_bindings)
        await self._require_inviter_can_issue_roles(
            inviter_user_id=UUID(str(invitation.invited_by_user_id)),
            intended_roles=current_bindings,
            at=now,
            conn=conn,
        )
        permission_codes = frozenset().union(*(binding.permission_codes for binding in current_bindings))
        if await self._permissions_require_phishing_resistant_method(permission_codes=permission_codes, conn=conn):
            if (
                not await PlatformMfaMethod
                .filter(
                    user_id=user_id,
                    kind=PlatformMfaMethodKind.WEBAUTHN,
                    status=PlatformMfaMethodStatus.VERIFIED,
                    revoked_at__isnull=True,
                )
                .using_db(conn)
                .exists()
            ):
                raise Conflict(error="PLATFORM_ROLE_SECURITY_KEY_REQUIRED")
        await (
            PlatformOperatorRoleAssignment
            .filter(operator_id=operator.id, ended_at__isnull=True)
            .using_db(conn)
            .update(ended_at=now)
        )
        await self._create_role_assignments(
            operator_id=operator.id,
            bindings=current_bindings,
            assigned_by_user_id=UUID(str(invitation.invited_by_user_id)),
            started_at=now,
            conn=conn,
        )
        operator.status = PlatformOperatorStatus.ACTIVE
        operator.setup_reason = None
        operator.activated_at = now
        operator.deactivated_at = None
        operator.deactivated_by_user_id = None
        operator.revision += 1
        await operator.save(
            update_fields=[
                "status",
                "setup_reason",
                "activated_at",
                "deactivated_at",
                "deactivated_by_user_id",
                "revision",
            ],
            using_db=conn,
        )
        invitation.status = PlatformInvitationStatus.ACCEPTED
        invitation.accepted_at = now
        invitation.revision += 1
        await invitation.save(update_fields=["status", "accepted_at", "revision"], using_db=conn)
        await self._write_audit(
            audit=PlatformAuditEvent(
                event_name="platform.operator_invitation.accepted",
                actor_user_id=user_id,
                subject_user_id=user_id,
                correlation_id=correlation_id,
                idempotency_key=idempotency_key,
            ),
            entity_type="platform_operator",
            entity_id=operator.id,
            conn=conn,
        )

    async def offboard_operator(
        self, *, command: PlatformOffboardingCommand, audit: PlatformAuditEvent
    ) -> PlatformMutationReceipt:
        now = datetime.now(UTC)
        async with self.transaction() as conn:
            snapshots = await self.load_authority_snapshots_for_update(
                user_ids=(command.actor_user_id, command.target_user_id),
                at=now,
                conn=conn,
            )
            actor = snapshots[command.actor_user_id]
            target = snapshots[command.target_user_id]
            if target.is_instance_owner:
                raise Conflict(error="PLATFORM_INSTANCE_OWNER_OFFBOARDING_FORBIDDEN")
            if not target.is_active_operator or target.operator_id is None:
                raise NotFound(error="PLATFORM_ACTIVE_OPERATOR_NOT_FOUND")
            if (
                not actor.is_instance_owner
                and PlatformPermissionCode.ACCESS_TEAM_REMOVE not in actor.effective_permissions
            ):
                raise Forbidden(error="PLATFORM_OPERATOR_REMOVE_PERMISSION_REQUIRED")
            operator = await self.get_operator_by_user_id(
                user_id=command.target_user_id,
                conn=conn,
                for_update=True,
            )
            if operator is None or operator.revision != command.expected_operator_revision:
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
            operator.setup_reason = None
            operator.deactivated_at = now
            operator.deactivated_by_user_id = command.actor_user_id
            operator.revision += 1
            await operator.save(
                update_fields=["status", "setup_reason", "deactivated_at", "deactivated_by_user_id", "revision"],
                using_db=conn,
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
            authority_snapshots = await self.load_authority_snapshots_for_update(
                user_ids=(UUID(str(transfer.previous_owner_user_id)), command.target_user_id),
                at=now,
                conn=conn,
            )
            target_snapshot = authority_snapshots[command.target_user_id]
            if not target_snapshot.is_active_operator:
                raise Conflict(error="PLATFORM_OWNERSHIP_TRANSFER_TARGET_INELIGIBLE")
            if target_snapshot.operator_revision != transfer.target_operator_revision:
                raise Conflict(error="PLATFORM_OPERATOR_REVISION_STALE")
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
            target.setup_reason = None
            target.deactivated_at = now
            target.deactivated_by_user_id = command.target_user_id
            target.revision += 1
            await target.save(
                update_fields=["status", "setup_reason", "deactivated_at", "deactivated_by_user_id", "revision"],
                using_db=conn,
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
                former_operator.setup_reason = None
                former_operator.deactivated_at = now
                former_operator.deactivated_by_user_id = command.target_user_id
                former_operator.revision += 1
                await former_operator.save(
                    update_fields=[
                        "status",
                        "setup_reason",
                        "deactivated_at",
                        "deactivated_by_user_id",
                        "revision",
                    ],
                    using_db=conn,
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
        snapshot = await self.load_authority_snapshot_for_update(user_id=actor_user_id, at=at, conn=conn)
        return snapshot.is_instance_owner or permission_code in snapshot.effective_permissions

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
        if for_update:
            if conn is None:
                raise ValueError("for_update requires an explicit database connection")
            await self._lock_roles_for_update(role_ids=role_ids, conn=conn)
        query = PlatformRoleRevision.filter(role_id__in=list(role_ids), is_current=True, role__is_active=True)
        if conn is not None:
            query = query.using_db(conn)
        if for_update:
            query = query.select_for_update()
        revisions = await query.order_by("role_id", "sequence")
        permission_rows = await self._role_permission_rows(
            revision_ids=frozenset(UUID(str(revision.id)) for revision in revisions),
            conn=conn,
            for_update=for_update,
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
        self,
        *,
        revision_ids: frozenset[UUID],
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> list[dict[str, object]]:
        if not revision_ids:
            return []
        query = PlatformRoleRevisionPermission.filter(role_revision_id__in=list(revision_ids))
        if conn is not None:
            query = query.using_db(conn)
        if for_update:
            query = query.select_for_update()
        return await query.order_by("role_revision_id", "permission_id", "id").values(
            "role_revision_id", "permission__code"
        )

    async def _list_active_role_assignments_for_update(
        self, *, operator_ids: list[UUID], at: datetime, conn: BaseDBAsyncClient
    ) -> list[PlatformOperatorRoleAssignment]:
        if not operator_ids:
            return []
        return await (
            PlatformOperatorRoleAssignment
            .filter(operator_id__in=operator_ids, started_at__lte=at)
            .filter(Q(ended_at__isnull=True) | Q(ended_at__gt=at))
            .using_db(conn)
            .select_for_update()
            .order_by("operator_id", "role_id", "started_at", "id")
        )

    async def _active_role_ids_for_operators(
        self, *, operator_ids: list[UUID], at: datetime, conn: BaseDBAsyncClient
    ) -> frozenset[UUID]:
        if not operator_ids:
            return frozenset()
        role_ids = await (
            PlatformOperatorRoleAssignment
            .filter(operator_id__in=operator_ids, started_at__lte=at)
            .filter(Q(ended_at__isnull=True) | Q(ended_at__gt=at))
            .using_db(conn)
            .order_by("role_id")
            .values_list("role_id", flat=True)
        )
        return frozenset(UUID(str(role_id)) for role_id in role_ids)

    async def _lock_roles_for_update(self, *, role_ids: frozenset[UUID], conn: BaseDBAsyncClient) -> None:
        if not role_ids:
            return
        await PlatformRole.filter(id__in=list(role_ids)).using_db(conn).select_for_update().order_by("id")

    async def _list_active_role_assignments_for_update_for_role(
        self, *, role_id: UUID, at: datetime, conn: BaseDBAsyncClient
    ) -> list[PlatformOperatorRoleAssignment]:
        return await (
            PlatformOperatorRoleAssignment
            .filter(role_id=role_id, started_at__lte=at)
            .filter(Q(ended_at__isnull=True) | Q(ended_at__gt=at))
            .using_db(conn)
            .select_for_update()
            .order_by("operator_id", "role_id", "started_at", "id")
        )

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

    async def _setup_context(
        self,
        *,
        invitation: PlatformOperatorInvitation,
        user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> PlatformInvitationSetupContext:
        operator = await self.get_operator_by_user_id(user_id=user_id, conn=conn, for_update=True)
        if (
            operator is None
            or operator.status != PlatformOperatorStatus.MFA_SETUP_REQUIRED
            or operator.setup_reason != PlatformOperatorSetupReason.INVITATION
            or invitation.status != PlatformInvitationStatus.MFA_SETUP_REQUIRED
            or UUID(str(invitation.recipient_user_id)) != user_id
            or invitation.expires_at <= datetime.now(UTC)
        ):
            raise Conflict(error="PLATFORM_INVITATION_SETUP_STATE_CHANGED")
        stored_bindings = self._bindings_from_invitation_rows(
            await self.list_invitation_role_bindings(invitation_id=invitation.id, conn=conn)
        )
        current_bindings = await self._resolve_role_bindings(
            role_ids=frozenset(binding.role_id for binding in stored_bindings),
            conn=conn,
            for_update=True,
        )
        self._require_binding_references(expected=stored_bindings, actual=current_bindings)
        return PlatformInvitationSetupContext(
            invitation_id=invitation.id,
            invitation_revision=invitation.revision,
            operator_id=operator.id,
            requires_phishing_resistant=await self._permissions_require_phishing_resistant_method(
                permission_codes=frozenset().union(*(binding.permission_codes for binding in current_bindings)),
                conn=conn,
            ),
        )

    async def _deactivate_invitation_setup_operator(
        self,
        *,
        invitation: PlatformOperatorInvitation,
        actor_user_id: UUID,
        changed_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> None:
        recipient_user_id = UUID(str(invitation.recipient_user_id))
        operator = await self.get_operator_by_user_id(
            user_id=recipient_user_id,
            conn=conn,
            for_update=True,
        )
        if operator is None:
            return
        if (
            operator.status != PlatformOperatorStatus.MFA_SETUP_REQUIRED
            or operator.setup_reason != PlatformOperatorSetupReason.INVITATION
        ):
            raise Conflict(error="PLATFORM_INVITATION_SETUP_STATE_CHANGED")
        await (
            PlatformMfaMethod
            .filter(user_id=recipient_user_id, revoked_at__isnull=True)
            .using_db(conn)
            .update(
                status=PlatformMfaMethodStatus.REVOKED,
                revoked_at=changed_at,
            )
        )
        await (
            PlatformMfaRecoveryCode
            .filter(
                operator_id=operator.id,
                used_at__isnull=True,
                invalidated_at__isnull=True,
            )
            .using_db(conn)
            .update(invalidated_at=changed_at)
        )
        await self._revoke_actor_sessions_and_proofs(
            user_id=recipient_user_id,
            revoked_by_user_id=actor_user_id,
            revoked_at=changed_at,
            conn=conn,
        )
        operator.status = PlatformOperatorStatus.DEACTIVATED
        operator.setup_reason = None
        operator.deactivated_at = changed_at
        operator.deactivated_by_user_id = actor_user_id
        operator.revision += 1
        await operator.save(
            update_fields=["status", "setup_reason", "deactivated_at", "deactivated_by_user_id", "revision"],
            using_db=conn,
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
        operator.setup_reason = None
        operator.activated_at = at
        operator.deactivated_at = None
        operator.deactivated_by_user_id = actor_user_id
        operator.revision += 1
        await operator.save(
            update_fields=[
                "status",
                "setup_reason",
                "activated_at",
                "deactivated_at",
                "deactivated_by_user_id",
                "revision",
            ],
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
                status__in=(PlatformInvitationStatus.PENDING, PlatformInvitationStatus.MFA_SETUP_REQUIRED),
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
        inviter = await self.load_authority_snapshot_for_update(user_id=inviter_user_id, at=at, conn=conn)
        if inviter.is_instance_owner:
            return
        if not inviter.is_active_operator:
            raise Forbidden(error="PLATFORM_OPERATOR_INVITATION_PERMISSION_REQUIRED")
        if PlatformPermissionCode.ACCESS_TEAM_INVITE not in inviter.effective_permissions:
            raise Forbidden(error="PLATFORM_OPERATOR_INVITATION_PERMISSION_REQUIRED")
        requested_permissions = frozenset().union(*(role.permission_codes for role in intended_roles))
        if not requested_permissions.issubset(inviter.delegable_permissions):
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
                status__in=(PlatformInvitationStatus.PENDING, PlatformInvitationStatus.MFA_SETUP_REQUIRED),
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

    async def assign_roles_additively(
        self,
        *,
        actor_user_id: UUID,
        target_user_id: UUID,
        expected_operator_revision: int,
        role_ids: frozenset[UUID],
        idempotency_key: str,
        correlation_id: UUID,
    ) -> PlatformMutationReceipt:
        action = "assign_platform_roles"
        fingerprint = self._fingerprint((str(target_user_id), expected_operator_revision, sorted(map(str, role_ids))))
        now = datetime.now(UTC)
        async with self.transaction() as conn:
            replay = await self._mutation_replay(
                actor_user_id=actor_user_id,
                action=action,
                idempotency_key=idempotency_key,
                correlation_id=correlation_id,
                fingerprint=fingerprint,
                conn=conn,
            )
            if replay:
                return replay
            snapshots = await self.load_authority_snapshots_for_update(
                user_ids=(actor_user_id, target_user_id), at=now, conn=conn
            )
            actor, target = snapshots[actor_user_id], snapshots[target_user_id]
            if (
                not actor.is_instance_owner
                and PlatformPermissionCode.ACCESS_ROLES_MANAGE not in actor.effective_permissions
            ):
                raise Forbidden(error="PLATFORM_ROLE_MANAGE_PERMISSION_REQUIRED")
            if (
                not target.is_active_operator
                or target.operator_id is None
                or target.operator_revision != expected_operator_revision
            ):
                raise Conflict(error="PLATFORM_OPERATOR_REVISION_STALE")
            bindings = await self._resolve_role_bindings(role_ids=role_ids, conn=conn, for_update=True)
            if len(bindings) != len(role_ids):
                raise Conflict(error="PLATFORM_ROLE_REVISION_STALE")
            requested_permissions = frozenset().union(*(item.permission_codes for item in bindings))
            self._require_delegable_permissions(actor=actor, permission_codes=requested_permissions)
            if await self._permissions_require_phishing_resistant_method(
                permission_codes=requested_permissions, conn=conn
            ):
                if (
                    not await PlatformMfaMethod
                    .filter(
                        user_id=target_user_id,
                        kind=PlatformMfaMethodKind.WEBAUTHN,
                        status=PlatformMfaMethodStatus.VERIFIED,
                        revoked_at__isnull=True,
                    )
                    .using_db(conn)
                    .exists()
                ):
                    raise Conflict(error="PLATFORM_ROLE_SECURITY_KEY_REQUIRED")
            existing = await self.list_active_role_assignments(
                operator_id=target.operator_id, at=now, conn=conn, for_update=True
            )
            existing_role_ids = {UUID(str(item.role_id)) for item in existing}
            added_role_ids = sorted(role_ids - existing_role_ids, key=str)
            for role_id in added_role_ids:
                await PlatformOperatorRoleAssignment.create(
                    using_db=conn,
                    operator_id=target.operator_id,
                    role_id=role_id,
                    assigned_by_user_id=actor_user_id,
                    started_at=now,
                )
            operator = await self.get_operator_by_user_id(user_id=target_user_id, conn=conn, for_update=True)
            if operator is None:
                raise Conflict(error="PLATFORM_OPERATOR_REVISION_STALE")
            if added_role_ids:
                operator.revision += 1
                await operator.save(update_fields=["revision"], using_db=conn)
            await self._write_audit(
                audit=PlatformAuditEvent(
                    event_name="platform.operator.roles_assigned",
                    actor_user_id=actor_user_id,
                    subject_user_id=target_user_id,
                    correlation_id=correlation_id,
                    idempotency_key=idempotency_key,
                ),
                entity_type="platform_operator",
                entity_id=operator.id,
                conn=conn,
                properties={"added_role_ids": [str(role_id) for role_id in added_role_ids]},
            )
            await self._record_mutation(
                actor_user_id=actor_user_id,
                action=action,
                idempotency_key=idempotency_key,
                fingerprint=fingerprint,
                entity_id=operator.id,
                correlation_id=correlation_id,
                conn=conn,
            )
            return PlatformMutationReceipt(entity_id=operator.id, mutation=action, correlation_id=correlation_id)

    async def retire_custom_role(
        self,
        *,
        actor_user_id: UUID,
        role_id: UUID,
        expected_role_revision_id: UUID,
        idempotency_key: str,
        correlation_id: UUID,
    ) -> PlatformMutationReceipt:
        action = "retire_custom_role"
        fingerprint = self._fingerprint((str(role_id), str(expected_role_revision_id)))
        now = datetime.now(UTC)
        async with self.transaction() as conn:
            replay = await self._mutation_replay(
                actor_user_id=actor_user_id,
                action=action,
                idempotency_key=idempotency_key,
                correlation_id=correlation_id,
                fingerprint=fingerprint,
                conn=conn,
            )
            if replay:
                return replay
            await self.assert_platform_permission_for_update(
                actor_user_id=actor_user_id,
                permission_code=PlatformPermissionCode.ACCESS_ROLES_MANAGE,
                at=now,
                conn=conn,
            )
            role, revision = await self._lock_custom_role_revision(
                role_id=role_id, expected_revision_id=expected_role_revision_id, conn=conn
            )
            assignments = await self._active_role_assignments_for_role(role_id=role.id, at=now, conn=conn)
            await (
                PlatformOperatorRoleAssignment
                .filter(id__in=[item.id for item in assignments])
                .using_db(conn)
                .update(ended_at=now)
            )
            role.is_active = False
            await role.save(update_fields=["is_active"], using_db=conn)
            invalidated = await self._invalidate_pending_role_revision_invitations(
                role_id=role.id, role_revision_id=revision.id, invalidated_at=now, conn=conn
            )
            await self._write_audit(
                audit=PlatformAuditEvent(
                    event_name="platform.role.retired",
                    actor_user_id=actor_user_id,
                    correlation_id=correlation_id,
                    idempotency_key=idempotency_key,
                ),
                entity_type="platform_role",
                entity_id=role.id,
                conn=conn,
                properties={"ended_assignment_count": len(assignments), "invalidated_invitation_count": invalidated},
            )
            await self._record_mutation(
                actor_user_id=actor_user_id,
                action=action,
                idempotency_key=idempotency_key,
                fingerprint=fingerprint,
                entity_id=role.id,
                correlation_id=correlation_id,
                conn=conn,
            )
            return PlatformMutationReceipt(entity_id=role.id, mutation=action, correlation_id=correlation_id)

    async def revoke_current_actor_sessions(
        self,
        *,
        actor_user_id: UUID,
        current_session_id: UUID,
        session_id: UUID | None,
        all_other: bool,
        idempotency_key: str,
        correlation_id: UUID,
    ) -> PlatformMutationReceipt:
        action = "revoke_other_platform_sessions" if all_other else "revoke_platform_session"
        fingerprint = self._fingerprint((
            str(current_session_id),
            None if session_id is None else str(session_id),
            all_other,
        ))
        now = datetime.now(UTC)
        async with self.transaction() as conn:
            replay = await self._mutation_replay(
                actor_user_id=actor_user_id,
                action=action,
                idempotency_key=idempotency_key,
                correlation_id=correlation_id,
                fingerprint=fingerprint,
                conn=conn,
            )
            if replay:
                return replay
            await self.assert_platform_permission_for_update(
                actor_user_id=actor_user_id,
                permission_code=PlatformPermissionCode.ACCESS_SESSIONS_REVOKE,
                at=now,
                conn=conn,
            )
            query = (
                PlatformSession
                .filter(actor_user_id=actor_user_id, revoked_at__isnull=True)
                .using_db(conn)
                .select_for_update()
            )
            if all_other:
                sessions = await query.exclude(id=current_session_id).order_by("id")
            else:
                if session_id is None:
                    raise Conflict(error="PLATFORM_SESSION_TARGET_REQUIRED")
                sessions = await query.filter(id=session_id).order_by("id")
            if not sessions and not all_other:
                raise NotFound(error="PLATFORM_SESSION_NOT_FOUND")
            session_ids = [item.id for item in sessions]
            if session_ids:
                await (
                    PlatformSession
                    .filter(id__in=session_ids)
                    .using_db(conn)
                    .update(revoked_at=now, revoked_by_user_id=actor_user_id, token_version=F("token_version") + 1)
                )
                await (
                    PlatformStepUpProof
                    .filter(session_id__in=session_ids, status=PlatformStepUpProofStatus.ACTIVE)
                    .using_db(conn)
                    .update(status=PlatformStepUpProofStatus.INVALIDATED)
                )
            entity_id = current_session_id if all_other else session_ids[0]
            await self._write_audit(
                audit=PlatformAuditEvent(
                    event_name="platform.session.revoked",
                    actor_user_id=actor_user_id,
                    correlation_id=correlation_id,
                    idempotency_key=idempotency_key,
                ),
                entity_type="platform_session",
                entity_id=entity_id,
                conn=conn,
                properties={"all_other": all_other, "revoked_session_count": len(session_ids)},
            )
            await self._record_mutation(
                actor_user_id=actor_user_id,
                action=action,
                idempotency_key=idempotency_key,
                fingerprint=fingerprint,
                entity_id=entity_id,
                correlation_id=correlation_id,
                conn=conn,
            )
            return PlatformMutationReceipt(entity_id=entity_id, mutation=action, correlation_id=correlation_id)

    async def remove_current_actor_mfa_method(
        self, *, actor_user_id: UUID, method_id: UUID, idempotency_key: str, correlation_id: UUID
    ) -> PlatformMutationReceipt:
        action = "remove_platform_mfa_method"
        fingerprint = self._fingerprint((str(method_id),))
        now = datetime.now(UTC)
        async with self.transaction() as conn:
            replay = await self._mutation_replay(
                actor_user_id=actor_user_id,
                action=action,
                idempotency_key=idempotency_key,
                correlation_id=correlation_id,
                fingerprint=fingerprint,
                conn=conn,
            )
            if replay:
                return replay
            snapshot = await self.assert_platform_permission_for_update(
                actor_user_id=actor_user_id, permission_code=PlatformPermissionCode.ACCESS_MFA_RESET, at=now, conn=conn
            )
            methods = (
                await PlatformMfaMethod
                .filter(user_id=actor_user_id, status=PlatformMfaMethodStatus.VERIFIED, revoked_at__isnull=True)
                .using_db(conn)
                .select_for_update()
                .order_by("id")
            )
            method = next((item for item in methods if UUID(str(item.id)) == method_id), None)
            if method is None:
                raise NotFound(error="PLATFORM_MFA_METHOD_NOT_FOUND")
            if len(methods) <= 1:
                raise Conflict(error="PLATFORM_LAST_MFA_METHOD_REQUIRED")
            webauthn_count = sum(item.kind == PlatformMfaMethodKind.WEBAUTHN for item in methods)
            if (
                method.kind == PlatformMfaMethodKind.WEBAUTHN
                and (
                    snapshot.is_instance_owner
                    or await self._permissions_require_phishing_resistant_method(
                        permission_codes=snapshot.effective_permissions, conn=conn
                    )
                )
                and webauthn_count <= 1
            ):
                raise Conflict(error="PLATFORM_SECURITY_KEY_REQUIRED")
            method.status, method.revoked_at = PlatformMfaMethodStatus.REVOKED, now
            await method.save(update_fields=["status", "revoked_at"], using_db=conn)
            await self._write_audit(
                audit=PlatformAuditEvent(
                    event_name="platform.mfa.method_removed",
                    actor_user_id=actor_user_id,
                    correlation_id=correlation_id,
                    idempotency_key=idempotency_key,
                ),
                entity_type="platform_mfa_method",
                entity_id=method.id,
                conn=conn,
                properties={"method_kind": str(method.kind)},
            )
            await self._record_mutation(
                actor_user_id=actor_user_id,
                action=action,
                idempotency_key=idempotency_key,
                fingerprint=fingerprint,
                entity_id=method.id,
                correlation_id=correlation_id,
                conn=conn,
            )
            return PlatformMutationReceipt(entity_id=method.id, mutation=action, correlation_id=correlation_id)

    async def _lock_custom_role_revision(
        self, *, role_id: UUID, expected_revision_id: UUID, conn: BaseDBAsyncClient
    ) -> tuple[PlatformRole, PlatformRoleRevision]:
        role = (
            await PlatformRole
            .filter(id=role_id, kind=PlatformRoleKind.CUSTOM, is_active=True)
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if role is None:
            raise NotFound(error="PLATFORM_CUSTOM_ROLE_NOT_FOUND")
        revision = (
            await PlatformRoleRevision
            .filter(role_id=role_id, is_current=True)
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if revision is None or UUID(str(revision.id)) != expected_revision_id:
            raise Conflict(error="PLATFORM_ROLE_REVISION_STALE")
        return role, revision

    async def _revision_permission_codes(self, revision_id: UUID, *, conn: BaseDBAsyncClient) -> frozenset[str]:
        return frozenset(
            str(code)
            for code in await PlatformRoleRevisionPermission
            .filter(role_revision_id=revision_id)
            .using_db(conn)
            .order_by("permission_id")
            .values_list("permission__code", flat=True)
        )

    async def _require_active_permission_codes(
        self, *, permission_codes: frozenset[str], conn: BaseDBAsyncClient
    ) -> None:
        active_codes = frozenset(
            str(code)
            for code in await PlatformPermission
            .filter(code__in=list(permission_codes), is_active=True)
            .using_db(conn)
            .values_list("code", flat=True)
        )
        if active_codes != permission_codes:
            raise Conflict(error="PLATFORM_PERMISSION_CATALOG_CHANGED")

    @staticmethod
    def _require_delegable_permissions(*, actor: PlatformIdentitySnapshot, permission_codes: frozenset[str]) -> None:
        if not actor.is_instance_owner and not permission_codes.issubset(actor.delegable_permissions):
            raise Forbidden(error="PLATFORM_DELEGABLE_AUTHORITY_EXCEEDED")

    async def _create_role_revision_permissions(
        self, *, role_revision_id: UUID, permission_codes: frozenset[str], conn: BaseDBAsyncClient
    ) -> None:
        permissions = (
            await PlatformPermission.filter(code__in=list(permission_codes), is_active=True).using_db(conn).all()
        )
        by_code = {str(item.code): item for item in permissions}
        if set(by_code) != set(permission_codes):
            raise Conflict(error="PLATFORM_PERMISSION_CATALOG_CHANGED")
        await PlatformRoleRevisionPermission.bulk_create(
            [
                PlatformRoleRevisionPermission(role_revision_id=role_revision_id, permission_id=by_code[code].id)
                for code in sorted(permission_codes)
            ],
            using_db=conn,
        )

    async def _active_role_assignments_for_role(
        self, *, role_id: UUID, at: datetime, conn: BaseDBAsyncClient
    ) -> list[PlatformOperatorRoleAssignment]:
        return (
            await PlatformOperatorRoleAssignment
            .filter(role_id=role_id, started_at__lte=at)
            .filter(Q(ended_at__isnull=True) | Q(ended_at__gt=at))
            .using_db(conn)
            .select_for_update()
            .order_by("operator_id", "id")
        )

    async def _permission_catalog_fingerprint(
        self, *, permission_codes: frozenset[str], conn: BaseDBAsyncClient
    ) -> str:
        rows = (
            await PlatformPermission
            .filter(code__in=list(permission_codes))
            .using_db(conn)
            .order_by("code")
            .values("code", "catalog_revision", "is_active")
        )
        return self._fingerprint(rows)

    async def _invalidate_pending_role_revision_invitations(
        self, *, role_id: UUID, role_revision_id: UUID, invalidated_at: datetime, conn: BaseDBAsyncClient
    ) -> int:
        invitations = (
            await PlatformOperatorInvitation
            .filter(
                role_bindings__role_id=role_id,
                role_bindings__role_revision_id=role_revision_id,
                status__in=(PlatformInvitationStatus.PENDING, PlatformInvitationStatus.MFA_SETUP_REQUIRED),
            )
            .using_db(conn)
            .select_for_update()
            .order_by("id")
        )
        for invitation in invitations:
            invitation.status = PlatformInvitationStatus.INVALIDATED
            invitation.invalidated_at = invalidated_at
            invitation.revision += 1
            await invitation.save(update_fields=["status", "invalidated_at", "revision"], using_db=conn)
        return len(invitations)

    async def _permissions_require_phishing_resistant_method(
        self, *, permission_codes: frozenset[str], conn: BaseDBAsyncClient
    ) -> bool:
        return (
            await PlatformActionPolicy
            .filter(
                permission__code__in=list(permission_codes),
                is_active=True,
                requires_step_up=True,
                required_assurance="phishing_resistant",
            )
            .using_db(conn)
            .exists()
        )

    async def _mutation_replay(
        self,
        *,
        actor_user_id: UUID,
        action: PlatformMutationName,
        idempotency_key: str,
        correlation_id: UUID,
        fingerprint: str,
        conn: BaseDBAsyncClient,
    ) -> PlatformMutationReceipt | None:
        receipt = (
            await PlatformIdentityMutationReceipt
            .filter(actor_user_id=actor_user_id, action=action, idempotency_key=idempotency_key)
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if receipt is None:
            return None
        if receipt.request_fingerprint != fingerprint or UUID(str(receipt.correlation_id)) != correlation_id:
            raise Conflict(error="PLATFORM_IDEMPOTENCY_CONFLICT")
        return PlatformMutationReceipt(
            entity_id=receipt.entity_id, mutation=action, replayed=True, correlation_id=correlation_id
        )

    async def _record_mutation(
        self,
        *,
        actor_user_id: UUID,
        action: PlatformMutationName,
        idempotency_key: str,
        fingerprint: str,
        entity_id: UUID,
        correlation_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> None:
        await PlatformIdentityMutationReceipt.create(
            using_db=conn,
            actor_user_id=actor_user_id,
            action=action,
            idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
            entity_id=entity_id,
            correlation_id=correlation_id,
        )

    @staticmethod
    def _fingerprint(value: object) -> str:
        return sha256(json.dumps(value, sort_keys=True, default=str, separators=(",", ":")).encode()).hexdigest()

    async def _write_audit(
        self,
        *,
        audit: PlatformAuditEvent,
        entity_type: str,
        entity_id: UUID,
        conn: BaseDBAsyncClient,
        properties: dict[str, object] | None = None,
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
                **(properties or {}),
            },
        )
