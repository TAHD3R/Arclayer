from importlib import import_module

migration = import_module("src.migrations.0114_platform_skill_permissions")


def test_platform_skill_permission_migration_depends_on_current_head() -> None:
    assert migration.Migration.dependencies == [("models", "0113_knowledge_guidance_tables")]


def test_platform_skill_permission_migration_registers_exact_codes() -> None:
    sql = migration.Migration.operations[0].sql

    assert "platform:ai-skills:read" in sql
    assert "platform:ai-skills:manage" in sql
    assert "ON CONFLICT (code) DO UPDATE" in sql
