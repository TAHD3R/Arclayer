from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import Conflict, Forbidden, NotFound
from src.models.analytics.audit_event import AuditEvent
from src.models.commerce.billing import ResourceLimitKind
from src.models.commerce.credit_allocation import (
    WorkspaceMemberCreditCommandReceipt,
    WorkspaceMemberCreditLimitOverride,
    WorkspaceMemberCreditPolicy,
    WorkspaceMemberCreditUsagePeriod,
)
from src.models.organization.user import User
from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from src.modules.commerce.member_credit_composition import build_member_credit_configuration_service
from src.modules.commerce.member_credit_schema import MemberCreditDefaultLimitWrite, MemberCreditOverrideWrite
from src.modules.organization.repository import OrganizationRepository

pytestmark = pytest.mark.integration


@dataclass(frozen=True, slots=True)
class _MemberCreditWorkspace:
    workspace: Workspace
    owner: User
    member: User
    owner_membership: WorkspaceMembership
    member_membership: WorkspaceMembership


async def _create_workspace(label: str) -> _MemberCreditWorkspace:
    suffix = uuid4().hex[:12]
    owner = await User.create(
        username=f"member-credit-owner-{label}-{suffix}",
        email=f"member-credit-owner-{label}-{suffix}@example.com",
        display_name="Member Credit Owner",
    )
    member = await User.create(
        username=f"member-credit-user-{label}-{suffix}",
        email=f"member-credit-user-{label}-{suffix}@example.com",
        display_name="Member Credit User",
    )
    organization = await OrganizationRepository().create_organization(
        slug=f"member-credit-{label}-{suffix}",
        name=f"Member Credit {label}",
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name=f"Member Credit {label}",
        owner_user_id=owner.id,
        created_by_user_id=owner.id,
        is_active=True,
    )
    owner_membership = await WorkspaceMembership.create(
        workspace_id=workspace.id,
        user_id=owner.id,
        status=WorkspaceMembershipStatus.ACTIVE,
    )
    member_membership = await WorkspaceMembership.create(
        workspace_id=workspace.id,
        user_id=member.id,
        status=WorkspaceMembershipStatus.ACTIVE,
    )
    return _MemberCreditWorkspace(workspace, owner, member, owner_membership, member_membership)


def _default_command(*, credits: int, revision: int, key: str) -> MemberCreditDefaultLimitWrite:
    return MemberCreditDefaultLimitWrite(
        limit_kind=ResourceLimitKind.LIMITED,
        limit_credits=credits,
        expected_revision=revision,
        idempotency_key=key,
    )


def _override_command(
    *,
    action: Literal["set", "clear"],
    revision: int,
    key: str,
    limit_kind: ResourceLimitKind | None = None,
    credits: int | None = None,
) -> MemberCreditOverrideWrite:
    return MemberCreditOverrideWrite(
        action=action,
        limit_kind=limit_kind,
        limit_credits=credits,
        expected_revision=revision,
        idempotency_key=key,
    )


async def test_default_limit_replays_conflicts_and_preserves_usage(db_schema) -> None:
    _ = db_schema
    fixture = await _create_workspace("default")
    now = datetime.now(UTC)
    usage = await WorkspaceMemberCreditUsagePeriod.create(
        workspace_id=fixture.workspace.id,
        membership_id=fixture.member_membership.id,
        period_start=now,
        period_end=now + timedelta(days=31),
        reserved_credits=7,
        committed_credits=11,
        revision=4,
    )
    service = build_member_credit_configuration_service(get_settings())
    command = _default_command(credits=100, revision=1, key="default-100")

    result = await service.set_default_limit(
        workspace_id=fixture.workspace.id,
        actor_user_id=fixture.owner.id,
        command=command,
    )
    replay = await service.set_default_limit(
        workspace_id=fixture.workspace.id,
        actor_user_id=fixture.owner.id,
        command=command,
    )

    assert result.configuration_revision == 2
    assert result.default_limit.limit_kind == "limited"
    assert result.default_limit.limit_credits == 100
    assert result.replayed is False
    assert replay.model_dump(exclude={"replayed"}) == result.model_dump(exclude={"replayed"})
    assert replay.replayed is True
    assert await WorkspaceMemberCreditCommandReceipt.filter(workspace_id=fixture.workspace.id).count() == 1
    assert await AuditEvent.filter(event_name="commerce.member_credit.set_default").count() == 1

    with pytest.raises(Conflict) as idempotency_error:
        await service.set_default_limit(
            workspace_id=fixture.workspace.id,
            actor_user_id=fixture.owner.id,
            command=_default_command(credits=101, revision=1, key="default-100"),
        )
    assert idempotency_error.value.error == "WORKSPACE_MEMBER_CREDIT_IDEMPOTENCY_CONFLICT"

    with pytest.raises(Conflict) as revision_error:
        await service.set_default_limit(
            workspace_id=fixture.workspace.id,
            actor_user_id=fixture.owner.id,
            command=_default_command(credits=101, revision=1, key="stale-default"),
        )
    assert revision_error.value.error == "WORKSPACE_MEMBER_CREDIT_REVISION_STALE"

    await usage.refresh_from_db()
    assert (usage.reserved_credits, usage.committed_credits, usage.revision) == (7, 11, 4)
    receipt = await WorkspaceMemberCreditCommandReceipt.get(workspace_id=fixture.workspace.id)
    audit = await AuditEvent.get(id=receipt.audit_event_id)
    assert audit.properties["before"]["default_limit"]["limit_kind"] == "unlimited"
    assert audit.properties["after"]["default_limit"]["limit_credits"] == 100


async def test_owner_self_override_distinguishes_unlimited_from_clear_and_rejects_invalid_targets(db_schema) -> None:
    _ = db_schema
    fixture = await _create_workspace("override")
    other = await _create_workspace("other")
    service = build_member_credit_configuration_service(get_settings())

    unlimited = await service.set_member_override(
        workspace_id=fixture.workspace.id,
        membership_id=fixture.owner_membership.id,
        actor_user_id=fixture.owner.id,
        command=_override_command(
            action="set",
            revision=1,
            key="owner-unlimited",
            limit_kind=ResourceLimitKind.UNLIMITED,
        ),
    )
    assert unlimited.configuration_revision == 2
    assert unlimited.override_limit is not None
    assert unlimited.override_limit.limit_kind == "unlimited"
    assert unlimited.effective_limit.limit_kind == "unlimited"

    with pytest.raises(Conflict) as changed_target:
        await service.set_member_override(
            workspace_id=fixture.workspace.id,
            membership_id=fixture.member_membership.id,
            actor_user_id=fixture.owner.id,
            command=_override_command(
                action="set",
                revision=2,
                key="owner-unlimited",
                limit_kind=ResourceLimitKind.UNLIMITED,
            ),
        )
    assert changed_target.value.error == "WORKSPACE_MEMBER_CREDIT_IDEMPOTENCY_CONFLICT"

    cleared = await service.set_member_override(
        workspace_id=fixture.workspace.id,
        membership_id=fixture.owner_membership.id,
        actor_user_id=fixture.owner.id,
        command=_override_command(action="clear", revision=2, key="owner-clear"),
    )
    assert cleared.configuration_revision == 3
    assert cleared.override_limit is None
    assert cleared.effective_limit == cleared.default_limit
    assert not await WorkspaceMemberCreditLimitOverride.filter(membership_id=fixture.owner_membership.id).exists()

    fixture.member_membership.status = WorkspaceMembershipStatus.DISABLED
    await fixture.member_membership.save(update_fields=["status", "updated_at"])
    with pytest.raises(NotFound) as disabled_target:
        await service.set_member_override(
            workspace_id=fixture.workspace.id,
            membership_id=fixture.member_membership.id,
            actor_user_id=fixture.owner.id,
            command=_override_command(action="clear", revision=3, key="disabled-target"),
        )
    assert disabled_target.value.error == "WORKSPACE_MEMBER_NOT_FOUND"

    with pytest.raises(NotFound) as cross_workspace_target:
        await service.set_member_override(
            workspace_id=fixture.workspace.id,
            membership_id=other.member_membership.id,
            actor_user_id=fixture.owner.id,
            command=_override_command(action="clear", revision=3, key="cross-workspace-target"),
        )
    assert cross_workspace_target.value.error == "WORKSPACE_MEMBER_NOT_FOUND"

    with pytest.raises(Forbidden) as inactive_actor:
        await service.set_default_limit(
            workspace_id=fixture.workspace.id,
            actor_user_id=fixture.member.id,
            command=_default_command(credits=50, revision=3, key="inactive-actor"),
        )
    assert inactive_actor.value.error == "WORKSPACE_MEMBERSHIP_REQUIRED"


async def test_same_key_concurrency_records_one_mutation_receipt_and_audit(db_schema) -> None:
    _ = db_schema
    fixture = await _create_workspace("same-key")
    service = build_member_credit_configuration_service(get_settings())
    command = _default_command(credits=75, revision=1, key="same-key")
    start = asyncio.Event()

    async def mutate():
        await start.wait()
        return await service.set_default_limit(
            workspace_id=fixture.workspace.id,
            actor_user_id=fixture.owner.id,
            command=command,
        )

    tasks = [asyncio.create_task(mutate()) for _ in range(2)]
    await asyncio.sleep(0)
    start.set()
    results = await asyncio.gather(*tasks)

    assert sorted(result.replayed for result in results) == [False, True]
    assert {result.configuration_revision for result in results} == {2}
    assert await WorkspaceMemberCreditCommandReceipt.filter(workspace_id=fixture.workspace.id).count() == 1
    assert await AuditEvent.filter(event_name="commerce.member_credit.set_default").count() == 1
    policy = await WorkspaceMemberCreditPolicy.get(workspace_id=fixture.workspace.id)
    assert policy.revision == 2


async def test_different_key_concurrency_allows_one_revision_winner(db_schema) -> None:
    _ = db_schema
    fixture = await _create_workspace("revision-race")
    service = build_member_credit_configuration_service(get_settings())
    start = asyncio.Event()

    async def mutate(credits: int, key: str):
        await start.wait()
        try:
            return await service.set_default_limit(
                workspace_id=fixture.workspace.id,
                actor_user_id=fixture.owner.id,
                command=_default_command(credits=credits, revision=1, key=key),
            )
        except Conflict as exc:
            return exc

    tasks = [asyncio.create_task(mutate(40, "race-40")), asyncio.create_task(mutate(60, "race-60"))]
    await asyncio.sleep(0)
    start.set()
    outcomes = await asyncio.gather(*tasks)

    successes = [outcome for outcome in outcomes if not isinstance(outcome, Conflict)]
    conflicts = [outcome for outcome in outcomes if isinstance(outcome, Conflict)]
    assert len(successes) == 1
    assert len(conflicts) == 1
    assert conflicts[0].error == "WORKSPACE_MEMBER_CREDIT_REVISION_STALE"
    assert await WorkspaceMemberCreditCommandReceipt.filter(workspace_id=fixture.workspace.id).count() == 1


async def test_archived_workspace_is_not_a_valid_configuration_target(db_schema) -> None:
    _ = db_schema
    fixture = await _create_workspace("archived")
    fixture.workspace.archived_at = datetime.now(UTC)
    await fixture.workspace.save(update_fields=["archived_at", "updated_at"])

    with pytest.raises(NotFound) as error:
        await build_member_credit_configuration_service(get_settings()).set_default_limit(
            workspace_id=fixture.workspace.id,
            actor_user_id=fixture.owner.id,
            command=_default_command(credits=10, revision=1, key="archived"),
        )
    assert error.value.error == "WORKSPACE_NOT_FOUND"
