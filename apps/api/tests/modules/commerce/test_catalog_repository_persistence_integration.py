from __future__ import annotations

import asyncio
from uuid import uuid4

import pytest
from tortoise import Tortoise
from tortoise.exceptions import IntegrityError
from tortoise.transactions import in_transaction

from src.config import get_settings
from src.core.exceptions import Conflict
from src.models.analytics.audit_event import AuditEvent
from src.models.commerce.billing import (
    CommerceCatalogCommandAction,
    CommerceCatalogCommandReceipt,
    CommercePlan,
    CommercePlanRevision,
    CreditRefreshInterval,
    PlanRevisionStatus,
)
from src.modules.commerce.catalog_repository import CommerceCatalogRepository
from src.modules.commerce.catalog_schema import PlanRevisionTermsInput


def _terms(*, name_i18n_key: str = "commerce.plan.test.name") -> PlanRevisionTermsInput:
    return PlanRevisionTermsInput(
        name_i18n_key=name_i18n_key,
        description_i18n_key="commerce.plan.test.description",
        credit_grant_amount=100,
        credit_refresh_interval=CreditRefreshInterval.MONTHLY,
        credit_value_micros=1_000,
        currency="USD",
    )


async def _create_plan_and_draft(
    *, status: PlanRevisionStatus = PlanRevisionStatus.DRAFT
) -> tuple[CommercePlan, CommercePlanRevision]:
    plan = await CommercePlan.create(code=f"catalog-{uuid4().hex[:16]}", sort_order=100)
    draft = await CommercePlanRevision.create(
        plan_id=plan.id,
        sequence=1,
        status=status,
        is_selling=False,
        content_hash=None,
        published_at=None,
        name_i18n_key="commerce.plan.test.name",
        description_i18n_key="commerce.plan.test.description",
        credit_grant_amount=100,
        credit_refresh_interval=CreditRefreshInterval.MONTHLY,
        credit_value_micros=1_000,
        currency="USD",
    )
    return plan, draft


async def _record_outcome(
    repository: CommerceCatalogRepository,
    *,
    plan: CommercePlan,
    draft: CommercePlanRevision | None,
    key_hash: str,
    fingerprint: str,
    conn,
) -> CommerceCatalogCommandReceipt:
    return await repository.record_command_outcome(
        settings=get_settings(),
        action=CommerceCatalogCommandAction.CREATE_DRAFT,
        target_plan=plan,
        target_revision=draft,
        idempotency_key_hash=key_hash,
        request_fingerprint=fingerprint,
        actor_user_id=uuid4(),
        actor_session_id=uuid4(),
        result_snapshot={"planId": str(plan.id), "revisionId": None if draft is None else str(draft.id)},
        event_name="commerce.catalog.draft_created",
        event_properties={"plan_code": plan.code, "action": "create_draft"},
        conn=conn,
    )


@pytest.mark.asyncio
async def test_catalog_command_receipt_replays_the_exact_persisted_result(db) -> None:
    repository = CommerceCatalogRepository()
    plan, draft = await _create_plan_and_draft()
    key_hash = "a" * 64
    fingerprint = "b" * 64

    async with in_transaction() as conn:
        receipt = await _record_outcome(
            repository, plan=plan, draft=draft, key_hash=key_hash, fingerprint=fingerprint, conn=conn
        )
        replay = await repository.require_command_replay(
            target_plan_code=plan.code,
            action=CommerceCatalogCommandAction.CREATE_DRAFT,
            idempotency_key_hash=key_hash,
            request_fingerprint=fingerprint,
            conn=conn,
        )

    assert replay is not None
    assert replay.id == receipt.id
    assert replay.result_snapshot == {"planId": str(plan.id), "revisionId": str(draft.id)}
    assert replay.audit_event_id is not None
    audit = await AuditEvent.get(id=replay.audit_event_id)
    assert audit.properties == {
        "plan_code": plan.code,
        "action": "create_draft",
        "actor_session_id": str(receipt.actor_session_id),
    }


@pytest.mark.asyncio
async def test_catalog_command_receipt_rejects_mismatched_replay_fingerprint(db) -> None:
    repository = CommerceCatalogRepository()
    plan, draft = await _create_plan_and_draft()
    key_hash = "c" * 64

    async with in_transaction() as conn:
        await _record_outcome(repository, plan=plan, draft=draft, key_hash=key_hash, fingerprint="d" * 64, conn=conn)

    async with in_transaction() as conn:
        with pytest.raises(Conflict, match="COMMERCE_CATALOG_IDEMPOTENCY_CONFLICT"):
            await repository.require_command_replay(
                target_plan_code=plan.code,
                action=CommerceCatalogCommandAction.CREATE_DRAFT,
                idempotency_key_hash=key_hash,
                request_fingerprint="e" * 64,
                conn=conn,
            )


@pytest.mark.asyncio
async def test_catalog_command_scope_lock_serializes_the_first_idempotent_mutation(db) -> None:
    repository = CommerceCatalogRepository()
    plan, draft = await _create_plan_and_draft()
    key_hash = "i" * 64
    fingerprint = "j" * 64
    first_locked = asyncio.Event()
    release_first = asyncio.Event()

    async def first_request() -> CommerceCatalogCommandReceipt:
        async with in_transaction() as conn:
            await repository.lock_command_scope(
                target_plan_code=plan.code,
                action=CommerceCatalogCommandAction.CREATE_DRAFT,
                idempotency_key_hash=key_hash,
                conn=conn,
            )
            first_locked.set()
            await release_first.wait()
            return await _record_outcome(
                repository, plan=plan, draft=draft, key_hash=key_hash, fingerprint=fingerprint, conn=conn
            )

    async def replay_request() -> CommerceCatalogCommandReceipt | None:
        await first_locked.wait()
        async with in_transaction() as conn:
            await repository.lock_command_scope(
                target_plan_code=plan.code,
                action=CommerceCatalogCommandAction.CREATE_DRAFT,
                idempotency_key_hash=key_hash,
                conn=conn,
            )
            return await repository.require_command_replay(
                target_plan_code=plan.code,
                action=CommerceCatalogCommandAction.CREATE_DRAFT,
                idempotency_key_hash=key_hash,
                request_fingerprint=fingerprint,
                conn=conn,
            )

    first = asyncio.create_task(first_request())
    await first_locked.wait()
    replay = asyncio.create_task(replay_request())
    release_first.set()
    receipt = await first
    replayed = await replay

    assert replayed is not None
    assert replayed.id == receipt.id


@pytest.mark.asyncio
async def test_catalog_draft_update_rejects_a_stale_expected_revision(db) -> None:
    repository = CommerceCatalogRepository()
    plan, draft = await _create_plan_and_draft()
    conn = Tortoise.get_connection("default")
    await CommercePlanRevision.filter(id=draft.id).update(revision=2)

    with pytest.raises(Conflict, match="COMMERCE_CATALOG_REVISION_CONFLICT"):
        await repository.replace_draft_terms(
            draft=draft,
            expected_revision=draft.revision,
            terms=_terms(),
            resources={},
            entitlements={},
            conn=conn,
        )

    assert plan.id == draft.plan_id
    assert draft.revision == 1
    assert await CommercePlanRevision.filter(id=draft.id, revision=2).exists()


@pytest.mark.asyncio
async def test_catalog_concurrent_draft_updates_allow_one_current_revision(db) -> None:
    repository = CommerceCatalogRepository()
    plan, draft = await _create_plan_and_draft()
    first_locked = asyncio.Event()
    release_first = asyncio.Event()

    async def first_update() -> CommercePlanRevision:
        async with in_transaction() as conn:
            locked = await repository.lock_draft(revision_id=draft.id, plan_id=plan.id, conn=conn)
            assert locked is not None
            first_locked.set()
            await release_first.wait()
            return await repository.replace_draft_terms(
                draft=locked,
                expected_revision=1,
                terms=_terms(name_i18n_key="commerce.plan.first.name"),
                resources={},
                entitlements={},
                conn=conn,
            )

    async def second_update() -> CommercePlanRevision:
        await first_locked.wait()
        async with in_transaction() as conn:
            locked = await repository.lock_draft(revision_id=draft.id, plan_id=plan.id, conn=conn)
            assert locked is not None
            return await repository.replace_draft_terms(
                draft=locked,
                expected_revision=1,
                terms=_terms(name_i18n_key="commerce.plan.second.name"),
                resources={},
                entitlements={},
                conn=conn,
            )

    first = asyncio.create_task(first_update())
    await first_locked.wait()
    second = asyncio.create_task(second_update())
    release_first.set()
    updated = await first
    with pytest.raises(Conflict, match="COMMERCE_CATALOG_REVISION_CONFLICT"):
        await second

    persisted = await CommercePlanRevision.get(id=draft.id)
    assert updated.revision == 2
    assert persisted.revision == 2
    assert persisted.name_i18n_key == "commerce.plan.first.name"


@pytest.mark.asyncio
async def test_catalog_repository_rejects_published_revision_mutation(db) -> None:
    repository = CommerceCatalogRepository()
    _, published = await _create_plan_and_draft(status=PlanRevisionStatus.PUBLISHED)
    conn = Tortoise.get_connection("default")

    with pytest.raises(Conflict, match="COMMERCE_CATALOG_REVISION_IMMUTABLE"):
        await repository.replace_draft_terms(
            draft=published,
            expected_revision=published.revision,
            terms=_terms(),
            resources={},
            entitlements={},
            conn=conn,
        )


@pytest.mark.asyncio
async def test_catalog_receipt_and_activity_roll_back_together(db) -> None:
    repository = CommerceCatalogRepository()
    plan, draft = await _create_plan_and_draft()
    key_hash = "f" * 64

    async with in_transaction() as conn:
        await _record_outcome(repository, plan=plan, draft=draft, key_hash=key_hash, fingerprint="g" * 64, conn=conn)
    audit_count = await AuditEvent.filter(event_name="commerce.catalog.draft_created").count()

    with pytest.raises(IntegrityError):
        async with in_transaction() as conn:
            await _record_outcome(
                repository, plan=plan, draft=draft, key_hash=key_hash, fingerprint="h" * 64, conn=conn
            )

    assert await CommerceCatalogCommandReceipt.filter(idempotency_key_hash=key_hash).count() == 1
    assert await AuditEvent.filter(event_name="commerce.catalog.draft_created").count() == audit_count
