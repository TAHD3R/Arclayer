from __future__ import annotations

from pathlib import Path

import asyncpg

MIGRATION_0078 = "0078_platform_identity_security_hard_cut"
MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "src" / "migrations"


def _migration_names_through_0078() -> list[str]:
    return sorted(
        path.stem
        for path in MIGRATIONS_DIR.glob("[0-9][0-9][0-9][0-9]_*.py")
        if path.stem <= MIGRATION_0078
    )


async def prepare_commercialization_legacy_schema(conn: asyncpg.Connection) -> None:
    """Build only the predecessor tables the destructive 0079 migration touches."""

    await conn.execute(
        """
        CREATE TABLE tortoise_migrations (
            id SERIAL PRIMARY KEY,
            app VARCHAR(255) NOT NULL,
            name VARCHAR(255) NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL,
            UNIQUE (app, name)
        );
        CREATE TABLE workspaces (id UUID PRIMARY KEY);
        CREATE TABLE commerce_plans (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            code VARCHAR(48) NOT NULL CONSTRAINT uid_commerce_pl_code_407aa2 UNIQUE,
            tier VARCHAR(10) NOT NULL,
            name VARCHAR(96) NOT NULL,
            description VARCHAR(512) NOT NULL,
            name_i18n_key VARCHAR(128),
            description_i18n_key VARCHAR(128),
            credit_grant_amount BIGINT NOT NULL,
            credit_refresh_interval VARCHAR(7) NOT NULL DEFAULT 'monthly',
            credit_value_micros BIGINT NOT NULL DEFAULT 1000,
            price_monthly_micros BIGINT NOT NULL DEFAULT 0,
            price_yearly_micros BIGINT NOT NULL DEFAULT 0,
            currency VARCHAR(3) NOT NULL DEFAULT 'USD',
            features JSONB NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            is_default BOOLEAN NOT NULL DEFAULT FALSE,
            sort_order INTEGER NOT NULL DEFAULT 100
        );
        CREATE TABLE commerce_workspace_subscriptions (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            workspace_id UUID NOT NULL CONSTRAINT uid_commerce_wo_workspa_e3f73f UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
            plan_id UUID NOT NULL REFERENCES commerce_plans(id) ON DELETE RESTRICT,
            status VARCHAR(8) NOT NULL DEFAULT 'active',
            billing_cycle VARCHAR(7) NOT NULL DEFAULT 'monthly',
            current_period_start TIMESTAMPTZ NOT NULL,
            current_period_end TIMESTAMPTZ NOT NULL,
            cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
            billing_provider VARCHAR(32) NOT NULL DEFAULT 'manual',
            external_customer_id VARCHAR(128),
            external_subscription_id VARCHAR(128) CONSTRAINT uid_commerce_wo_externa_2cbc1f UNIQUE
        );
        CREATE TABLE commerce_workspace_credit_accounts (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            workspace_id UUID NOT NULL CONSTRAINT uid_commerce_wo_workspa_23b1e4 UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
            subscription_id UUID NOT NULL CONSTRAINT uid_commerce_wo_subscri_642056 UNIQUE REFERENCES commerce_workspace_subscriptions(id) ON DELETE CASCADE,
            balance_credits BIGINT NOT NULL DEFAULT 0,
            reserved_credits BIGINT NOT NULL DEFAULT 0,
            lifetime_granted_credits BIGINT NOT NULL DEFAULT 0,
            lifetime_spent_credits BIGINT NOT NULL DEFAULT 0,
            period_granted_credits BIGINT NOT NULL DEFAULT 0,
            period_spent_credits BIGINT NOT NULL DEFAULT 0,
            period_start TIMESTAMPTZ NOT NULL,
            period_end TIMESTAMPTZ NOT NULL
        );
        CREATE TABLE commerce_workspace_credit_ledger (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            workspace_id UUID NOT NULL,
            account_id UUID NOT NULL,
            entry_type VARCHAR(12) NOT NULL,
            delta_balance_credits BIGINT NOT NULL,
            delta_reserved_credits BIGINT NOT NULL,
            balance_after_credits BIGINT NOT NULL,
            reserved_after_credits BIGINT NOT NULL,
            reference_type VARCHAR(48) NOT NULL,
            reference_id UUID,
            idempotency_key VARCHAR(160) NOT NULL CONSTRAINT uid_commerce_wo_idempot_72913e UNIQUE,
            actor_user_id UUID,
            description_key VARCHAR(128) NOT NULL,
            details JSONB NOT NULL
        );
        CREATE TABLE commerce_subscription_change_requests (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            requested_plan_id UUID NOT NULL REFERENCES commerce_plans(id) ON DELETE RESTRICT,
            requested_by_user_id UUID NOT NULL,
            billing_cycle VARCHAR(7) NOT NULL,
            reason VARCHAR(1000),
            status VARCHAR(8) NOT NULL DEFAULT 'pending',
            reviewed_by_user_id UUID,
            reviewed_at TIMESTAMPTZ,
            review_note VARCHAR(1000)
        );
        CREATE TABLE commerce_billing_provider_event_receipts (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            provider VARCHAR(32) NOT NULL,
            event_id VARCHAR(255) NOT NULL,
            workspace_id UUID NOT NULL,
            CONSTRAINT uid_commerce_bi_provide_cc6c67 UNIQUE (provider, event_id)
        );
        CREATE INDEX idx_commerce_pl_created_ab242f ON commerce_plans (created_at);
        CREATE INDEX idx_commerce_pl_tier_ad2a71 ON commerce_plans (tier);
        CREATE INDEX idx_commerce_pl_is_acti_11bce9 ON commerce_plans (is_active);
        CREATE INDEX idx_commerce_pl_is_defa_936d52 ON commerce_plans (is_default);
        CREATE INDEX idx_commerce_pl_sort_or_67c984 ON commerce_plans (sort_order);
        CREATE INDEX idx_commerce_wo_created_598656 ON commerce_workspace_subscriptions (created_at);
        CREATE INDEX idx_commerce_wo_plan_id_677110 ON commerce_workspace_subscriptions (plan_id);
        CREATE INDEX idx_commerce_wo_status_9c7bee ON commerce_workspace_subscriptions (status);
        CREATE INDEX idx_commerce_wo_current_57894c ON commerce_workspace_subscriptions (current_period_end);
        CREATE INDEX idx_commerce_wo_externa_fc6ea2 ON commerce_workspace_subscriptions (external_customer_id);
        CREATE INDEX idx_commerce_wo_created_d22258 ON commerce_workspace_credit_accounts (created_at);
        CREATE INDEX idx_commerce_wo_period__9d6d67 ON commerce_workspace_credit_accounts (period_end);
        CREATE INDEX idx_commerce_wo_created_8c7397 ON commerce_workspace_credit_ledger (created_at);
        CREATE INDEX idx_commerce_wo_workspa_f9400f ON commerce_workspace_credit_ledger (workspace_id);
        CREATE INDEX idx_commerce_wo_account_733ca0 ON commerce_workspace_credit_ledger (account_id);
        CREATE INDEX idx_commerce_wo_entry_t_e18844 ON commerce_workspace_credit_ledger (entry_type);
        CREATE INDEX idx_commerce_wo_referen_e80cc2 ON commerce_workspace_credit_ledger (reference_id);
        CREATE INDEX idx_commerce_wo_actor_u_11c0ee ON commerce_workspace_credit_ledger (actor_user_id);
        CREATE INDEX idx_commerce_wo_workspa_7e4729 ON commerce_workspace_credit_ledger (workspace_id, created_at);
        CREATE INDEX idx_commerce_wo_account_952afa ON commerce_workspace_credit_ledger (account_id, created_at);
        CREATE INDEX idx_commerce_su_created_96922a ON commerce_subscription_change_requests (created_at);
        CREATE INDEX idx_commerce_su_workspa_64de6d ON commerce_subscription_change_requests (workspace_id);
        CREATE INDEX idx_commerce_su_request_b18a57 ON commerce_subscription_change_requests (requested_plan_id);
        CREATE INDEX idx_commerce_su_request_157bc8 ON commerce_subscription_change_requests (requested_by_user_id);
        CREATE INDEX idx_commerce_su_status_9f9b71 ON commerce_subscription_change_requests (status);
        CREATE INDEX idx_commerce_su_workspa_c316d5 ON commerce_subscription_change_requests (workspace_id, status, created_at);
        CREATE INDEX idx_commerce_su_status_f85f54 ON commerce_subscription_change_requests (status, created_at);
        CREATE INDEX idx_commerce_bi_created_2fb56a ON commerce_billing_provider_event_receipts (created_at);
        CREATE INDEX idx_commerce_bi_workspa_7f21c2 ON commerce_billing_provider_event_receipts (workspace_id);
        CREATE INDEX idx_commerce_bi_workspa_9d1e46 ON commerce_billing_provider_event_receipts (workspace_id, created_at);
        CREATE TABLE connector_event_inbox (
            id UUID PRIMARY KEY,
            connector_key VARCHAR(128) NOT NULL
        );
        """
    )
    await conn.executemany(
        """
        INSERT INTO tortoise_migrations (app, name, applied_at)
        VALUES ('models', $1, NOW())
        """,
        [(name,) for name in _migration_names_through_0078()],
    )
