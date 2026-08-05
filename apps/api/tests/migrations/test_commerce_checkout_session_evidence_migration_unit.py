from importlib import import_module

migration = import_module("src.migrations.0119_commerce_checkout_session_evidence")


def test_checkout_session_evidence_migration_follows_current_head() -> None:
    assert migration.Migration.dependencies == [("models", "0118_ai_thread_pinning")]


def test_checkout_session_evidence_migration_backfills_and_constrains_provider_facts() -> None:
    sql = migration.Migration.operations[0].sql

    assert "ADD COLUMN plan_code VARCHAR(48) NULL" in sql
    assert "ADD COLUMN provider_account_id VARCHAR(255) NOT NULL DEFAULT 'platform'" in sql
    assert "ADD COLUMN external_price_id VARCHAR(255) NULL" in sql
    assert "ADD COLUMN request_fingerprint VARCHAR(64) NULL" in sql
    assert "ADD COLUMN revision BIGINT NOT NULL DEFAULT 1" in sql
    assert "FROM commerce_plan_revision_prices AS price" in sql
    assert "FROM commerce_credit_top_up_offer_prices AS price" in sql
    assert "unable to backfill canonical checkout Price or request evidence" in sql
    assert "commerce_checkout_session_fingerprint_check" in sql
    assert "commerce_checkout_session_revision_check" in sql
    assert "provider, provider_mode, provider_account_id, status" in sql
    assert "provider, provider_mode, external_price_id" in sql
