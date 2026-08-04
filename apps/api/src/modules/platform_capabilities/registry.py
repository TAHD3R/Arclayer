from __future__ import annotations

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.modules.platform_capabilities.schema import (
    PlatformCapabilityDomain,
    PlatformCapabilityEnablementState,
    PlatformCapabilityPermissionMatch,
    PlatformCapabilityReadinessState,
    PlatformCapabilityRouteTarget,
    PlatformCapabilityRuntimeHealth,
    PlatformCapabilitySupportState,
)
from src.modules.platform_identity.permissions import PlatformPermissionCode


class PlatformCapabilityNavigationRegistration(BaseSchema):
    """Build-trusted route target and the exact authority required to expose it."""

    model_config = BaseSchema.model_config | ConfigDict(frozen=True, use_enum_values=False)

    route_target: PlatformCapabilityRouteTarget
    required_view_permissions: tuple[PlatformPermissionCode, ...]
    view_permission_match: PlatformCapabilityPermissionMatch


class PlatformCapabilityRegistration(BaseSchema):
    """Build-trusted capability definition; never populated from API input or database rows."""

    model_config = BaseSchema.model_config | ConfigDict(frozen=True, use_enum_values=False)

    capability_id: str = Field(min_length=1, max_length=128, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    domain: PlatformCapabilityDomain
    name_i18n_key: str = Field(min_length=3, max_length=128)
    description_i18n_key: str = Field(min_length=3, max_length=128)
    support_state: PlatformCapabilitySupportState
    enablement_state: PlatformCapabilityEnablementState
    readiness_state: PlatformCapabilityReadinessState
    missing_prerequisite_codes: tuple[str, ...]
    runtime_health: PlatformCapabilityRuntimeHealth
    route_target: PlatformCapabilityRouteTarget
    navigation_targets: tuple[PlatformCapabilityNavigationRegistration, ...]
    required_view_permissions: tuple[PlatformPermissionCode, ...]
    view_permission_match: PlatformCapabilityPermissionMatch
    required_manage_permissions: tuple[PlatformPermissionCode, ...]
    manage_permission_match: PlatformCapabilityPermissionMatch


PLATFORM_CAPABILITY_REGISTRY: tuple[PlatformCapabilityRegistration, ...] = (
    PlatformCapabilityRegistration(
        capability_id="commerce",
        domain=PlatformCapabilityDomain.COMMERCE,
        name_i18n_key="navigation:PLANS_BILLING",
        description_i18n_key="commerce:SUBSCRIPTIONS_DESCRIPTION",
        support_state=PlatformCapabilitySupportState.SUPPORTED,
        enablement_state=PlatformCapabilityEnablementState.ENABLED,
        readiness_state=PlatformCapabilityReadinessState.READY,
        missing_prerequisite_codes=(),
        runtime_health=PlatformCapabilityRuntimeHealth.NOT_REPORTED,
        route_target=PlatformCapabilityRouteTarget.COMMERCE_SUBSCRIPTIONS,
        navigation_targets=(
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.COMMERCE_SUBSCRIPTIONS,
                required_view_permissions=(PlatformPermissionCode.COMMERCE_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.COMMERCE_PLANS,
                required_view_permissions=(PlatformPermissionCode.COMMERCE_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.COMMERCE_PAYMENTS,
                required_view_permissions=(PlatformPermissionCode.COMMERCE_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.COMMERCE_CREDITS,
                required_view_permissions=(PlatformPermissionCode.COMMERCE_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.COMMERCE_CONFIGURATION,
                required_view_permissions=(PlatformPermissionCode.COMMERCE_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
        ),
        required_view_permissions=(PlatformPermissionCode.COMMERCE_READ,),
        view_permission_match=PlatformCapabilityPermissionMatch.ALL,
        required_manage_permissions=(
            PlatformPermissionCode.COMMERCE_CATALOG_MANAGE,
            PlatformPermissionCode.COMMERCE_SUBSCRIPTIONS_MANAGE,
            PlatformPermissionCode.COMMERCE_CREDITS_ADJUST,
            PlatformPermissionCode.COMMERCE_PROVIDER_MANAGE,
            PlatformPermissionCode.COMMERCE_EVENTS_RECONCILE,
        ),
        manage_permission_match=PlatformCapabilityPermissionMatch.ANY,
    ),
    PlatformCapabilityRegistration(
        capability_id="ai-services",
        domain=PlatformCapabilityDomain.AI_SERVICES,
        name_i18n_key="navigation:AI_SERVICES",
        description_i18n_key="ai:PLATFORM_TASKS_DESCRIPTION",
        support_state=PlatformCapabilitySupportState.SUPPORTED,
        enablement_state=PlatformCapabilityEnablementState.ENABLED,
        readiness_state=PlatformCapabilityReadinessState.READY,
        missing_prerequisite_codes=(),
        runtime_health=PlatformCapabilityRuntimeHealth.NOT_REPORTED,
        route_target=PlatformCapabilityRouteTarget.AI_TASKS,
        navigation_targets=(
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.AI_TASKS,
                required_view_permissions=(PlatformPermissionCode.AI_TASKS_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.AI_PROVIDERS,
                required_view_permissions=(PlatformPermissionCode.AI_PROVIDERS_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.AI_ASSISTANTS,
                required_view_permissions=(PlatformPermissionCode.AI_AGENTS_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.AI_SKILLS,
                required_view_permissions=(PlatformPermissionCode.AI_SKILLS_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.AI_POLICIES,
                required_view_permissions=(PlatformPermissionCode.AI_AGENTS_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
        ),
        required_view_permissions=(PlatformPermissionCode.AI_TASKS_READ,),
        view_permission_match=PlatformCapabilityPermissionMatch.ALL,
        required_manage_permissions=(
            PlatformPermissionCode.AI_TASKS_RECOVER,
            PlatformPermissionCode.AI_SKILLS_MANAGE,
        ),
        manage_permission_match=PlatformCapabilityPermissionMatch.ANY,
    ),
    PlatformCapabilityRegistration(
        capability_id="communications",
        domain=PlatformCapabilityDomain.COMMUNICATIONS,
        name_i18n_key="navigation:COMMUNICATIONS",
        description_i18n_key="communications:FEEDBACK_DESCRIPTION",
        support_state=PlatformCapabilitySupportState.SUPPORTED,
        enablement_state=PlatformCapabilityEnablementState.ENABLED,
        readiness_state=PlatformCapabilityReadinessState.READY,
        missing_prerequisite_codes=(),
        runtime_health=PlatformCapabilityRuntimeHealth.NOT_REPORTED,
        route_target=PlatformCapabilityRouteTarget.COMMUNICATIONS_FEEDBACK,
        navigation_targets=(
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.COMMUNICATIONS_FEEDBACK,
                required_view_permissions=(PlatformPermissionCode.MESSAGES_FEEDBACK_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.COMMUNICATIONS_DELIVERIES,
                required_view_permissions=(PlatformPermissionCode.MESSAGES_CAMPAIGNS_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.COMMUNICATIONS_CAMPAIGNS,
                required_view_permissions=(PlatformPermissionCode.MESSAGES_CAMPAIGNS_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.COMMUNICATIONS_TEMPLATES,
                required_view_permissions=(PlatformPermissionCode.MESSAGES_MAIL_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.COMMUNICATIONS_EMAIL,
                required_view_permissions=(PlatformPermissionCode.MESSAGES_MAIL_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
        ),
        required_view_permissions=(PlatformPermissionCode.MESSAGES_FEEDBACK_READ,),
        view_permission_match=PlatformCapabilityPermissionMatch.ALL,
        required_manage_permissions=(
            PlatformPermissionCode.MESSAGES_FEEDBACK_MANAGE,
            PlatformPermissionCode.MESSAGES_CAMPAIGNS_MANAGE,
            PlatformPermissionCode.MESSAGES_MAIL_MANAGE,
        ),
        manage_permission_match=PlatformCapabilityPermissionMatch.ANY,
    ),
    PlatformCapabilityRegistration(
        capability_id="extensions",
        domain=PlatformCapabilityDomain.EXTENSIBILITY,
        name_i18n_key="navigation:EXTENSIONS",
        description_i18n_key="extensions:INSTALLED_DESCRIPTION",
        support_state=PlatformCapabilitySupportState.SUPPORTED,
        enablement_state=PlatformCapabilityEnablementState.ENABLED,
        readiness_state=PlatformCapabilityReadinessState.READY,
        missing_prerequisite_codes=(),
        runtime_health=PlatformCapabilityRuntimeHealth.NOT_REPORTED,
        route_target=PlatformCapabilityRouteTarget.EXTENSIONS_INSTALLED,
        navigation_targets=(
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.EXTENSIONS_INSTALLED,
                required_view_permissions=(PlatformPermissionCode.EXTENSIONS_CATALOG_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.EXTENSIONS_CATALOG,
                required_view_permissions=(PlatformPermissionCode.EXTENSIONS_CATALOG_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.EXTENSIONS_CONNECTIONS,
                required_view_permissions=(PlatformPermissionCode.EXTENSIONS_CATALOG_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.EXTENSIONS_HISTORY,
                required_view_permissions=(PlatformPermissionCode.EXTENSIONS_CATALOG_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
        ),
        required_view_permissions=(PlatformPermissionCode.EXTENSIONS_CATALOG_READ,),
        view_permission_match=PlatformCapabilityPermissionMatch.ALL,
        required_manage_permissions=(PlatformPermissionCode.EXTENSIONS_INSTALL,),
        manage_permission_match=PlatformCapabilityPermissionMatch.ALL,
    ),
    PlatformCapabilityRegistration(
        capability_id="site-delivery",
        domain=PlatformCapabilityDomain.SITE_DELIVERY,
        name_i18n_key="navigation:HOSTING_DOMAINS",
        description_i18n_key="siteDelivery:ISSUES_DESCRIPTION",
        support_state=PlatformCapabilitySupportState.SUPPORTED,
        enablement_state=PlatformCapabilityEnablementState.ENABLED,
        readiness_state=PlatformCapabilityReadinessState.READY,
        missing_prerequisite_codes=(),
        runtime_health=PlatformCapabilityRuntimeHealth.NOT_REPORTED,
        route_target=PlatformCapabilityRouteTarget.SITE_DELIVERY_ISSUES,
        navigation_targets=(
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.SITE_DELIVERY_ISSUES,
                required_view_permissions=(PlatformPermissionCode.SITE_DELIVERY_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.SITE_DELIVERY_DOMAINS,
                required_view_permissions=(PlatformPermissionCode.SITE_DELIVERY_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.SITE_DELIVERY_STORAGE,
                required_view_permissions=(PlatformPermissionCode.SITE_STORAGE_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.SITE_DELIVERY_POLICIES,
                required_view_permissions=(PlatformPermissionCode.SITE_DELIVERY_SETTINGS_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
        ),
        required_view_permissions=(PlatformPermissionCode.SITE_DELIVERY_READ,),
        view_permission_match=PlatformCapabilityPermissionMatch.ALL,
        required_manage_permissions=(PlatformPermissionCode.SITE_DELIVERY_MANAGE,),
        manage_permission_match=PlatformCapabilityPermissionMatch.ALL,
    ),
    PlatformCapabilityRegistration(
        capability_id="access",
        domain=PlatformCapabilityDomain.ACCESS,
        name_i18n_key="navigation:ACCESS_SECURITY",
        description_i18n_key="access:PLATFORM_TEAM_DESCRIPTION",
        support_state=PlatformCapabilitySupportState.SUPPORTED,
        enablement_state=PlatformCapabilityEnablementState.ENABLED,
        readiness_state=PlatformCapabilityReadinessState.READY,
        missing_prerequisite_codes=(),
        runtime_health=PlatformCapabilityRuntimeHealth.NOT_REPORTED,
        route_target=PlatformCapabilityRouteTarget.ACCESS_TEAM,
        navigation_targets=(
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.ACCESS_TEAM,
                required_view_permissions=(PlatformPermissionCode.ACCESS_TEAM_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.ACCESS_ROLES,
                required_view_permissions=(PlatformPermissionCode.ACCESS_ROLES_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.ACCESS_SIGN_IN,
                required_view_permissions=(PlatformPermissionCode.ACCESS_SIGN_IN_SETTINGS_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
        ),
        required_view_permissions=(PlatformPermissionCode.ACCESS_TEAM_READ,),
        view_permission_match=PlatformCapabilityPermissionMatch.ALL,
        required_manage_permissions=(
            PlatformPermissionCode.ACCESS_TEAM_INVITE,
            PlatformPermissionCode.ACCESS_TEAM_REMOVE,
            PlatformPermissionCode.ACCESS_ROLES_MANAGE,
            PlatformPermissionCode.ACCESS_MFA_RESET,
            PlatformPermissionCode.ACCESS_SESSIONS_REVOKE,
            PlatformPermissionCode.ACCESS_SIGN_IN_SETTINGS_MANAGE,
        ),
        manage_permission_match=PlatformCapabilityPermissionMatch.ANY,
    ),
    PlatformCapabilityRegistration(
        capability_id="tenant-governance",
        domain=PlatformCapabilityDomain.TENANT_GOVERNANCE,
        name_i18n_key="navigation:WORKSPACES",
        description_i18n_key="tenants:WORKSPACES_DESCRIPTION",
        support_state=PlatformCapabilitySupportState.SUPPORTED,
        enablement_state=PlatformCapabilityEnablementState.ENABLED,
        readiness_state=PlatformCapabilityReadinessState.READY,
        missing_prerequisite_codes=(),
        runtime_health=PlatformCapabilityRuntimeHealth.NOT_REPORTED,
        route_target=PlatformCapabilityRouteTarget.TENANT_WORKSPACES,
        navigation_targets=(
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.TENANT_WORKSPACES,
                required_view_permissions=(PlatformPermissionCode.TENANT_WORKSPACES_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.TENANT_USERS,
                required_view_permissions=(PlatformPermissionCode.TENANT_USERS_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.TENANT_PROJECTS,
                required_view_permissions=(PlatformPermissionCode.TENANT_PROJECTS_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
        ),
        required_view_permissions=(PlatformPermissionCode.TENANT_WORKSPACES_READ,),
        view_permission_match=PlatformCapabilityPermissionMatch.ALL,
        required_manage_permissions=(PlatformPermissionCode.TENANT_WORKSPACES_MANAGE,),
        manage_permission_match=PlatformCapabilityPermissionMatch.ALL,
    ),
    PlatformCapabilityRegistration(
        capability_id="operations-signals",
        domain=PlatformCapabilityDomain.MONITORING_AUDIT,
        name_i18n_key="navigation:NEEDS_ATTENTION",
        description_i18n_key="overview:NEEDS_ATTENTION_DESCRIPTION",
        support_state=PlatformCapabilitySupportState.SUPPORTED,
        enablement_state=PlatformCapabilityEnablementState.ENABLED,
        readiness_state=PlatformCapabilityReadinessState.READY,
        missing_prerequisite_codes=(),
        runtime_health=PlatformCapabilityRuntimeHealth.NOT_REPORTED,
        route_target=PlatformCapabilityRouteTarget.OPERATIONS_SIGNALS,
        navigation_targets=(
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.OPERATIONS_SIGNALS,
                required_view_permissions=(PlatformPermissionCode.OPERATIONS_SIGNALS_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
        ),
        required_view_permissions=(PlatformPermissionCode.OPERATIONS_SIGNALS_READ,),
        view_permission_match=PlatformCapabilityPermissionMatch.ALL,
        required_manage_permissions=(
            PlatformPermissionCode.OPERATIONS_SIGNALS_CLAIM,
            PlatformPermissionCode.OPERATIONS_SIGNALS_ASSIGN,
            PlatformPermissionCode.OPERATIONS_SIGNALS_TRIAGE,
        ),
        manage_permission_match=PlatformCapabilityPermissionMatch.ANY,
    ),
    PlatformCapabilityRegistration(
        capability_id="monitoring-audit",
        domain=PlatformCapabilityDomain.MONITORING_AUDIT,
        name_i18n_key="navigation:MONITORING_AUDIT",
        description_i18n_key="monitoring:REQUESTS_DESCRIPTION",
        support_state=PlatformCapabilitySupportState.SUPPORTED,
        enablement_state=PlatformCapabilityEnablementState.ENABLED,
        readiness_state=PlatformCapabilityReadinessState.READY,
        missing_prerequisite_codes=(),
        runtime_health=PlatformCapabilityRuntimeHealth.NOT_REPORTED,
        route_target=PlatformCapabilityRouteTarget.MONITORING_REQUESTS,
        navigation_targets=(
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.MONITORING_REQUESTS,
                required_view_permissions=(PlatformPermissionCode.MONITORING_REQUESTS_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.MONITORING_PERFORMANCE,
                required_view_permissions=(PlatformPermissionCode.MONITORING_REQUESTS_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.MONITORING_AI_USAGE,
                required_view_permissions=(PlatformPermissionCode.MONITORING_REQUESTS_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.MONITORING_ACTIVITY,
                required_view_permissions=(PlatformPermissionCode.MONITORING_AUDIT_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.MONITORING_AUDIT,
                required_view_permissions=(PlatformPermissionCode.MONITORING_AUDIT_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
        ),
        required_view_permissions=(PlatformPermissionCode.MONITORING_REQUESTS_READ,),
        view_permission_match=PlatformCapabilityPermissionMatch.ALL,
        required_manage_permissions=(),
        manage_permission_match=PlatformCapabilityPermissionMatch.ALL,
    ),
)
