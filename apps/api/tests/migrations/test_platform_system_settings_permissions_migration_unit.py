from importlib import import_module

migration = import_module("src.migrations.0136_platform_system_settings_permissions")


def test_system_settings_permission_migration_depends_on_current_head() -> None:
    assert migration.Migration.dependencies == [("models", "0135_workspace_ai_virtual_key_uniqueness")]


def test_system_settings_permission_migration_registers_exact_codes() -> None:
    sql = migration.Migration.operations[0].sql

    assert "platform:system-settings:read" in sql
    assert "platform:system-settings:manage" in sql
    assert "ON CONFLICT (code) DO UPDATE" in sql
