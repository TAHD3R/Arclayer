from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends

from src.common.types.public_uuid import PublicUUID
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.operational_signals.composition import get_operational_signal_service
from src.modules.operational_signals.schema import (
    OperationalSignalAssignCommand,
    OperationalSignalAssigneeOut,
    OperationalSignalDetailOut,
    OperationalSignalListQuery,
    OperationalSignalOut,
    OperationalSignalReminderCommand,
    OperationalSignalRevisionCommand,
)
from src.modules.operational_signals.service import OperationalSignalService
from src.modules.platform_identity.http import get_platform_identity_repository, require_platform_permission
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.repository import PlatformIdentityRepository
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal

router = APIRouter(prefix="/operational-signals", tags=["platform.operations-inbox"])


async def _current_permission_codes(
    *,
    actor: PlatformSessionPrincipal,
    repository: PlatformIdentityRepository,
) -> frozenset[str]:
    if actor.is_instance_owner:
        return frozenset(permission.value for permission in PlatformPermissionCode)
    if actor.operator_id is None:
        return frozenset()
    return await repository.list_effective_permission_codes(
        operator_id=actor.operator_id,
        at=datetime.now(UTC),
    )


@router.get(
    "",
    response_model=ResponseModel[PageData[OperationalSignalOut]],
    response_model_exclude_none=True,
    summary="List source-owned Operational Signals",
)
async def list_operational_signals(
    query: Annotated[OperationalSignalListQuery, Depends()],
    params: Annotated[PageParams, Depends(get_page_params)],
    actor: Annotated[
        PlatformSessionPrincipal,
        require_platform_permission(PlatformPermissionCode.OPERATIONS_SIGNALS_READ),
    ],
    repository: Annotated[PlatformIdentityRepository, Depends(get_platform_identity_repository)],
    service: Annotated[OperationalSignalService, Depends(get_operational_signal_service)],
) -> ResponseModel[PageData[OperationalSignalOut]]:
    permission_codes = await _current_permission_codes(actor=actor, repository=repository)
    return ApiResponse.success(
        data=await service.list_signals(
            filters=query,
            params=params,
            permission_codes=permission_codes,
        )
    )


@router.get(
    "/eligible-assignees",
    response_model=ResponseModel[tuple[OperationalSignalAssigneeOut, ...]],
    response_model_exclude_none=True,
    summary="List active operators eligible for Operational Signal assignment",
)
async def list_operational_signal_eligible_assignees(
    _actor: Annotated[
        PlatformSessionPrincipal,
        require_platform_permission(PlatformPermissionCode.OPERATIONS_SIGNALS_ASSIGN),
    ],
    service: Annotated[OperationalSignalService, Depends(get_operational_signal_service)],
) -> ResponseModel[tuple[OperationalSignalAssigneeOut, ...]]:
    return ApiResponse.success(data=await service.list_eligible_assignees())


@router.get(
    "/{signal_id}",
    response_model=ResponseModel[OperationalSignalDetailOut],
    response_model_exclude_none=True,
    summary="Get one Operational Signal and retained triage history",
)
async def get_operational_signal(
    signal_id: PublicUUID,
    actor: Annotated[
        PlatformSessionPrincipal,
        require_platform_permission(PlatformPermissionCode.OPERATIONS_SIGNALS_READ),
    ],
    repository: Annotated[PlatformIdentityRepository, Depends(get_platform_identity_repository)],
    service: Annotated[OperationalSignalService, Depends(get_operational_signal_service)],
) -> ResponseModel[OperationalSignalDetailOut]:
    permission_codes = await _current_permission_codes(actor=actor, repository=repository)
    return ApiResponse.success(
        data=await service.get_signal(
            signal_id=signal_id,
            permission_codes=permission_codes,
        )
    )


@router.post(
    "/{signal_id}/claim",
    response_model=ResponseModel[OperationalSignalDetailOut],
    response_model_exclude_none=True,
    summary="Claim an unassigned Operational Signal",
)
async def claim_operational_signal(
    signal_id: PublicUUID,
    payload: OperationalSignalRevisionCommand,
    actor: Annotated[
        PlatformSessionPrincipal,
        require_platform_permission(PlatformPermissionCode.OPERATIONS_SIGNALS_CLAIM),
    ],
    repository: Annotated[PlatformIdentityRepository, Depends(get_platform_identity_repository)],
    service: Annotated[OperationalSignalService, Depends(get_operational_signal_service)],
) -> ResponseModel[OperationalSignalDetailOut]:
    permission_codes = await _current_permission_codes(actor=actor, repository=repository)
    return ApiResponse.success(
        data=await service.claim(
            signal_id=signal_id,
            actor_user_id=actor.actor_id,
            expected_revision=payload.expected_revision,
            permission_codes=permission_codes,
        )
    )


@router.post(
    "/{signal_id}/assign",
    response_model=ResponseModel[OperationalSignalDetailOut],
    response_model_exclude_none=True,
    summary="Assign an Operational Signal to an eligible operator",
)
async def assign_operational_signal(
    signal_id: PublicUUID,
    payload: OperationalSignalAssignCommand,
    actor: Annotated[
        PlatformSessionPrincipal,
        require_platform_permission(PlatformPermissionCode.OPERATIONS_SIGNALS_ASSIGN),
    ],
    repository: Annotated[PlatformIdentityRepository, Depends(get_platform_identity_repository)],
    service: Annotated[OperationalSignalService, Depends(get_operational_signal_service)],
) -> ResponseModel[OperationalSignalDetailOut]:
    permission_codes = await _current_permission_codes(actor=actor, repository=repository)
    return ApiResponse.success(
        data=await service.assign(
            signal_id=signal_id,
            actor_user_id=actor.actor_id,
            assignee_user_id=payload.assignee_user_id,
            expected_revision=payload.expected_revision,
            permission_codes=permission_codes,
        )
    )


@router.post(
    "/{signal_id}/in-progress",
    response_model=ResponseModel[OperationalSignalDetailOut],
    response_model_exclude_none=True,
    summary="Mark assigned Operational Signal work in progress",
)
async def mark_operational_signal_in_progress(
    signal_id: PublicUUID,
    payload: OperationalSignalRevisionCommand,
    actor: Annotated[
        PlatformSessionPrincipal,
        require_platform_permission(PlatformPermissionCode.OPERATIONS_SIGNALS_TRIAGE),
    ],
    repository: Annotated[PlatformIdentityRepository, Depends(get_platform_identity_repository)],
    service: Annotated[OperationalSignalService, Depends(get_operational_signal_service)],
) -> ResponseModel[OperationalSignalDetailOut]:
    permission_codes = await _current_permission_codes(actor=actor, repository=repository)
    return ApiResponse.success(
        data=await service.mark_in_progress(
            signal_id=signal_id,
            actor_user_id=actor.actor_id,
            expected_revision=payload.expected_revision,
            permission_codes=permission_codes,
        )
    )


@router.post(
    "/{signal_id}/remind-later",
    response_model=ResponseModel[OperationalSignalDetailOut],
    response_model_exclude_none=True,
    summary="Set a time-bounded Operational Signal reminder",
)
async def remind_operational_signal_later(
    signal_id: PublicUUID,
    payload: OperationalSignalReminderCommand,
    actor: Annotated[
        PlatformSessionPrincipal,
        require_platform_permission(PlatformPermissionCode.OPERATIONS_SIGNALS_TRIAGE),
    ],
    repository: Annotated[PlatformIdentityRepository, Depends(get_platform_identity_repository)],
    service: Annotated[OperationalSignalService, Depends(get_operational_signal_service)],
) -> ResponseModel[OperationalSignalDetailOut]:
    permission_codes = await _current_permission_codes(actor=actor, repository=repository)
    return ApiResponse.success(
        data=await service.remind_later(
            signal_id=signal_id,
            actor_user_id=actor.actor_id,
            expected_revision=payload.expected_revision,
            reminder_at=payload.reminder_at,
            reason=payload.reason,
            permission_codes=permission_codes,
        )
    )


@router.post(
    "/{signal_id}/needs-attention",
    response_model=ResponseModel[OperationalSignalDetailOut],
    response_model_exclude_none=True,
    summary="Return an Operational Signal to needs attention",
)
async def mark_operational_signal_needs_attention(
    signal_id: PublicUUID,
    payload: OperationalSignalRevisionCommand,
    actor: Annotated[
        PlatformSessionPrincipal,
        require_platform_permission(PlatformPermissionCode.OPERATIONS_SIGNALS_TRIAGE),
    ],
    repository: Annotated[PlatformIdentityRepository, Depends(get_platform_identity_repository)],
    service: Annotated[OperationalSignalService, Depends(get_operational_signal_service)],
) -> ResponseModel[OperationalSignalDetailOut]:
    permission_codes = await _current_permission_codes(actor=actor, repository=repository)
    return ApiResponse.success(
        data=await service.mark_needs_attention(
            signal_id=signal_id,
            actor_user_id=actor.actor_id,
            expected_revision=payload.expected_revision,
            permission_codes=permission_codes,
        )
    )
