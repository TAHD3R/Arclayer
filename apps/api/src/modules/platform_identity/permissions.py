from __future__ import annotations

from enum import StrEnum


class PlatformPermissionCode(StrEnum):
    """Stable exact permission identifiers for Platform API authorization."""

    ACCESS_TEAM_READ = "platform:access-team:read"
    ACCESS_TEAM_INVITE = "platform:access-team:invite"
    ACCESS_TEAM_REMOVE = "platform:access-team:remove"
    ACCESS_ROLES_READ = "platform:access-roles:read"
    ACCESS_ROLES_MANAGE = "platform:access-roles:manage"
    ACCESS_MFA_RESET = "platform:access-mfa:reset"
    ACCESS_SESSIONS_READ = "platform:access-sessions:read"
    ACCESS_SESSIONS_REVOKE = "platform:access-sessions:revoke"

    MONITORING_REQUESTS_READ = "platform:monitoring-requests:read"
    MONITORING_AUDIT_READ = "platform:monitoring-audit:read"
    OPERATIONS_SIGNALS_READ = "platform:operations-signals:read"
    OPERATIONS_SIGNALS_CLAIM = "platform:operations-signals:claim"
    OPERATIONS_SIGNALS_ASSIGN = "platform:operations-signals:assign"
    OPERATIONS_SIGNALS_TRIAGE = "platform:operations-signals:triage"

    TENANT_USERS_READ = "platform:tenant-users:read"
    TENANT_USERS_MANAGE = "platform:tenant-users:manage"
    TENANT_WORKSPACES_READ = "platform:tenant-workspaces:read"
    TENANT_WORKSPACES_MANAGE = "platform:tenant-workspaces:manage"
    TENANT_PROJECTS_READ = "platform:tenant-projects:read"
    TENANT_PROJECTS_MANAGE = "platform:tenant-projects:manage"
    TENANT_SUPPORT_READ = "platform:tenant-support:read"

    COMMERCE_READ = "platform:commerce:read"
    COMMERCE_CATALOG_MANAGE = "platform:commerce:catalog-manage"
    COMMERCE_SUBSCRIPTIONS_MANAGE = "platform:commerce:subscriptions-manage"
    COMMERCE_CREDITS_ADJUST = "platform:commerce:credits-adjust"
    COMMERCE_PROVIDER_MANAGE = "platform:commerce:provider-manage"
    COMMERCE_EVENTS_RECONCILE = "platform:commerce:events-reconcile"

    AI_PROVIDERS_READ = "platform:ai-providers:read"
    AI_PROVIDERS_MANAGE = "platform:ai-providers:manage"
    AI_AGENTS_READ = "platform:ai-agents:read"
    AI_AGENTS_MANAGE = "platform:ai-agents:manage"
    AI_SKILLS_READ = "platform:ai-skills:read"
    AI_SKILLS_MANAGE = "platform:ai-skills:manage"
    AI_ASSIGNMENTS_READ = "platform:ai-assignments:read"
    AI_ASSIGNMENTS_MANAGE = "platform:ai-assignments:manage"
    AI_RUNTIME_SETTINGS_READ = "platform:ai-runtime-settings:read"
    AI_RUNTIME_SETTINGS_MANAGE = "platform:ai-runtime-settings:manage"
    AI_POLICY_READ = "platform:ai-policy:read"
    AI_POLICY_MANAGE = "platform:ai-policy:manage"
    AI_TASKS_READ = "platform:ai-tasks:read"
    AI_TASKS_RECOVER = "platform:ai-tasks:recover"

    SITE_DELIVERY_READ = "platform:site-delivery:read"
    SITE_DELIVERY_MANAGE = "platform:site-delivery:manage"
    SITE_STORAGE_READ = "platform:site-storage:read"
    SITE_STORAGE_MANAGE = "platform:site-storage:manage"
    SITE_DELIVERY_SETTINGS_READ = "platform:site-delivery-settings:read"
    SITE_DELIVERY_SETTINGS_MANAGE = "platform:site-delivery-settings:manage"

    MESSAGES_FEEDBACK_READ = "platform:messages-feedback:read"
    MESSAGES_FEEDBACK_MANAGE = "platform:messages-feedback:manage"
    MESSAGES_MAIL_READ = "platform:messages-mail:read"
    MESSAGES_MAIL_MANAGE = "platform:messages-mail:manage"
    MESSAGES_CAMPAIGNS_READ = "platform:messages-campaigns:read"
    MESSAGES_CAMPAIGNS_MANAGE = "platform:messages-campaigns:manage"
    MESSAGES_CAMPAIGNS_SEND = "platform:messages-campaigns:send"
    MESSAGES_DELIVERY_RETRY = "platform:messages-delivery:retry"
    MESSAGES_DELIVERY_SETTINGS_READ = "platform:messages-delivery-settings:read"
    MESSAGES_DELIVERY_SETTINGS_MANAGE = "platform:messages-delivery-settings:manage"

    EXTENSIONS_CATALOG_READ = "platform:extensions-catalog:read"
    EXTENSIONS_INSTALL = "platform:extensions:install"
    EXTENSIONS_CONFIGURE = "platform:extensions:configure"

    JOBS_READ = "platform:jobs:read"
    JOBS_MANAGE = "platform:jobs:manage"

    SYSTEM_SETTINGS_READ = "platform:system-settings:read"
    SYSTEM_SETTINGS_MANAGE = "platform:system-settings:manage"

    ACCESS_SIGN_IN_SETTINGS_READ = "platform:access-sign-in-settings:read"
    ACCESS_SIGN_IN_SETTINGS_MANAGE = "platform:access-sign-in-settings:manage"
    WORKSPACE_CAPABILITY_ROLLOUT_APPLY = "platform:workspace-capability-rollout:apply"


class PlatformActionCode(StrEnum):
    """Trusted action identifiers used for action-bound Platform verification."""

    INVITE_OPERATOR = "platform.access.invite_operator"
    CHANGE_ROLE = "platform.access.change_role"
    REMOVE_OPERATOR = "platform.access.remove_operator"
    MANAGE_CURRENT_MFA = "platform.access.manage_current_mfa"
    RESET_OPERATOR_MFA = "platform.access.reset_operator_mfa"
    CHANGE_SIGN_IN_SETTINGS = "platform.access.change_sign_in_settings"
    TRANSFER_INSTANCE_OWNERSHIP = "platform.access.transfer_instance_ownership"
