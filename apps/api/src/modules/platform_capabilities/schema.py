from __future__ import annotations

from enum import StrEnum

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.modules.platform_identity.permissions import PlatformPermissionCode


class PlatformCapabilityDomain(StrEnum):
    ACCESS = "access"
    AI_SERVICES = "ai_services"
    COMMUNICATIONS = "communications"
    COMMERCE = "commerce"
    EXTENSIBILITY = "extensibility"
    SITE_DELIVERY = "site_delivery"
    TENANT_GOVERNANCE = "tenant_governance"
    MONITORING_AUDIT = "monitoring_audit"


class PlatformCapabilitySupportState(StrEnum):
    SUPPORTED = "supported"
    UNSUPPORTED = "unsupported"


class PlatformCapabilityEnablementState(StrEnum):
    ENABLED = "enabled"
    DISABLED_ACTIVATABLE = "disabled_activatable"
    DISABLED = "disabled"


class PlatformCapabilityReadinessState(StrEnum):
    READY = "ready"
    NOT_READY = "not_ready"


class PlatformCapabilityRuntimeHealth(StrEnum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNAVAILABLE = "unavailable"
    NOT_REPORTED = "not_reported"


class PlatformCapabilityPermissionMatch(StrEnum):
    ANY = "any"
    ALL = "all"


class PlatformCapabilityRouteTarget(StrEnum):
    ACCESS_TEAM = "access.team"
    ACCESS_ROLES = "access.roles"
    ACCESS_SIGN_IN = "access.sign-in"
    TENANT_WORKSPACES = "tenants.workspaces"
    TENANT_USERS = "tenants.users"
    TENANT_PROJECTS = "tenants.projects"
    MONITORING_REQUESTS = "monitoring.requests"
    MONITORING_PERFORMANCE = "monitoring.performance"
    MONITORING_AI_USAGE = "monitoring.ai-usage"
    MONITORING_ACTIVITY = "monitoring.activity"
    MONITORING_AUDIT = "monitoring.audit"
    OPERATIONS_SIGNALS = "operations.signals"
    COMMERCE_SUBSCRIPTIONS = "commerce.subscriptions"
    COMMERCE_PLANS = "commerce.plans"
    COMMERCE_PAYMENTS = "commerce.payments"
    COMMERCE_CREDITS = "commerce.credits"
    COMMERCE_CONFIGURATION = "commerce.configuration"
    COMMUNICATIONS_FEEDBACK = "communications.feedback"
    COMMUNICATIONS_DELIVERIES = "communications.deliveries"
    COMMUNICATIONS_CAMPAIGNS = "communications.campaigns"
    COMMUNICATIONS_TEMPLATES = "communications.templates"
    COMMUNICATIONS_EMAIL = "communications.email"
    EXTENSIONS_INSTALLED = "extensions.installed"
    EXTENSIONS_CATALOG = "extensions.catalog"
    EXTENSIONS_CONNECTIONS = "extensions.connections"
    EXTENSIONS_HISTORY = "extensions.history"
    AI_TASKS = "ai.tasks"
    AI_PROVIDERS = "ai.providers"
    AI_ASSISTANTS = "ai.assistants"
    AI_POLICIES = "ai.policies"
    SITE_DELIVERY_ISSUES = "site-delivery.issues"
    SITE_DELIVERY_DOMAINS = "site-delivery.domains"
    SITE_DELIVERY_STORAGE = "site-delivery.storage"
    SITE_DELIVERY_POLICIES = "site-delivery.policies"


class PlatformCapabilityNavigationTargetOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True, use_enum_values=False)

    route_target: PlatformCapabilityRouteTarget
    required_view_permissions: tuple[PlatformPermissionCode, ...]
    view_permission_match: PlatformCapabilityPermissionMatch


class PlatformCapabilityOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True, use_enum_values=False)

    capability_id: str
    domain: PlatformCapabilityDomain
    name_i18n_key: str = Field(alias="nameI18nKey")
    description_i18n_key: str = Field(alias="descriptionI18nKey")
    support_state: PlatformCapabilitySupportState
    enablement_state: PlatformCapabilityEnablementState
    readiness_state: PlatformCapabilityReadinessState
    missing_prerequisite_codes: tuple[str, ...]
    runtime_health: PlatformCapabilityRuntimeHealth
    route_target: PlatformCapabilityRouteTarget
    navigation_targets: tuple[PlatformCapabilityNavigationTargetOut, ...]
    required_view_permissions: tuple[PlatformPermissionCode, ...]
    view_permission_match: PlatformCapabilityPermissionMatch
    required_manage_permissions: tuple[PlatformPermissionCode, ...]
    manage_permission_match: PlatformCapabilityPermissionMatch
    can_manage: bool
    navigation_candidate: bool
    activation_available: bool


class PlatformCapabilityCatalogOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    items: tuple[PlatformCapabilityOut, ...]
