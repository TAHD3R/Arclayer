from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from uuid import UUID

from tortoise.transactions import in_transaction

from src.core.exceptions import Conflict, ServiceUnavailable
from src.models.commerce.access_facts import CommercialAccessFact, CommercialAccessFactKind
from src.models.hosting.commercial_access import (
    HostingCommercialAccessProjection,
    HostingCommercialAccessReceipt,
    HostingCommercialAccessState,
    HostingContinuityPolicy,
    HostingContinuityTarget,
    HostingContinuityTargetGate,
    HostingContinuityTargetRestorationState,
)
from src.modules.hosting.delivery_contracts import (
    HostingDeliveryPort,
    HostingDeliveryTarget,
    HostingDeliveryTargetResult,
    HostingRestorationTarget,
    HostingVisitorDeliveryGate,
)

_DELIVERY_TRANSITION_FAILED = "HOSTING_DELIVERY_TRANSITION_FAILED"
_RESTORATION_FAILED = "HOSTING_RESTORATION_FAILED"
_FACT_ORDER_CONFLICT = "HOSTING_COMMERCIAL_FACT_ORDER_CONFLICT"
_FACT_RETRY_CONFLICT = "HOSTING_COMMERCIAL_FACT_RETRY_CONFLICT"
_TARGET_RESULTS_INVALID = "HOSTING_DELIVERY_TARGET_RESULTS_INVALID"


class HostingCommercialAccessConsumer:
    """Applies immutable Commerce access facts to every current Workspace delivery target."""

    def __init__(
        self,
        *,
        delivery: HostingDeliveryPort | None = None,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self._delivery = delivery
        self._now = now or (lambda: datetime.now(UTC))

    async def consume(self, *, source_identity: str) -> HostingCommercialAccessState:
        receipt, fact = await self._load_fact(source_identity=source_identity)
        if receipt is not None:
            return receipt
        if fact is None:
            raise ServiceUnavailable(error="COMMERCIAL_HOSTING_FACT_UNAVAILABLE")
        if self._next_state(fact.payload) is HostingCommercialAccessState.CONTINUITY_REQUIRED:
            return await self._enter_continuity(fact=fact)
        return await self._restore_delivery(fact=fact)

    async def suspend_due(self, *, workspace_id: UUID) -> HostingCommercialAccessState:
        prepared = await self._prepare_suspension(workspace_id=workspace_id, now=self._now())
        if prepared is None:
            projection = await HostingCommercialAccessProjection.get_or_none(workspace_id=workspace_id)
            return projection.state if projection is not None else HostingCommercialAccessState.SERVING
        source_identity, targets = prepared
        state = await self._apply_gate(
            workspace_id=workspace_id,
            gate=HostingVisitorDeliveryGate.SUSPENDED,
            targets=targets,
            failure_code=_DELIVERY_TRANSITION_FAILED,
        )
        if state is not HostingCommercialAccessState.SUSPENDED:
            raise ServiceUnavailable(error=_DELIVERY_TRANSITION_FAILED)
        await self._write_receipt(
            source_identity=source_identity,
            workspace_id=workspace_id,
            resulting_state=state,
        )
        return state

    async def _enter_continuity(self, *, fact: CommercialAccessFact) -> HostingCommercialAccessState:
        policy = await self._require_active_policy()
        candidates = await self._require_delivery().list_current_serving_targets(workspace_id=fact.workspace_id)
        prepared = await self._prepare_continuity(fact=fact, policy=policy, candidates=candidates)
        if prepared is None:
            return (await HostingCommercialAccessProjection.get(workspace_id=fact.workspace_id)).state
        state = await self._apply_gate(
            workspace_id=fact.workspace_id,
            gate=HostingVisitorDeliveryGate.CONTINUITY,
            targets=prepared,
            failure_code=_DELIVERY_TRANSITION_FAILED,
        )
        if state is not HostingCommercialAccessState.CONTINUITY_REQUIRED:
            raise ServiceUnavailable(error=_DELIVERY_TRANSITION_FAILED)
        await self._write_receipt(
            source_identity=fact.source_identity,
            workspace_id=fact.workspace_id,
            resulting_state=state,
        )
        return state

    async def _restore_delivery(self, *, fact: CommercialAccessFact) -> HostingCommercialAccessState:
        targets = await self._prepare_restoration(fact=fact)
        if targets is None:
            projection = await HostingCommercialAccessProjection.get_or_none(workspace_id=fact.workspace_id)
            return projection.state if projection is not None else HostingCommercialAccessState.SERVING
        try:
            targets = await self._start_restorations(fact=fact, targets=targets)
            targets = await self._verify_restorations(workspace_id=fact.workspace_id, targets=targets)
            state = await self._restore_verified_targets(workspace_id=fact.workspace_id, targets=targets)
        except Exception:
            raise
        if state is not HostingCommercialAccessState.RESTORED:
            raise ServiceUnavailable(error=_RESTORATION_FAILED)
        await self._write_receipt(
            source_identity=fact.source_identity,
            workspace_id=fact.workspace_id,
            resulting_state=state,
        )
        return state

    async def _load_fact(
        self, *, source_identity: str
    ) -> tuple[HostingCommercialAccessState | None, CommercialAccessFact | None]:
        async with in_transaction() as conn:
            receipt = (
                await HostingCommercialAccessReceipt.filter(source_identity=source_identity).using_db(conn).first()
            )
            if receipt is not None:
                return HostingCommercialAccessState(receipt.resulting_state), None
            fact = (
                await CommercialAccessFact
                .filter(
                    kind=CommercialAccessFactKind.HOSTING_HANDOFF,
                    source_identity=source_identity,
                )
                .using_db(conn)
                .first()
            )
            return None, fact

    async def _prepare_continuity(
        self,
        *,
        fact: CommercialAccessFact,
        policy: HostingContinuityPolicy,
        candidates: tuple[HostingDeliveryTarget, ...],
    ) -> list[HostingContinuityTarget] | None:
        self._validate_targets(candidates)
        async with in_transaction() as conn:
            projection = await self._locked_projection(workspace_id=fact.workspace_id, conn=conn)
            if projection is not None:
                order = self._fact_order(fact=fact, projection=projection)
                if order == "stale":
                    await self._write_receipt_in_transaction(
                        source_identity=fact.source_identity,
                        workspace_id=fact.workspace_id,
                        resulting_state=HostingCommercialAccessState(projection.state),
                        conn=conn,
                    )
                    return None
                if order == "retry":
                    if projection.continuity_source_identity != fact.source_identity:
                        raise Conflict(error=_FACT_RETRY_CONFLICT)
                    return await self._locked_targets(projection_id=projection.id, conn=conn)
                if projection.state in {
                    HostingCommercialAccessState.CONTINUITY_REQUIRED,
                    HostingCommercialAccessState.SUSPENDED,
                }:
                    await self._write_receipt_in_transaction(
                        source_identity=fact.source_identity,
                        workspace_id=fact.workspace_id,
                        resulting_state=HostingCommercialAccessState(projection.state),
                        conn=conn,
                    )
                    return None
            deadline = fact.effective_at + timedelta(seconds=policy.continuity_window_seconds)
            if projection is None:
                projection = await HostingCommercialAccessProjection.create(
                    workspace_id=fact.workspace_id,
                    state=HostingCommercialAccessState.CONTINUITY_REQUIRED,
                    source_identity=fact.source_identity,
                    continuity_source_identity=fact.source_identity,
                    continuity_started_at=fact.effective_at,
                    continuity_deadline=deadline,
                    policy_revision=policy.revision,
                    last_fact_effective_at=fact.effective_at,
                    using_db=conn,
                )
            else:
                projection.state = HostingCommercialAccessState.CONTINUITY_REQUIRED
                projection.source_identity = fact.source_identity
                projection.continuity_source_identity = fact.source_identity
                projection.continuity_started_at = fact.effective_at
                projection.continuity_deadline = deadline
                projection.policy_revision = policy.revision
                projection.last_fact_effective_at = fact.effective_at
                projection.delivery_error_code = None
                projection.delivery_error_message = None
                await projection.save(using_db=conn)
                await HostingContinuityTarget.filter(projection_id=projection.id).using_db(conn).delete()
            return await self._create_targets(projection=projection, candidates=candidates, conn=conn)

    async def _prepare_restoration(self, *, fact: CommercialAccessFact) -> list[HostingContinuityTarget] | None:
        async with in_transaction() as conn:
            projection = await self._locked_projection(workspace_id=fact.workspace_id, conn=conn)
            if projection is None:
                await self._write_receipt_in_transaction(
                    source_identity=fact.source_identity,
                    workspace_id=fact.workspace_id,
                    resulting_state=HostingCommercialAccessState.SERVING,
                    conn=conn,
                )
                return None
            order = self._fact_order(fact=fact, projection=projection)
            if order == "stale":
                await self._write_receipt_in_transaction(
                    source_identity=fact.source_identity,
                    workspace_id=fact.workspace_id,
                    resulting_state=HostingCommercialAccessState(projection.state),
                    conn=conn,
                )
                return None
            if order == "retry":
                if projection.restoration_source_identity != fact.source_identity:
                    raise Conflict(error=_FACT_RETRY_CONFLICT)
                return await self._locked_targets(projection_id=projection.id, conn=conn)
            if projection.state in {HostingCommercialAccessState.SERVING, HostingCommercialAccessState.RESTORED}:
                await self._write_receipt_in_transaction(
                    source_identity=fact.source_identity,
                    workspace_id=fact.workspace_id,
                    resulting_state=HostingCommercialAccessState(projection.state),
                    conn=conn,
                )
                return None
            projection.state = HostingCommercialAccessState.RESTORATION_REQUIRED
            projection.source_identity = fact.source_identity
            projection.restoration_source_identity = fact.source_identity
            projection.last_fact_effective_at = fact.effective_at
            await projection.save(using_db=conn)
            targets = await self._locked_targets(projection_id=projection.id, conn=conn)
            for target in targets:
                target.restoration_state = HostingContinuityTargetRestorationState.PENDING
                target.operation_identity = None
                target.failure_code = None
                target.failure_message = None
                target.verified_at = None
                await target.save(using_db=conn)
                await HostingContinuityTarget.filter(id=target.id).using_db(conn).update(verification_evidence=None)
            return targets

    async def _prepare_suspension(
        self, *, workspace_id: UUID, now: datetime
    ) -> tuple[str, list[HostingContinuityTarget]] | None:
        async with in_transaction() as conn:
            projection = await self._locked_projection(workspace_id=workspace_id, conn=conn)
            if projection is None:
                return None
            identity = self._deadline_identity(projection=projection)
            if projection.state in {HostingCommercialAccessState.SUSPENDED, HostingCommercialAccessState.PARTIAL}:
                receipt = await HostingCommercialAccessReceipt.filter(source_identity=identity).using_db(conn).first()
                return (
                    (identity, await self._locked_targets(projection_id=projection.id, conn=conn))
                    if receipt is None
                    else None
                )
            if projection.state is not HostingCommercialAccessState.CONTINUITY_REQUIRED:
                return None
            if projection.continuity_deadline is None:
                raise Conflict(error="HOSTING_CONTINUITY_DEADLINE_MISSING")
            if now < projection.continuity_deadline:
                return None
            projection.source_identity = identity
            await projection.save(using_db=conn)
            return identity, await self._locked_targets(projection_id=projection.id, conn=conn)

    async def _apply_gate(
        self,
        *,
        workspace_id: UUID,
        gate: HostingVisitorDeliveryGate,
        targets: list[HostingContinuityTarget],
        failure_code: str,
    ) -> HostingCommercialAccessState:
        delivery_targets = self._delivery_targets(targets)
        delivery = self._require_delivery()
        try:
            gate_results = await delivery.apply_visitor_delivery_gate(
                workspace_id=workspace_id,
                gate=gate,
                targets=delivery_targets,
            )
            cache_results = await delivery.invalidate_delivery_cache(
                workspace_id=workspace_id, targets=delivery_targets
            )
        except Exception as exc:
            await self._mark_targets_failed(targets=targets, failure_code=failure_code)
            raise ServiceUnavailable(error=failure_code) from exc
        return await self._record_gate_results(
            targets=targets,
            gate=gate,
            gate_results=gate_results,
            cache_results=cache_results,
        )

    async def _start_restorations(
        self, *, fact: CommercialAccessFact, targets: list[HostingContinuityTarget]
    ) -> list[HostingContinuityTarget]:
        candidates = [target for target in targets if target.operation_identity is None]
        if not candidates:
            return targets
        try:
            results = await self._require_delivery().start_restoration(
                workspace_id=fact.workspace_id,
                source_identity=fact.source_identity,
                targets=self._delivery_targets(candidates),
            )
        except Exception as exc:
            await self._mark_targets_failed(targets=candidates, failure_code=_RESTORATION_FAILED)
            raise ServiceUnavailable(error=_RESTORATION_FAILED) from exc
        return await self._record_restoration_start(targets=candidates, results=results)

    async def _verify_restorations(
        self, *, workspace_id: UUID, targets: list[HostingContinuityTarget]
    ) -> list[HostingContinuityTarget]:
        candidates = [
            target for target in targets if target.operation_identity is not None and target.verified_at is None
        ]
        if not candidates:
            return targets
        requests = tuple(
            HostingRestorationTarget(
                target=self._delivery_target(target), operation_identity=str(target.operation_identity)
            )
            for target in candidates
        )
        try:
            results = await self._require_delivery().verify_restoration(workspace_id=workspace_id, targets=requests)
        except Exception as exc:
            await self._mark_targets_failed(targets=candidates, failure_code=_RESTORATION_FAILED)
            raise ServiceUnavailable(error=_RESTORATION_FAILED) from exc
        return await self._record_restoration_verification(targets=candidates, results=results)

    async def _restore_verified_targets(
        self, *, workspace_id: UUID, targets: list[HostingContinuityTarget]
    ) -> HostingCommercialAccessState:
        verified = [target for target in targets if target.verified_at is not None]
        if verified:
            return await self._apply_gate(
                workspace_id=workspace_id,
                gate=HostingVisitorDeliveryGate.SERVING,
                targets=verified,
                failure_code=_RESTORATION_FAILED,
            )
        return await self._refresh_aggregate(
            projection_id=targets[0].projection_id if targets else None, gate=HostingVisitorDeliveryGate.SERVING
        )

    async def _record_gate_results(
        self,
        *,
        targets: list[HostingContinuityTarget],
        gate: HostingVisitorDeliveryGate,
        gate_results: tuple[HostingDeliveryTargetResult, ...],
        cache_results: tuple[HostingDeliveryTargetResult, ...],
    ) -> HostingCommercialAccessState:
        gate_by_key = self._result_map(targets=targets, results=gate_results)
        cache_by_key = self._result_map(targets=targets, results=cache_results)
        async with in_transaction() as conn:
            locked = await self._locked_targets(projection_id=targets[0].projection_id if targets else None, conn=conn)
            selected = {self._target_key(target) for target in targets}
            for target in locked:
                if self._target_key(target) not in selected:
                    continue
                gate_result = gate_by_key[self._target_key(target)]
                cache_result = cache_by_key[self._target_key(target)]
                if gate_result.succeeded and cache_result.succeeded:
                    target.gate = HostingContinuityTargetGate(gate)
                    target.failure_code = None
                    target.failure_message = None
                    if gate is HostingVisitorDeliveryGate.SERVING:
                        target.restoration_state = HostingContinuityTargetRestorationState.SUCCEEDED
                    await target.save(using_db=conn)
                    continue
                failure = cache_result if not cache_result.succeeded else gate_result
                target.failure_code = failure.failure_code or _DELIVERY_TRANSITION_FAILED
                target.failure_message = failure.failure_message or "Hosting delivery operation did not complete."
                if gate is HostingVisitorDeliveryGate.SERVING:
                    target.restoration_state = HostingContinuityTargetRestorationState.FAILED
                await target.save(using_db=conn)
            return await self._aggregate_locked(
                projection_id=targets[0].projection_id if targets else None, gate=gate, conn=conn
            )

    async def _record_restoration_start(
        self, *, targets: list[HostingContinuityTarget], results: tuple[HostingDeliveryTargetResult, ...]
    ) -> list[HostingContinuityTarget]:
        by_key = self._result_map(targets=targets, results=results)
        async with in_transaction() as conn:
            locked = await self._locked_targets(projection_id=targets[0].projection_id, conn=conn)
            selected = {self._target_key(target) for target in targets}
            for target in locked:
                result = by_key.get(self._target_key(target))
                if result is None or self._target_key(target) not in selected:
                    continue
                if result.succeeded and result.operation_identity:
                    target.operation_identity = result.operation_identity
                    target.failure_code = None
                    target.failure_message = None
                elif result.succeeded:
                    raise Conflict(error=_TARGET_RESULTS_INVALID)
                else:
                    target.restoration_state = HostingContinuityTargetRestorationState.FAILED
                    target.failure_code = result.failure_code or _RESTORATION_FAILED
                    target.failure_message = result.failure_message or "Hosting restoration did not start."
                await target.save(using_db=conn)
            return locked

    async def _record_restoration_verification(
        self, *, targets: list[HostingContinuityTarget], results: tuple[HostingDeliveryTargetResult, ...]
    ) -> list[HostingContinuityTarget]:
        by_key = self._result_map(targets=targets, results=results)
        async with in_transaction() as conn:
            locked = await self._locked_targets(projection_id=targets[0].projection_id, conn=conn)
            selected = {self._target_key(target) for target in targets}
            for target in locked:
                result = by_key.get(self._target_key(target))
                if result is None or self._target_key(target) not in selected:
                    continue
                if result.succeeded:
                    target.verified_at = self._now()
                    target.failure_code = None
                    target.failure_message = None
                    await target.save(using_db=conn)
                    await (
                        HostingContinuityTarget
                        .filter(id=target.id)
                        .using_db(conn)
                        .update(verification_evidence=result.verification_evidence)
                    )
                    continue
                else:
                    target.restoration_state = HostingContinuityTargetRestorationState.FAILED
                    target.failure_code = result.failure_code or _RESTORATION_FAILED
                    target.failure_message = result.failure_message or "Hosting restoration was not verified."
                await target.save(using_db=conn)
            return locked

    async def _mark_targets_failed(self, *, targets: list[HostingContinuityTarget], failure_code: str) -> None:
        if not targets:
            return
        async with in_transaction() as conn:
            locked = await self._locked_targets(projection_id=targets[0].projection_id, conn=conn)
            selected = {self._target_key(target) for target in targets}
            for target in locked:
                if self._target_key(target) not in selected:
                    continue
                target.failure_code = failure_code
                target.failure_message = "Hosting delivery operation did not complete."
                if target.restoration_state is HostingContinuityTargetRestorationState.PENDING:
                    target.restoration_state = HostingContinuityTargetRestorationState.FAILED
                await target.save(using_db=conn)
            await self._aggregate_locked(projection_id=targets[0].projection_id, gate=None, conn=conn)

    async def _refresh_aggregate(
        self, *, projection_id, gate: HostingVisitorDeliveryGate
    ) -> HostingCommercialAccessState:
        if projection_id is None:
            return HostingCommercialAccessState.RESTORED
        async with in_transaction() as conn:
            return await self._aggregate_locked(projection_id=projection_id, gate=gate, conn=conn)

    async def _aggregate_locked(
        self, *, projection_id, gate: HostingVisitorDeliveryGate | None, conn
    ) -> HostingCommercialAccessState:
        projection = (
            await HostingCommercialAccessProjection.filter(id=projection_id).using_db(conn).select_for_update().first()
        )
        if projection is None:
            raise Conflict(error="HOSTING_COMMERCIAL_ACCESS_PROJECTION_UNAVAILABLE")
        targets = await self._locked_targets(projection_id=projection_id, conn=conn)
        expected = HostingContinuityTargetGate(gate) if gate is not None else None
        if expected is HostingContinuityTargetGate.SERVING:
            complete = all(
                target.gate is expected
                and target.restoration_state is HostingContinuityTargetRestorationState.SUCCEEDED
                for target in targets
            )
            state = HostingCommercialAccessState.RESTORED if complete else HostingCommercialAccessState.PARTIAL
        else:
            complete = expected is not None and all(
                target.gate is expected and target.failure_code is None for target in targets
            )
            states = {
                HostingContinuityTargetGate.CONTINUITY: HostingCommercialAccessState.CONTINUITY_REQUIRED,
                HostingContinuityTargetGate.SUSPENDED: HostingCommercialAccessState.SUSPENDED,
            }
            state = states[expected] if complete and expected in states else HostingCommercialAccessState.PARTIAL
        projection.state = state
        if state is HostingCommercialAccessState.RESTORED:
            projection.continuity_source_identity = None
            projection.continuity_started_at = None
            projection.continuity_deadline = None
            projection.policy_revision = None
        await projection.save(using_db=conn)
        return state

    async def _require_active_policy(self) -> HostingContinuityPolicy:
        policies = await HostingContinuityPolicy.filter(is_active=True).order_by("-revision").limit(2)
        if len(policies) != 1:
            raise ServiceUnavailable(error="HOSTING_CONTINUITY_POLICY_UNAVAILABLE")
        policy = policies[0]
        if policy.revision < 1 or policy.continuity_window_seconds < 1:
            raise ServiceUnavailable(error="HOSTING_CONTINUITY_POLICY_INVALID")
        return policy

    def _require_delivery(self) -> HostingDeliveryPort:
        if self._delivery is None:
            raise ServiceUnavailable(error="HOSTING_DELIVERY_PORT_UNAVAILABLE")
        return self._delivery

    async def _write_receipt(
        self, *, source_identity: str, workspace_id: UUID, resulting_state: HostingCommercialAccessState
    ) -> None:
        async with in_transaction() as conn:
            await self._write_receipt_in_transaction(
                source_identity=source_identity,
                workspace_id=workspace_id,
                resulting_state=resulting_state,
                conn=conn,
            )

    async def _write_receipt_in_transaction(
        self, *, source_identity: str, workspace_id: UUID, resulting_state, conn
    ) -> None:
        receipt, created = await HostingCommercialAccessReceipt.get_or_create(
            source_identity=source_identity,
            defaults={"workspace_id": workspace_id, "resulting_state": resulting_state},
            using_db=conn,
        )
        if not created and (receipt.workspace_id != workspace_id or receipt.resulting_state != resulting_state):
            raise Conflict(error="HOSTING_COMMERCIAL_ACCESS_RECEIPT_CONFLICT")

    @staticmethod
    async def _locked_projection(*, workspace_id: UUID, conn) -> HostingCommercialAccessProjection | None:
        return (
            await HostingCommercialAccessProjection
            .filter(workspace_id=workspace_id)
            .using_db(conn)
            .select_for_update()
            .first()
        )

    @staticmethod
    async def _locked_targets(*, projection_id, conn) -> list[HostingContinuityTarget]:
        if projection_id is None:
            return []
        return list(
            await HostingContinuityTarget
            .filter(projection_id=projection_id)
            .using_db(conn)
            .order_by("site_id", "runtime_id")
            .select_for_update()
        )

    @staticmethod
    async def _create_targets(
        *, projection: HostingCommercialAccessProjection, candidates: tuple[HostingDeliveryTarget, ...], conn
    ) -> list[HostingContinuityTarget]:
        for target in candidates:
            await HostingContinuityTarget.create(
                projection_id=projection.id,
                site_id=target.site_id,
                runtime_id=target.runtime_id,
                preserved_release_id=target.preserved_release_id,
                using_db=conn,
            )
        return await HostingCommercialAccessConsumer._locked_targets(projection_id=projection.id, conn=conn)

    @staticmethod
    def _validate_targets(targets: tuple[HostingDeliveryTarget, ...]) -> None:
        keys = [HostingCommercialAccessConsumer._target_key(target) for target in targets]
        if len(keys) != len(set(keys)):
            raise Conflict(error=_TARGET_RESULTS_INVALID)

    @staticmethod
    def _result_map(
        *, targets: list[HostingContinuityTarget], results: tuple[HostingDeliveryTargetResult, ...]
    ) -> dict[tuple[UUID, UUID], HostingDeliveryTargetResult]:
        expected = {HostingCommercialAccessConsumer._target_key(target) for target in targets}
        actual = [HostingCommercialAccessConsumer._target_key(result.target) for result in results]
        if len(actual) != len(set(actual)) or set(actual) != expected:
            raise Conflict(error=_TARGET_RESULTS_INVALID)
        return {HostingCommercialAccessConsumer._target_key(result.target): result for result in results}

    @staticmethod
    def _delivery_targets(targets: list[HostingContinuityTarget]) -> tuple[HostingDeliveryTarget, ...]:
        return tuple(HostingCommercialAccessConsumer._delivery_target(target) for target in targets)

    @staticmethod
    def _delivery_target(target: HostingContinuityTarget) -> HostingDeliveryTarget:
        return HostingDeliveryTarget(
            site_id=target.site_id,
            runtime_id=target.runtime_id,
            preserved_release_id=target.preserved_release_id,
        )

    @staticmethod
    def _target_key(target: HostingContinuityTarget | HostingDeliveryTarget) -> tuple[UUID, UUID]:
        return target.site_id, target.runtime_id

    @staticmethod
    def _fact_order(*, fact: CommercialAccessFact, projection: HostingCommercialAccessProjection) -> str:
        if projection.last_fact_effective_at is None or fact.effective_at > projection.last_fact_effective_at:
            return "new"
        if fact.effective_at < projection.last_fact_effective_at:
            return "stale"
        identities = {
            identity
            for identity in (
                projection.source_identity,
                projection.continuity_source_identity,
                projection.restoration_source_identity,
            )
            if identity is not None
        }
        if fact.source_identity in identities:
            return "retry"
        raise Conflict(error=_FACT_ORDER_CONFLICT)

    @staticmethod
    def _deadline_identity(*, projection: HostingCommercialAccessProjection) -> str:
        if projection.continuity_source_identity is None or projection.continuity_deadline is None:
            raise Conflict(error="HOSTING_CONTINUITY_IDENTITY_MISSING")
        value = f"{projection.continuity_source_identity}:{projection.continuity_deadline.isoformat()}"
        return f"hosting-deadline:{sha256(value.encode()).hexdigest()}"

    @staticmethod
    def _next_state(payload: dict[str, object]) -> HostingCommercialAccessState:
        state = str(payload.get("state", ""))
        if state == "payment_restricted":
            return HostingCommercialAccessState.CONTINUITY_REQUIRED
        if state == "normal":
            return HostingCommercialAccessState.RESTORATION_REQUIRED
        raise Conflict(error="COMMERCIAL_HOSTING_FACT_INVALID")
