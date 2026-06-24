"""Migration 0007: Rename domain_/internal_/global_/system_/tenant_ tables."""

from tortoise import migrations
from tortoise.migrations import operations as ops

_RENAMES = [
    # domain_ prefix (63 tables)
    ("domain_users", "users"),
    ("domain_user_credentials", "user_credentials"),
    ("domain_organizations", "organizations"),
    ("domain_org_memberships", "org_memberships"),
    ("domain_org_plans", "org_plans"),
    ("domain_organization_roles", "organization_roles"),
    ("domain_organization_permissions", "organization_permissions"),
    ("domain_organization_role_permissions", "organization_role_permissions"),
    ("domain_organization_email_invites", "organization_email_invites"),
    ("domain_organization_invite_links", "organization_invite_links"),
    ("domain_organization_invite_link_use_events", "organization_invite_link_use_events"),
    ("domain_projects", "projects"),
    ("domain_project_memberships", "project_memberships"),
    ("domain_project_runtimes", "project_runtimes"),
    ("domain_project_environments", "project_environments"),
    ("domain_project_environment_aliases", "project_environment_aliases"),
    ("domain_project_deployments", "project_deployments"),
    ("domain_project_database_instances", "project_database_instances"),
    ("domain_project_database_credentials", "project_database_credentials"),
    ("domain_project_database_migrations", "project_database_migrations"),
    ("domain_project_database_backups", "project_database_backups"),
    ("domain_api_keys", "api_keys"),
    ("domain_workspaces", "workspaces"),
    ("domain_workspace_memberships", "workspace_memberships"),
    ("domain_workspace_membership_roles", "workspace_membership_roles"),
    ("domain_workspace_email_invites", "workspace_email_invites"),
    ("domain_workspace_invite_links", "workspace_invite_links"),
    ("domain_workspace_invite_link_use_events", "workspace_invite_link_use_events"),
    ("domain_workspace_extension_activations", "workspace_extension_activations"),
    ("domain_sites", "sites"),
    ("domain_site_patterns", "site_patterns"),
    ("domain_assets", "assets"),
    ("domain_asset_folders", "asset_folders"),
    ("domain_asset_tags", "asset_tags"),
    ("domain_asset_tag_links", "asset_tag_links"),
    ("domain_asset_share_links", "asset_share_links"),
    ("domain_asset_usages", "asset_usages"),
    ("domain_upload_sessions", "upload_sessions"),
    ("domain_upload_parts", "upload_parts"),
    ("domain_content_items", "content_items"),
    ("domain_content_versions", "content_versions"),
    ("domain_content_model_definitions", "content_model_definitions"),
    ("domain_content_model_fields", "content_model_fields"),
    ("domain_content_model_relations", "content_model_relations"),
    ("domain_content_model_views", "content_model_views"),
    ("domain_content_component_bindings", "content_component_bindings"),
    ("domain_content_hierarchy_nodes", "content_hierarchy_nodes"),
    ("domain_content_route_bindings", "content_route_bindings"),
    ("domain_content_seo_profiles", "content_seo_profiles"),
    ("domain_content_translation_groups", "content_translation_groups"),
    ("domain_content_presentation_documents", "content_presentation_documents"),
    ("domain_content_publish_artifacts", "content_publish_artifacts"),
    ("domain_content_published_graph", "content_published_graph"),
    ("domain_content_releases", "content_releases"),
    ("domain_publish_jobs", "publish_jobs"),
    ("domain_webhook_subscriptions", "webhook_subscriptions"),
    ("domain_webhook_deliveries", "webhook_deliveries"),
    ("domain_automation_flows", "automation_flows"),
    ("domain_automation_operations", "automation_operations"),
    ("domain_automation_runs", "automation_runs"),
    ("domain_automation_run_logs", "automation_run_logs"),
    ("domain_analytics_audit_events", "analytics_audit_events"),
    # internal_ prefix (7 tables)
    ("internal_roles", "system_roles"),
    ("internal_permissions", "system_permissions"),
    ("internal_role_permissions", "system_role_permissions"),
    ("internal_notifications", "system_notifications"),
    ("internal_settings", "system_settings"),
    ("internal_sys_config_active", "system_config_active"),
    ("internal_sys_config_revisions", "system_config_revisions"),
    # system_ prefix (2 tables)
    ("system_storage_profiles", "storage_profiles"),
    ("system_storage_profile_test_states", "storage_profile_test_states"),
    # global_ prefix (3 tables)
    ("global_user_two_factor", "user_two_factor"),
    ("global_user_two_factor_backup_codes", "user_two_factor_backup_codes"),
    ("global_oauth_identities", "oauth_identities"),
    # tenant_ prefix (1 table)
    ("tenant_workspace_registry", "workspace_tenant_registry"),
]


def _rename_sql(old: str, new: str) -> str:
    return f'ALTER TABLE IF EXISTS "{old}" RENAME TO "{new}"'


def _reverse_rename_sql(old: str, new: str) -> str:
    return f'ALTER TABLE IF EXISTS "{new}" RENAME TO "{old}"'


def _build_sql(*stmts: str) -> str:
    return ";\n".join(s for s in stmts if s) + ";"


class Migration(migrations.Migration):
    dependencies = [("models", "0006_auto_20260624_2356")]

    initial = False

    operations = [
        ops.RunSQL(
            sql=_build_sql(*(_rename_sql(old, new) for old, new in _RENAMES)),
            reverse_sql=_build_sql(*(_reverse_rename_sql(old, new) for old, new in _RENAMES)),
        ),
    ]
