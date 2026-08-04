from importlib import import_module

migration = import_module("src.migrations.0115_platform_builtin_role_catalog")


def test_builtin_role_catalog_migration_depends_on_current_head() -> None:
    assert migration.Migration.dependencies == [("models", "0114_platform_skill_permissions")]


def test_builtin_role_catalog_repairs_commerce_role_revision() -> None:
    sql = migration.Migration.operations[0].sql

    assert "Plans & Billing Manager" in sql
    assert "commerce-operations-operator:2" in sql
    for code in (
        "platform:commerce:read",
        "platform:commerce:catalog-manage",
        "platform:commerce:subscriptions-manage",
        "platform:commerce:credits-adjust",
        "platform:commerce:provider-manage",
        "platform:commerce:events-reconcile",
    ):
        assert code in sql
