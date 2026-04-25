from __future__ import annotations

from src.modules.tenancy.schema import TenantMigration

_TENANT_OWNED_TABLES = (
    "internal_settings",
    "domain_content_model_definitions",
    "domain_content_model_fields",
    "domain_content_model_relations",
    "domain_content_model_views",
    "domain_content_items",
    "domain_content_versions",
    "domain_content_presentation_documents",
    "domain_content_seo_profiles",
    "domain_content_component_bindings",
    "domain_content_route_bindings",
    "domain_content_hierarchy_nodes",
    "domain_content_releases",
    "domain_content_published_graph",
    "domain_content_publish_artifacts",
    "domain_assets",
    "domain_asset_folders",
    "domain_asset_tags",
    "domain_asset_tag_links",
    "domain_asset_usages",
    "domain_upload_sessions",
    "domain_upload_parts",
)


def _clone_public_table_sql(table_name: str) -> str:
    return f"CREATE TABLE IF NOT EXISTS {{schema}}.{table_name} (LIKE public.{table_name} INCLUDING ALL)"


TENANT_CONTROL_MIGRATIONS = (
    TenantMigration.create(
        version=1,
        name="tenant_control_smoke",
        sql=(
            "CREATE TABLE IF NOT EXISTS {schema}.tenant_schema_migrations (version INT PRIMARY KEY, checksum VARCHAR(64) NOT NULL, applied_at TIMESTAMPTZ NULL, status VARCHAR(16) NOT NULL)",
            "CREATE TABLE IF NOT EXISTS {schema}.tenant_schema_smoke (id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)",
        ),
    ),
    TenantMigration.create(
        version=2,
        name="tenant_owned_domain_tables",
        sql=tuple(_clone_public_table_sql(table_name) for table_name in _TENANT_OWNED_TABLES),
    ),
)
