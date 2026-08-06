from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Path, Query

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.exceptions import NotFound, ServiceUnavailable
from src.core.extensions.dependencies import get_connector_registry
from src.core.http.response import ApiResponse, ResponseModel
from src.core.registries import ConnectorRegistry
from src.modules.commerce.billing_top_up_refund_application_service import BillingTopUpRefundResult
from src.modules.commerce.catalog_schema import (
    PlanIdentityCreate,
    PlanRevisionDraftCreate,
    PlanRevisionDraftUpdate,
    PlanRevisionPublish,
)
from src.modules.commerce.catalog_service import build_commerce_catalog_service
from src.modules.commerce.convergence.composition import build_plan_access_convergence_service
from src.modules.commerce.convergence.schema import ConvergencePreview, ConvergencePreviewRequest
from src.modules.commerce.platform_operations import build_platform_commerce_operations_service
from src.modules.commerce.platform_operations_schema import (
    CommercialCorrectionApplyPayload,
    CommercialCorrectionPreviewRequest,
    CreditAdjustmentOut,
    CreditAdjustmentRequest,
    DunningPolicyOut,
    DunningPolicyWrite,
    ProviderConfigurationWrite,
    ProviderConfigurationWriteOut,
    ProviderEventListOut,
    ProviderEventOut,
    ProviderEventQuery,
    ProviderEventReconcileRequest,
    ProviderReadinessOut,
    SimulatorReadinessOut,
    SubscriptionTransitionCancelRequest,
    SubscriptionTransitionDetailOut,
    TopUpRefundOut,
    TopUpRefundRequest,
)
from src.modules.commerce.platform_read_service import build_platform_commerce_read_service
from src.modules.commerce.platform_schema import (
    PlatformCommercePlanCatalogOut,
    PlatformCommercePlanIdentityOut,
    PlatformCommercePlanRevisionMutationOut,
    PlatformCommerceRevisionSummaryOut,
    PlatformCommerceSubscriptionListOut,
    PlatformCommerceSubscriptionOut,
    PlatformCommerceSubscriptionQuery,
)
from src.modules.commerce.schema import WorkspaceCommerceOverviewOut
from src.modules.commerce.service import build_commerce_service
from src.modules.commerce.simulated_checkout_outcome_service import (
    SimulatedCheckoutOutcomeOut,
    SimulatedCheckoutOutcomeWrite,
)
from src.modules.commerce.simulator_read_schema import SimulatorStateOut
from src.modules.commerce.subscription_transitions.composition import build_subscription_transition_service
from src.modules.commerce.subscription_transitions.platform_operations import (
    build_platform_subscription_transition_operations,
)
from src.modules.commerce.subscription_transitions.schema import (
    RenewalTransitionScheduleOut,
    RenewalTransitionScheduleRequest,
)
from src.modules.platform_identity.http import get_current_platform_session, require_platform_permission
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal

router = APIRouter(tags=["platform.commerce"])

IdempotencyKey = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)]
PlanCodePath = Annotated[str, Path(min_length=1, max_length=48, pattern=r"^[a-z][a-z0-9-]*$")]
CurrentPlatformSession = Annotated[PlatformSessionPrincipal, Depends(get_current_platform_session)]


@router.get(
    "/plans",
    operation_id="platform_list_commerce_plans",
    response_model=ResponseModel[PlatformCommercePlanCatalogOut],
    summary="List Plan identities and Revision history",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_READ)],
)
async def list_commerce_plans(
    include_inactive: bool = Query(default=False, alias="includeInactive"),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PlatformCommercePlanCatalogOut]:
    return ApiResponse.success(
        data=await build_platform_commerce_read_service().list_plan_catalog(include_inactive=include_inactive)
    )


@router.get(
    "/plans/{code}/revisions",
    operation_id="platform_list_commerce_plan_revisions",
    response_model=ResponseModel[tuple[PlatformCommerceRevisionSummaryOut, ...]],
    summary="List one Plan's Draft and published Revisions",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_READ)],
)
async def list_commerce_plan_revisions(
    code: str,
    include_inactive: bool = Query(default=False, alias="includeInactive"),
) -> ResponseModel[tuple[PlatformCommerceRevisionSummaryOut, ...]]:
    revisions = await build_platform_commerce_read_service().list_plan_revisions(
        code=code,
        include_inactive=include_inactive,
    )
    if not revisions:
        raise NotFound(error="COMMERCE_CATALOG_PLAN_NOT_FOUND")
    return ApiResponse.success(data=revisions)


@router.get(
    "/subscriptions",
    operation_id="platform_list_commerce_subscriptions",
    response_model=ResponseModel[PlatformCommerceSubscriptionListOut],
    summary="List Workspace Subscriptions requiring attention",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_READ)],
)
async def list_platform_commerce_subscriptions(
    query: PlatformCommerceSubscriptionQuery = Depends(),
) -> ResponseModel[PlatformCommerceSubscriptionListOut]:
    return ApiResponse.success(data=await build_platform_commerce_read_service().list_subscriptions(query=query))


@router.post(
    "/plans",
    operation_id="platform_create_commerce_plan",
    response_model=ResponseModel[PlatformCommercePlanIdentityOut],
    summary="Create a stable Plan identity",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_CATALOG_MANAGE)],
)
async def create_commerce_plan(
    payload: PlanIdentityCreate,
    idempotency_key: IdempotencyKey,
    principal: CurrentPlatformSession,
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PlatformCommercePlanIdentityOut]:
    return ApiResponse.success(
        data=await build_commerce_catalog_service().create_plan(
            request=payload,
            actor_user_id=UUID(str(principal.actor_id)),
            actor_session_id=UUID(str(principal.session_id)),
            idempotency_key=idempotency_key,
            settings=settings,
        )
    )


@router.post(
    "/plans/{code}/revisions",
    operation_id="platform_create_plan_revision",
    response_model=ResponseModel[PlatformCommercePlanRevisionMutationOut],
    summary="Create a Draft Plan Revision",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_CATALOG_MANAGE)],
)
async def create_plan_revision(
    code: PlanCodePath,
    payload: PlanRevisionDraftCreate,
    idempotency_key: IdempotencyKey,
    principal: CurrentPlatformSession,
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PlatformCommercePlanRevisionMutationOut]:
    return ApiResponse.success(
        data=await build_commerce_catalog_service().create_draft(
            plan_code=code,
            terms=payload.terms,
            actor_user_id=UUID(str(principal.actor_id)),
            actor_session_id=UUID(str(principal.session_id)),
            idempotency_key=idempotency_key,
            settings=settings,
        )
    )


@router.put(
    "/plans/{code}/revisions/{revision_id}",
    operation_id="platform_update_plan_revision",
    response_model=ResponseModel[PlatformCommercePlanRevisionMutationOut],
    summary="Update a Draft Plan Revision",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_CATALOG_MANAGE)],
)
async def update_plan_revision(
    code: PlanCodePath,
    revision_id: PublicUUID,
    payload: PlanRevisionDraftUpdate,
    idempotency_key: IdempotencyKey,
    principal: CurrentPlatformSession,
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PlatformCommercePlanRevisionMutationOut]:
    return ApiResponse.success(
        data=await build_commerce_catalog_service().update_draft(
            plan_code=code,
            revision_id=revision_id,
            terms=payload.terms,
            expected_revision=payload.expected_revision,
            actor_user_id=UUID(str(principal.actor_id)),
            actor_session_id=UUID(str(principal.session_id)),
            idempotency_key=idempotency_key,
            settings=settings,
        )
    )


@router.post(
    "/plans/{code}/revisions/{revision_id}/publish",
    operation_id="platform_publish_plan_revision",
    response_model=ResponseModel[PlatformCommercePlanRevisionMutationOut],
    summary="Publish an immutable Plan Revision",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_CATALOG_MANAGE)],
)
async def publish_plan_revision(
    code: PlanCodePath,
    revision_id: PublicUUID,
    payload: PlanRevisionPublish,
    idempotency_key: IdempotencyKey,
    principal: CurrentPlatformSession,
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PlatformCommercePlanRevisionMutationOut]:
    return ApiResponse.success(
        data=await build_commerce_catalog_service().publish_draft(
            plan_code=code,
            revision_id=revision_id,
            expected_revision=payload.expected_revision,
            actor_user_id=UUID(str(principal.actor_id)),
            actor_session_id=UUID(str(principal.session_id)),
            idempotency_key=idempotency_key,
            settings=settings,
        )
    )


@router.get(
    "/workspaces/{workspace_id}/overview",
    operation_id="platform_get_workspace_commerce_overview",
    response_model=ResponseModel[WorkspaceCommerceOverviewOut],
    summary="Get a revision-bound Workspace commercial overview",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_READ)],
)
async def get_workspace_commerce_overview(
    workspace_id: PublicUUID,
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceCommerceOverviewOut]:
    return ApiResponse.success(data=await build_commerce_service(settings).get_overview(workspace_id=workspace_id))


@router.get(
    "/subscriptions/{subscription_id}",
    operation_id="platform_get_commerce_subscription",
    response_model=ResponseModel[PlatformCommerceSubscriptionOut],
    summary="Read one Workspace Subscription",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_READ)],
)
async def get_platform_commerce_subscription(
    subscription_id: PublicUUID,
    settings: Settings = Depends(get_settings),
    connectors: ConnectorRegistry = Depends(get_connector_registry),
) -> ResponseModel[PlatformCommerceSubscriptionOut]:
    subscription = await build_platform_commerce_operations_service(
        settings=settings, connectors=connectors
    ).get_subscription(subscription_id=subscription_id)
    if subscription is None:
        raise NotFound(error="COMMERCE_SUBSCRIPTION_NOT_FOUND")
    return ApiResponse.success(data=subscription)


@router.post(
    "/subscription-revision-transitions/preview",
    operation_id="platform_preview_subscription_revision_transition",
    response_model=ResponseModel[ConvergencePreview],
    summary="Preview a revision-bound Subscription Renewal Transition",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_SUBSCRIPTIONS_MANAGE)],
)
async def preview_subscription_revision_transition(
    payload: ConvergencePreviewRequest,
    settings: Settings = Depends(get_settings),
) -> ResponseModel[ConvergencePreview]:
    return ApiResponse.success(
        data=await build_plan_access_convergence_service(settings).create_preview(request=payload)
    )


@router.post(
    "/subscription-revision-transitions",
    operation_id="platform_schedule_subscription_revision_transition",
    response_model=ResponseModel[RenewalTransitionScheduleOut],
    summary="Schedule an idempotent Provider-confirmed Renewal Transition",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_SUBSCRIPTIONS_MANAGE)],
)
async def schedule_subscription_revision_transition(
    payload: RenewalTransitionScheduleRequest,
    principal: CurrentPlatformSession,
    settings: Settings = Depends(get_settings),
    connectors: ConnectorRegistry = Depends(get_connector_registry),
) -> ResponseModel[RenewalTransitionScheduleOut]:
    result = await build_subscription_transition_service(settings, connectors).schedule_renewal(
        request=payload,
        actor_user_id=UUID(str(principal.actor_id)),
    )
    return ApiResponse.success(data=result)


@router.get(
    "/subscription-revision-transitions/{transition_id}",
    operation_id="platform_get_subscription_revision_transition",
    response_model=ResponseModel[SubscriptionTransitionDetailOut],
    summary="Read transition progress and per-Subscription results",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_READ)],
)
async def get_subscription_revision_transition(
    transition_id: PublicUUID,
    settings: Settings = Depends(get_settings),
) -> ResponseModel[SubscriptionTransitionDetailOut]:
    return ApiResponse.success(
        data=await build_platform_subscription_transition_operations(settings).get(transition_id=transition_id)
    )


@router.delete(
    "/subscription-revision-transitions/{transition_id}",
    operation_id="platform_cancel_subscription_revision_transition",
    response_model=ResponseModel[SubscriptionTransitionDetailOut],
    summary="Cancel a reversible Renewal Transition through its Provider schedule",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_SUBSCRIPTIONS_MANAGE)],
)
async def cancel_subscription_revision_transition(
    transition_id: PublicUUID,
    payload: SubscriptionTransitionCancelRequest,
    principal: CurrentPlatformSession,
    settings: Settings = Depends(get_settings),
) -> ResponseModel[SubscriptionTransitionDetailOut]:
    return ApiResponse.success(
        data=await build_platform_subscription_transition_operations(settings).cancel(
            transition_id=transition_id,
            request=payload,
            actor_user_id=UUID(str(principal.actor_id)),
        )
    )


@router.post(
    "/workspaces/{workspace_id}/subscription-corrections/preview",
    operation_id="platform_preview_workspace_subscription_correction",
    response_model=ResponseModel[None],
    summary="Preview one evidence-backed Commercial Correction",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_SUBSCRIPTIONS_MANAGE)],
)
async def preview_workspace_subscription_correction(
    workspace_id: PublicUUID,
    payload: CommercialCorrectionPreviewRequest,
) -> ResponseModel[None]:
    _ = (workspace_id, payload)
    raise ServiceUnavailable(
        error="COMMERCIAL_CORRECTION_PROVIDER_PORT_UNAVAILABLE",
        details={"protocol": "commerce.commercial-correction.v1"},
    )


@router.post(
    "/workspaces/{workspace_id}/subscription-corrections",
    operation_id="platform_apply_workspace_subscription_correction",
    response_model=ResponseModel[None],
    summary="Apply one Provider-confirmed Commercial Correction",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_SUBSCRIPTIONS_MANAGE)],
)
async def apply_workspace_subscription_correction(
    workspace_id: PublicUUID,
    payload: CommercialCorrectionApplyPayload,
) -> ResponseModel[None]:
    _ = (workspace_id, payload)
    raise ServiceUnavailable(
        error="COMMERCIAL_CORRECTION_PROVIDER_PORT_UNAVAILABLE",
        details={"protocol": "commerce.commercial-correction.v1"},
    )


@router.get(
    "/provider",
    operation_id="platform_get_commerce_provider",
    response_model=ResponseModel[ProviderReadinessOut],
    summary="Read sanitized billing Provider readiness",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_READ)],
)
async def get_commerce_provider(
    settings: Settings = Depends(get_settings),
    connectors: ConnectorRegistry = Depends(get_connector_registry),
) -> ResponseModel[ProviderReadinessOut]:
    return ApiResponse.success(
        data=await build_platform_commerce_operations_service(
            settings=settings, connectors=connectors
        ).provider_readiness()
    )


@router.get(
    "/simulator",
    operation_id="platform_get_commerce_simulator_readiness",
    response_model=ResponseModel[SimulatorReadinessOut],
    summary="Read development/test billing simulator readiness",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_READ)],
)
async def get_commerce_simulator(
    settings: Settings = Depends(get_settings),
    connectors: ConnectorRegistry = Depends(get_connector_registry),
) -> ResponseModel[SimulatorReadinessOut]:
    return ApiResponse.success(
        data=await build_platform_commerce_operations_service(
            settings=settings, connectors=connectors
        ).simulator_readiness()
    )


@router.get(
    "/simulator/workspaces/{workspace_id}/state",
    operation_id="platform_get_simulated_commerce_state",
    response_model=ResponseModel[SimulatorStateOut],
    summary="Read durable simulated Commerce state for one Workspace",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_READ)],
)
async def get_simulated_commerce_state(
    workspace_id: PublicUUID,
) -> ResponseModel[SimulatorStateOut]:
    return ApiResponse.success(
        data=await build_platform_commerce_read_service().get_simulator_state(workspace_id=workspace_id)
    )


@router.post(
    "/simulator/workspaces/{workspace_id}/checkout-sessions/{checkout_session_id}/outcome",
    operation_id="platform_submit_simulated_checkout_outcome",
    response_model=ResponseModel[SimulatedCheckoutOutcomeOut],
    summary="Submit one authorized simulated subscription Checkout outcome",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_SUBSCRIPTIONS_MANAGE)],
)
async def submit_simulated_checkout_outcome(
    workspace_id: PublicUUID,
    checkout_session_id: PublicUUID,
    payload: SimulatedCheckoutOutcomeWrite,
    idempotency_key: IdempotencyKey,
    principal: CurrentPlatformSession,
    settings: Settings = Depends(get_settings),
    connectors: ConnectorRegistry = Depends(get_connector_registry),
) -> ResponseModel[SimulatedCheckoutOutcomeOut]:
    result = await build_platform_commerce_operations_service(
        settings=settings, connectors=connectors
    ).submit_simulator_outcome(
        workspace_id=workspace_id,
        checkout_session_id=checkout_session_id,
        kind="subscription",
        payload=payload,
        idempotency_key=idempotency_key,
        actor_user_id=UUID(str(principal.actor_id)),
    )
    return ApiResponse.success(data=result)


@router.post(
    "/simulator/workspaces/{workspace_id}/top-up-checkout-sessions/{checkout_session_id}/outcome",
    operation_id="platform_submit_simulated_top_up_outcome",
    response_model=ResponseModel[SimulatedCheckoutOutcomeOut],
    summary="Submit one authorized simulated top-up Checkout outcome",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_SUBSCRIPTIONS_MANAGE)],
)
async def submit_simulated_top_up_outcome(
    workspace_id: PublicUUID,
    checkout_session_id: PublicUUID,
    payload: SimulatedCheckoutOutcomeWrite,
    idempotency_key: IdempotencyKey,
    principal: CurrentPlatformSession,
    settings: Settings = Depends(get_settings),
    connectors: ConnectorRegistry = Depends(get_connector_registry),
) -> ResponseModel[SimulatedCheckoutOutcomeOut]:
    result = await build_platform_commerce_operations_service(
        settings=settings, connectors=connectors
    ).submit_simulator_outcome(
        workspace_id=workspace_id,
        checkout_session_id=checkout_session_id,
        kind="top_up",
        payload=payload,
        idempotency_key=idempotency_key,
        actor_user_id=UUID(str(principal.actor_id)),
    )
    return ApiResponse.success(data=result)


@router.put(
    "/provider",
    operation_id="platform_put_commerce_provider",
    response_model=ResponseModel[ProviderConfigurationWriteOut],
    summary="Write billing Provider configuration without returning secrets",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_PROVIDER_MANAGE)],
)
async def put_commerce_provider(
    payload: ProviderConfigurationWrite,
    principal: CurrentPlatformSession,
    settings: Settings = Depends(get_settings),
    connectors: ConnectorRegistry = Depends(get_connector_registry),
) -> ResponseModel[ProviderConfigurationWriteOut]:
    return ApiResponse.success(
        data=await build_platform_commerce_operations_service(
            settings=settings, connectors=connectors
        ).write_provider_configuration(request=payload, actor_user_id=UUID(str(principal.actor_id)))
    )


@router.get(
    "/dunning-policy",
    operation_id="platform_get_commerce_dunning_policy",
    response_model=ResponseModel[DunningPolicyOut | None],
    summary="Read the active Provider-aware Dunning Policy",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_READ)],
)
async def get_commerce_dunning_policy(
    settings: Settings = Depends(get_settings),
    connectors: ConnectorRegistry = Depends(get_connector_registry),
) -> ResponseModel[DunningPolicyOut | None]:
    return ApiResponse.success(
        data=await build_platform_commerce_operations_service(
            settings=settings, connectors=connectors
        ).get_dunning_policy()
    )


@router.put(
    "/dunning-policy",
    operation_id="platform_put_commerce_dunning_policy",
    response_model=ResponseModel[DunningPolicyOut],
    summary="Write a revisioned Provider-aware Dunning Policy",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_PROVIDER_MANAGE)],
)
async def put_commerce_dunning_policy(
    payload: DunningPolicyWrite,
    principal: CurrentPlatformSession,
    settings: Settings = Depends(get_settings),
    connectors: ConnectorRegistry = Depends(get_connector_registry),
) -> ResponseModel[DunningPolicyOut]:
    return ApiResponse.success(
        data=await build_platform_commerce_operations_service(
            settings=settings, connectors=connectors
        ).write_dunning_policy(request=payload, actor_user_id=UUID(str(principal.actor_id)))
    )


@router.get(
    "/provider/events",
    operation_id="platform_list_commerce_provider_events",
    response_model=ResponseModel[ProviderEventListOut],
    summary="List the signed billing Provider-event ledger",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_READ)],
)
async def list_commerce_provider_events(
    query: ProviderEventQuery = Depends(),
    settings: Settings = Depends(get_settings),
    connectors: ConnectorRegistry = Depends(get_connector_registry),
) -> ResponseModel[ProviderEventListOut]:
    return ApiResponse.success(
        data=await build_platform_commerce_operations_service(
            settings=settings, connectors=connectors
        ).list_provider_events(query=query)
    )


@router.post(
    "/provider/events/{event_id}/reconcile",
    operation_id="platform_reconcile_commerce_provider_event",
    response_model=ResponseModel[ProviderEventOut],
    summary="Reconcile one eligible failed signed Provider event",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_EVENTS_RECONCILE)],
)
async def reconcile_commerce_provider_event(
    event_id: PublicUUID,
    payload: ProviderEventReconcileRequest,
    principal: CurrentPlatformSession,
    settings: Settings = Depends(get_settings),
    connectors: ConnectorRegistry = Depends(get_connector_registry),
) -> ResponseModel[ProviderEventOut]:
    return ApiResponse.success(
        data=await build_platform_commerce_operations_service(
            settings=settings, connectors=connectors
        ).reconcile_provider_event(
            event_id=event_id,
            request=payload,
            actor_user_id=UUID(str(principal.actor_id)),
        )
    )


@router.post(
    "/transactions/{transaction_id}/refunds",
    operation_id="platform_request_top_up_refund",
    response_model=ResponseModel[TopUpRefundOut],
    summary="Request one idempotent full top-up refund",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_SUBSCRIPTIONS_MANAGE)],
)
async def request_top_up_refund(
    transaction_id: PublicUUID,
    payload: TopUpRefundRequest,
    idempotency_key: IdempotencyKey,
    principal: CurrentPlatformSession,
    settings: Settings = Depends(get_settings),
    connectors: ConnectorRegistry = Depends(get_connector_registry),
) -> ResponseModel[TopUpRefundOut]:
    result: BillingTopUpRefundResult = await build_platform_commerce_operations_service(
        settings=settings, connectors=connectors
    ).request_top_up_refund(
        transaction_id=transaction_id,
        reason=payload.reason,
        idempotency_key=idempotency_key,
        actor_user_id=UUID(str(principal.actor_id)),
    )
    return ApiResponse.success(data=TopUpRefundOut.model_validate(result.model_dump()))


@router.post(
    "/workspaces/{workspace_id}/credits/adjustments",
    operation_id="platform_adjust_workspace_credits",
    response_model=ResponseModel[CreditAdjustmentOut],
    summary="Append an audited immutable Credit adjustment",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_CREDITS_ADJUST)],
)
async def adjust_workspace_credits(
    workspace_id: PublicUUID,
    payload: CreditAdjustmentRequest,
    principal: CurrentPlatformSession,
    settings: Settings = Depends(get_settings),
    connectors: ConnectorRegistry = Depends(get_connector_registry),
) -> ResponseModel[CreditAdjustmentOut]:
    return ApiResponse.success(
        data=await build_platform_commerce_operations_service(settings=settings, connectors=connectors).adjust_credits(
            workspace_id=workspace_id,
            request=payload,
            actor_user_id=UUID(str(principal.actor_id)),
        )
    )
