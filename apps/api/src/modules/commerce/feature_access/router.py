from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Path, Query

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.commerce.dunning.command_policy import (
    RestrictedRecoveryCommandPolicy,
    build_restricted_recovery_command_policy,
)
from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect
from src.modules.commerce.feature_access.composition import build_feature_access_service
from src.modules.commerce.feature_access.contracts import (
    AssignFeatureAccessCommand,
    MoveFeatureAccessCommand,
    RevokeFeatureAccessCommand,
)
from src.modules.commerce.feature_access.read_composition import build_feature_access_read_service
from src.modules.commerce.feature_access.read_contracts import FeatureAccessReadResult
from src.modules.commerce.feature_access.read_service import FeatureAccessReadService
from src.modules.commerce.feature_access.schema import (
    FeatureAccessAssignRequest,
    FeatureAccessMoveRequest,
    FeatureAccessMutationOut,
    feature_access_mutation_out,
)
from src.modules.commerce.feature_access.service import FeatureAccessService

router = APIRouter(
    prefix="/workspaces/{workspace_id}/feature-access",
    tags=["domain.commerce.feature-access"],
)

ActorUserId = Annotated[UUID, Depends(get_current_user_id)]
IdempotencyKey = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=255)]
FeatureKey = Annotated[
    str,
    Path(min_length=3, max_length=160, pattern=r"^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$"),
]
ExpectedRevision = Annotated[int, Query(alias="expectedRevision", ge=0)]


def get_feature_access_service(
    settings: Annotated[Settings, Depends(get_settings)],
) -> FeatureAccessService:
    return build_feature_access_service(settings)


def get_feature_access_read_service(
    settings: Annotated[Settings, Depends(get_settings)],
) -> FeatureAccessReadService:
    return build_feature_access_read_service(settings)


def get_restricted_recovery_command_policy() -> RestrictedRecoveryCommandPolicy:
    return build_restricted_recovery_command_policy()


FeatureAccessServiceDependency = Annotated[
    FeatureAccessService,
    Depends(get_feature_access_service),
]
FeatureAccessReadServiceDependency = Annotated[
    FeatureAccessReadService,
    Depends(get_feature_access_read_service),
]
RestrictedRecoveryPolicyDependency = Annotated[
    RestrictedRecoveryCommandPolicy,
    Depends(get_restricted_recovery_command_policy),
]


@router.get(
    "",
    response_model=ResponseModel[FeatureAccessReadResult],
    summary="Read member access included in the Workspace plan",
)
async def read_feature_access(
    workspace_id: PublicUUID,
    actor_user_id: ActorUserId,
    service: FeatureAccessReadServiceDependency,
) -> ResponseModel[FeatureAccessReadResult]:
    result = await service.read(workspace_id=workspace_id, actor_user_id=actor_user_id)
    return ApiResponse.success(data=result)


@router.post(
    "/{entitlement_key}/assignments",
    response_model=ResponseModel[FeatureAccessMutationOut],
    summary="Assign member access included in the Workspace plan",
)
async def assign_feature_access(
    workspace_id: PublicUUID,
    entitlement_key: FeatureKey,
    payload: FeatureAccessAssignRequest,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: FeatureAccessServiceDependency,
    commercial_policy: RestrictedRecoveryPolicyDependency,
) -> ResponseModel[FeatureAccessMutationOut]:
    await commercial_policy.authorize(
        workspace_id=UUID(str(workspace_id)),
        effects={RestrictedRecoveryEffect.ASSIGN_FEATURE_SEAT},
    )
    result = await service.assign(
        AssignFeatureAccessCommand(
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            entitlement_key=entitlement_key,
            membership_id=payload.membership_id,
            expected_revision=payload.expected_revision,
            idempotency_key=idempotency_key,
        )
    )
    return ApiResponse.success(data=feature_access_mutation_out(result))


@router.post(
    "/{entitlement_key}/assignments/move",
    response_model=ResponseModel[FeatureAccessMutationOut],
    summary="Move member access included in the Workspace plan",
)
async def move_feature_access(
    workspace_id: PublicUUID,
    entitlement_key: FeatureKey,
    payload: FeatureAccessMoveRequest,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: FeatureAccessServiceDependency,
    commercial_policy: RestrictedRecoveryPolicyDependency,
) -> ResponseModel[FeatureAccessMutationOut]:
    await commercial_policy.authorize(
        workspace_id=UUID(str(workspace_id)),
        effects={RestrictedRecoveryEffect.ASSIGN_FEATURE_SEAT},
    )
    result = await service.move(
        MoveFeatureAccessCommand(
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            entitlement_key=entitlement_key,
            source_membership_id=payload.source_membership_id,
            target_membership_id=payload.target_membership_id,
            expected_revision=payload.expected_revision,
            idempotency_key=idempotency_key,
        )
    )
    return ApiResponse.success(data=feature_access_mutation_out(result))


@router.delete(
    "/{entitlement_key}/assignments/{membership_id}",
    response_model=ResponseModel[FeatureAccessMutationOut],
    summary="Revoke member access included in the Workspace plan",
)
async def revoke_feature_access(
    workspace_id: PublicUUID,
    entitlement_key: FeatureKey,
    membership_id: PublicUUID,
    expected_revision: ExpectedRevision,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: FeatureAccessServiceDependency,
    commercial_policy: RestrictedRecoveryPolicyDependency,
) -> ResponseModel[FeatureAccessMutationOut]:
    await commercial_policy.authorize(
        workspace_id=UUID(str(workspace_id)),
        effects={RestrictedRecoveryEffect.REVOKE_FEATURE_SEAT},
    )
    result = await service.revoke(
        RevokeFeatureAccessCommand(
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            entitlement_key=entitlement_key,
            membership_id=membership_id,
            expected_revision=expected_revision,
            idempotency_key=idempotency_key,
        )
    )
    return ApiResponse.success(data=feature_access_mutation_out(result))
