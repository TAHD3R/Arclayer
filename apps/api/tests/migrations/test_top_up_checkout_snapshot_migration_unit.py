from importlib import import_module

from tortoise.migrations.operations import AddField, RunSQL

migration = import_module("src.migrations.0127_top_up_checkout_snapshot_evidence")


def test_top_up_checkout_snapshot_migration_backfills_revision_and_hardens_shape() -> None:
    assert migration.Migration.dependencies == [("models", "0126_commerce_provider_payment_projections")]
    assert len(migration.Migration.operations) == 2

    add_field, constraints = migration.Migration.operations
    assert isinstance(add_field, AddField)
    assert add_field.model_name == "CommerceCheckoutSession"
    assert add_field.name == "top_up_offer_revision"
    assert add_field.field.null is True

    assert isinstance(constraints, RunSQL)
    sql = constraints.sql
    assert "SET top_up_offer_revision = offer.revision" in sql
    assert "unable to backfill immutable top-up Checkout offer revision" in sql
    assert "subscription_id IS NOT NULL" in sql
    assert "top_up_offer_revision IS NULL" in sql
    assert "subscription_id IS NULL" in sql
    assert "top_up_offer_revision IS NOT NULL" in sql
    assert "commerce_checkout_session_top_up_offer_revision_check" in sql
