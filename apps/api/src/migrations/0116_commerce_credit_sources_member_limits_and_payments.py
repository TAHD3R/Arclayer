from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0115_platform_builtin_role_catalog")]
    initial = False
    operations = [
        ops.RunSQL(
            """
            CREATE TABLE commerce_workspace_credit_grant_lots (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
                account_id UUID NOT NULL REFERENCES commerce_workspace_credit_accounts(id) ON DELETE RESTRICT,
                subscription_id UUID NOT NULL REFERENCES commerce_workspace_subscriptions(id) ON DELETE RESTRICT,
                plan_revision_id UUID NOT NULL REFERENCES commerce_plan_revisions(id) ON DELETE RESTRICT,
                source VARCHAR(24) NOT NULL,
                source_identity VARCHAR(255) NOT NULL UNIQUE,
                granted_credits BIGINT NOT NULL,
                remaining_credits BIGINT NOT NULL,
                reserved_credits BIGINT NOT NULL DEFAULT 0,
                issued_at TIMESTAMPTZ NOT NULL,
                expires_at TIMESTAMPTZ NULL,
                actor_user_id UUID NULL,
                description_key VARCHAR(128) NOT NULL,
                CONSTRAINT commerce_credit_grant_lots_source_check
                    CHECK (source IN ('plan_period', 'promotional', 'top_up', 'adjustment', 'legacy_unattributed')),
                CONSTRAINT commerce_credit_grant_lots_amount_check
                    CHECK (
                        granted_credits > 0
                        AND remaining_credits >= 0
                        AND reserved_credits >= 0
                        AND remaining_credits >= reserved_credits
                        AND remaining_credits <= granted_credits
                    ),
                CONSTRAINT commerce_credit_grant_lots_expiry_check
                    CHECK (expires_at IS NULL OR expires_at > issued_at)
            );
            CREATE INDEX commerce_credit_grant_lots_depletion_idx
                ON commerce_workspace_credit_grant_lots (workspace_id, source, expires_at, issued_at);
            CREATE INDEX commerce_credit_grant_lots_account_idx
                ON commerce_workspace_credit_grant_lots (account_id, expires_at, issued_at);
            CREATE INDEX commerce_credit_grant_lots_source_idx
                ON commerce_workspace_credit_grant_lots (source);
            CREATE INDEX commerce_credit_grant_lots_issued_idx
                ON commerce_workspace_credit_grant_lots (issued_at);
            CREATE INDEX commerce_credit_grant_lots_expiry_idx
                ON commerce_workspace_credit_grant_lots (expires_at);
            CREATE INDEX commerce_credit_grant_lots_actor_idx
                ON commerce_workspace_credit_grant_lots (actor_user_id);

            CREATE TABLE commerce_workspace_credit_lot_allocations (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                lot_id UUID NOT NULL REFERENCES commerce_workspace_credit_grant_lots(id) ON DELETE RESTRICT,
                reservation_id UUID NOT NULL REFERENCES ai_budget_reservations(id) ON DELETE RESTRICT,
                request_id UUID NOT NULL,
                reserved_credits BIGINT NOT NULL,
                committed_credits BIGINT NOT NULL DEFAULT 0,
                released_credits BIGINT NOT NULL DEFAULT 0,
                status VARCHAR(16) NOT NULL DEFAULT 'reserved',
                CONSTRAINT commerce_credit_lot_allocation_status_check
                    CHECK (status IN ('reserved', 'settled')),
                CONSTRAINT commerce_credit_lot_allocation_amount_check CHECK (
                    reserved_credits > 0
                    AND committed_credits >= 0
                    AND released_credits >= 0
                    AND committed_credits + released_credits <= reserved_credits
                    AND (
                        (status = 'reserved' AND committed_credits = 0 AND released_credits = 0)
                        OR (status = 'settled' AND committed_credits + released_credits = reserved_credits)
                    )
                ),
                CONSTRAINT commerce_credit_lot_allocation_identity_unique UNIQUE (lot_id, reservation_id)
            );
            CREATE INDEX commerce_credit_lot_allocation_request_status_idx
                ON commerce_workspace_credit_lot_allocations (request_id, status);
            CREATE INDEX commerce_credit_lot_allocation_request_idx
                ON commerce_workspace_credit_lot_allocations (request_id);
            CREATE INDEX commerce_credit_lot_allocation_status_idx
                ON commerce_workspace_credit_lot_allocations (status);
            CREATE INDEX commerce_credit_lot_allocation_reservation_status_idx
                ON commerce_workspace_credit_lot_allocations (reservation_id, status);

            CREATE TABLE commerce_workspace_credit_lot_mutations (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                lot_id UUID NOT NULL REFERENCES commerce_workspace_credit_grant_lots(id) ON DELETE RESTRICT,
                ledger_entry_id UUID NOT NULL REFERENCES commerce_workspace_credit_ledger(id) ON DELETE RESTRICT,
                kind VARCHAR(16) NOT NULL,
                delta_remaining_credits BIGINT NOT NULL,
                source_identity VARCHAR(255) NOT NULL UNIQUE,
                actor_user_id UUID NULL,
                reason TEXT NOT NULL,
                evidence_reference VARCHAR(255) NOT NULL,
                occurred_at TIMESTAMPTZ NOT NULL,
                CONSTRAINT commerce_credit_lot_mutation_kind_check
                    CHECK (kind IN ('adjustment', 'refund', 'expiration')),
                CONSTRAINT commerce_credit_lot_mutation_amount_check CHECK (delta_remaining_credits <> 0),
                CONSTRAINT commerce_credit_lot_mutation_identity_unique UNIQUE (lot_id, ledger_entry_id)
            );
            CREATE INDEX commerce_credit_lot_mutation_ledger_idx
                ON commerce_workspace_credit_lot_mutations (ledger_entry_id, created_at);
            CREATE INDEX commerce_credit_lot_mutation_kind_idx
                ON commerce_workspace_credit_lot_mutations (kind);
            CREATE INDEX commerce_credit_lot_mutation_actor_idx
                ON commerce_workspace_credit_lot_mutations (actor_user_id);
            CREATE INDEX commerce_credit_lot_mutation_occurred_idx
                ON commerce_workspace_credit_lot_mutations (occurred_at);

            ALTER TABLE commerce_workspace_credit_ledger ALTER COLUMN entry_type TYPE VARCHAR(24);
            ALTER TABLE commerce_workspace_credit_ledger
                ADD CONSTRAINT commerce_workspace_credit_ledger_entry_type_check CHECK (
                    entry_type IN (
                        'period_grant', 'promotional_grant', 'top_up', 'reservation',
                        'commit', 'release', 'adjustment', 'refund', 'expiration'
                    )
                );

            CREATE TABLE commerce_workspace_member_credit_policies (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
                default_limit_kind VARCHAR(16) NOT NULL DEFAULT 'unlimited',
                default_limit_credits BIGINT NULL,
                revision BIGINT NOT NULL DEFAULT 1,
                updated_by_user_id UUID NULL,
                CONSTRAINT commerce_member_credit_policy_shape_check CHECK (
                    (default_limit_kind = 'limited' AND default_limit_credits > 0)
                    OR (default_limit_kind = 'unlimited' AND default_limit_credits IS NULL)
                ),
                CONSTRAINT commerce_member_credit_policy_revision_check CHECK (revision >= 1)
            );
            CREATE INDEX commerce_member_credit_policy_updated_by_idx
                ON commerce_workspace_member_credit_policies (updated_by_user_id);

            CREATE TABLE commerce_workspace_member_credit_limit_overrides (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                membership_id UUID NOT NULL UNIQUE REFERENCES workspace_memberships(id) ON DELETE CASCADE,
                limit_kind VARCHAR(16) NOT NULL,
                limit_credits BIGINT NULL,
                revision BIGINT NOT NULL DEFAULT 1,
                updated_by_user_id UUID NULL,
                CONSTRAINT commerce_member_credit_limit_override_shape_check CHECK (
                    (limit_kind = 'limited' AND limit_credits > 0)
                    OR (limit_kind = 'unlimited' AND limit_credits IS NULL)
                ),
                CONSTRAINT commerce_member_credit_limit_override_revision_check CHECK (revision >= 1),
                CONSTRAINT commerce_member_credit_limit_override_identity_unique
                    UNIQUE (workspace_id, membership_id)
            );
            CREATE INDEX commerce_member_credit_limit_override_updated_by_idx
                ON commerce_workspace_member_credit_limit_overrides (updated_by_user_id);

            CREATE TABLE commerce_workspace_member_credit_usage_periods (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                membership_id UUID NOT NULL,
                period_start TIMESTAMPTZ NOT NULL,
                period_end TIMESTAMPTZ NOT NULL,
                reserved_credits BIGINT NOT NULL DEFAULT 0,
                committed_credits BIGINT NOT NULL DEFAULT 0,
                revision BIGINT NOT NULL DEFAULT 1,
                CONSTRAINT commerce_member_credit_usage_period_check CHECK (period_end > period_start),
                CONSTRAINT commerce_member_credit_usage_amount_check
                    CHECK (reserved_credits >= 0 AND committed_credits >= 0),
                CONSTRAINT commerce_member_credit_usage_revision_check CHECK (revision >= 1),
                CONSTRAINT commerce_member_credit_usage_identity_unique
                    UNIQUE (workspace_id, membership_id, period_start, period_end)
            );
            CREATE INDEX commerce_member_credit_usage_workspace_period_idx
                ON commerce_workspace_member_credit_usage_periods (workspace_id, period_start, period_end);
            CREATE INDEX commerce_member_credit_usage_membership_idx
                ON commerce_workspace_member_credit_usage_periods (membership_id);
            CREATE INDEX commerce_member_credit_usage_period_start_idx
                ON commerce_workspace_member_credit_usage_periods (period_start);
            CREATE INDEX commerce_member_credit_usage_period_end_idx
                ON commerce_workspace_member_credit_usage_periods (period_end);

            CREATE TABLE commerce_workspace_credit_usage_events (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
                membership_id UUID NOT NULL,
                actor_user_id UUID NOT NULL,
                account_id UUID NOT NULL REFERENCES commerce_workspace_credit_accounts(id) ON DELETE RESTRICT,
                reservation_id UUID NOT NULL REFERENCES ai_budget_reservations(id) ON DELETE RESTRICT,
                request_id UUID NOT NULL,
                event_type VARCHAR(16) NOT NULL,
                credits BIGINT NOT NULL,
                cost_micros BIGINT NULL,
                project_id UUID NULL,
                agent_run_id UUID NULL,
                capability_key VARCHAR(160) NOT NULL,
                occurred_at TIMESTAMPTZ NOT NULL,
                CONSTRAINT commerce_credit_usage_event_type_check
                    CHECK (event_type IN ('reserved', 'committed', 'released')),
                CONSTRAINT commerce_credit_usage_event_amount_check
                    CHECK (credits >= 0 AND (cost_micros IS NULL OR cost_micros >= 0)),
                CONSTRAINT commerce_credit_usage_event_identity_unique UNIQUE (reservation_id, event_type)
            );
            CREATE INDEX commerce_credit_usage_event_workspace_idx
                ON commerce_workspace_credit_usage_events (workspace_id, occurred_at);
            CREATE INDEX commerce_credit_usage_event_membership_idx
                ON commerce_workspace_credit_usage_events (membership_id, occurred_at);
            CREATE INDEX commerce_credit_usage_event_actor_idx
                ON commerce_workspace_credit_usage_events (actor_user_id);
            CREATE INDEX commerce_credit_usage_event_account_idx
                ON commerce_workspace_credit_usage_events (account_id);
            CREATE INDEX commerce_credit_usage_event_project_idx
                ON commerce_workspace_credit_usage_events (project_id, occurred_at);
            CREATE INDEX commerce_credit_usage_event_agent_run_idx
                ON commerce_workspace_credit_usage_events (agent_run_id, occurred_at);
            CREATE INDEX commerce_credit_usage_event_request_idx
                ON commerce_workspace_credit_usage_events (request_id);
            CREATE INDEX commerce_credit_usage_event_type_idx
                ON commerce_workspace_credit_usage_events (event_type);
            CREATE INDEX commerce_credit_usage_event_capability_idx
                ON commerce_workspace_credit_usage_events (capability_key);
            CREATE INDEX commerce_credit_usage_event_occurred_idx
                ON commerce_workspace_credit_usage_events (occurred_at);

            ALTER TABLE ai_budget_reservations
                ADD COLUMN workspace_membership_id UUID NULL,
                ADD COLUMN actor_user_id UUID NULL,
                ADD COLUMN project_id UUID NULL,
                ADD COLUMN capability_key VARCHAR(160) NULL,
                ADD COLUMN credit_attribution_version SMALLINT NOT NULL DEFAULT 0,
                ADD CONSTRAINT ai_budget_reservation_credit_attribution_check CHECK (
                    credit_account_id IS NULL
                    OR credit_attribution_version = 0
                    OR (
                        credit_attribution_version = 1
                        AND workspace_membership_id IS NOT NULL
                        AND actor_user_id IS NOT NULL
                        AND NULLIF(BTRIM(capability_key), '') IS NOT NULL
                    )
                ),
                ADD CONSTRAINT ai_budget_reservation_credit_attribution_version_check
                    CHECK (credit_attribution_version IN (0, 1));
            ALTER TABLE ai_budget_reservations
                ALTER COLUMN credit_attribution_version SET DEFAULT 1;
            CREATE INDEX ai_budget_reservations_workspace_membership_idx
                ON ai_budget_reservations (workspace_membership_id);
            CREATE INDEX ai_budget_reservations_actor_user_idx
                ON ai_budget_reservations (actor_user_id);
            CREATE INDEX ai_budget_reservations_project_idx
                ON ai_budget_reservations (project_id);
            CREATE INDEX ai_budget_reservations_capability_idx
                ON ai_budget_reservations (capability_key);

            CREATE TABLE commerce_credit_top_up_offers (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                code VARCHAR(48) NOT NULL UNIQUE,
                credit_amount BIGINT NOT NULL,
                name_i18n_key VARCHAR(128) NOT NULL,
                description_i18n_key VARCHAR(128) NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                sort_order INTEGER NOT NULL DEFAULT 100,
                revision BIGINT NOT NULL DEFAULT 1,
                CONSTRAINT commerce_top_up_offer_credit_amount_check CHECK (credit_amount > 0),
                CONSTRAINT commerce_top_up_offer_revision_check CHECK (revision >= 1)
            );
            CREATE INDEX commerce_top_up_offer_active_idx ON commerce_credit_top_up_offers (is_active);
            CREATE INDEX commerce_top_up_offer_sort_idx ON commerce_credit_top_up_offers (sort_order);

            CREATE TABLE commerce_credit_top_up_offer_prices (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                offer_id UUID NOT NULL REFERENCES commerce_credit_top_up_offers(id) ON DELETE CASCADE,
                provider VARCHAR(32) NOT NULL,
                provider_mode VARCHAR(8) NOT NULL,
                currency VARCHAR(3) NOT NULL,
                amount_micros BIGINT NOT NULL,
                external_price_id VARCHAR(255) NOT NULL,
                CONSTRAINT commerce_top_up_offer_price_mode_check CHECK (provider_mode IN ('test', 'live')),
                CONSTRAINT commerce_top_up_offer_price_amount_check CHECK (amount_micros > 0),
                CONSTRAINT commerce_top_up_offer_price_identity_unique
                    UNIQUE (offer_id, provider, provider_mode, currency)
            );
            CREATE INDEX commerce_top_up_offer_price_external_idx
                ON commerce_credit_top_up_offer_prices (provider, provider_mode, external_price_id);

            CREATE TABLE commerce_checkout_sessions (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
                subscription_id UUID NULL REFERENCES commerce_workspace_subscriptions(id) ON DELETE RESTRICT,
                target_plan_revision_id UUID NULL REFERENCES commerce_plan_revisions(id) ON DELETE RESTRICT,
                top_up_offer_id UUID NULL REFERENCES commerce_credit_top_up_offers(id) ON DELETE RESTRICT,
                provider VARCHAR(32) NOT NULL,
                provider_mode VARCHAR(8) NOT NULL,
                kind VARCHAR(16) NOT NULL,
                status VARCHAR(16) NOT NULL DEFAULT 'pending',
                billing_cycle VARCHAR(16) NULL,
                currency VARCHAR(3) NOT NULL,
                amount_micros BIGINT NOT NULL,
                credit_amount BIGINT NULL,
                external_session_id VARCHAR(255) NOT NULL UNIQUE,
                checkout_url TEXT NOT NULL,
                idempotency_key VARCHAR(160) NOT NULL UNIQUE,
                actor_user_id UUID NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                completed_at TIMESTAMPTZ NULL,
                CONSTRAINT commerce_checkout_session_mode_check CHECK (provider_mode IN ('test', 'live')),
                CONSTRAINT commerce_checkout_session_kind_check CHECK (kind IN ('subscription', 'top_up')),
                CONSTRAINT commerce_checkout_session_status_check
                    CHECK (status IN ('pending', 'completed', 'failed', 'canceled', 'expired')),
                CONSTRAINT commerce_checkout_session_cycle_check
                    CHECK (billing_cycle IS NULL OR billing_cycle IN ('monthly', 'yearly')),
                CONSTRAINT commerce_checkout_session_amount_check
                    CHECK (amount_micros >= 0 AND (credit_amount IS NULL OR credit_amount > 0)),
                CONSTRAINT commerce_checkout_session_target_check CHECK (
                    (kind = 'subscription' AND target_plan_revision_id IS NOT NULL AND top_up_offer_id IS NULL)
                    OR (kind = 'top_up' AND target_plan_revision_id IS NULL AND top_up_offer_id IS NOT NULL AND credit_amount IS NOT NULL)
                ),
                CONSTRAINT commerce_checkout_session_expiry_check CHECK (expires_at > created_at)
            );
            CREATE INDEX commerce_checkout_session_workspace_idx
                ON commerce_checkout_sessions (workspace_id, created_at);
            CREATE INDEX commerce_checkout_session_provider_status_idx
                ON commerce_checkout_sessions (provider, provider_mode, status);
            CREATE INDEX commerce_checkout_session_kind_idx ON commerce_checkout_sessions (kind);
            CREATE INDEX commerce_checkout_session_status_idx ON commerce_checkout_sessions (status);
            CREATE INDEX commerce_checkout_session_actor_idx ON commerce_checkout_sessions (actor_user_id);
            CREATE INDEX commerce_checkout_session_expiry_idx ON commerce_checkout_sessions (expires_at);

            CREATE TABLE commerce_invoices (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
                subscription_id UUID NULL REFERENCES commerce_workspace_subscriptions(id) ON DELETE RESTRICT,
                provider VARCHAR(32) NOT NULL,
                provider_mode VARCHAR(8) NOT NULL,
                external_invoice_id VARCHAR(255) NOT NULL,
                status VARCHAR(24) NOT NULL,
                currency VARCHAR(3) NOT NULL,
                amount_due_micros BIGINT NOT NULL,
                amount_paid_micros BIGINT NOT NULL DEFAULT 0,
                amount_refunded_micros BIGINT NOT NULL DEFAULT 0,
                period_start TIMESTAMPTZ NULL,
                period_end TIMESTAMPTZ NULL,
                hosted_invoice_url TEXT NULL,
                issued_at TIMESTAMPTZ NOT NULL,
                paid_at TIMESTAMPTZ NULL,
                CONSTRAINT commerce_invoice_mode_check CHECK (provider_mode IN ('test', 'live')),
                CONSTRAINT commerce_invoice_status_check
                    CHECK (status IN ('open', 'paid', 'void', 'uncollectible', 'refunded', 'partially_refunded')),
                CONSTRAINT commerce_invoice_amount_check CHECK (
                    amount_due_micros >= 0
                    AND amount_paid_micros >= 0
                    AND amount_refunded_micros >= 0
                    AND amount_refunded_micros <= amount_paid_micros
                ),
                CONSTRAINT commerce_invoice_period_check
                    CHECK (period_start IS NULL OR period_end IS NULL OR period_end > period_start),
                CONSTRAINT commerce_invoice_identity_unique
                    UNIQUE (provider, provider_mode, external_invoice_id)
            );
            CREATE INDEX commerce_invoice_workspace_idx ON commerce_invoices (workspace_id, issued_at);
            CREATE INDEX commerce_invoice_status_idx ON commerce_invoices (status, issued_at);

            CREATE TABLE commerce_transactions (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
                subscription_id UUID NULL REFERENCES commerce_workspace_subscriptions(id) ON DELETE RESTRICT,
                checkout_session_id UUID NULL REFERENCES commerce_checkout_sessions(id) ON DELETE RESTRICT,
                invoice_id UUID NULL REFERENCES commerce_invoices(id) ON DELETE RESTRICT,
                provider VARCHAR(32) NOT NULL,
                provider_mode VARCHAR(8) NOT NULL,
                external_transaction_id VARCHAR(255) NOT NULL,
                kind VARCHAR(16) NOT NULL,
                status VARCHAR(24) NOT NULL,
                currency VARCHAR(3) NOT NULL,
                amount_micros BIGINT NOT NULL,
                credit_amount BIGINT NULL,
                occurred_at TIMESTAMPTZ NOT NULL,
                provider_event_id VARCHAR(255) NULL,
                CONSTRAINT commerce_transaction_mode_check CHECK (provider_mode IN ('test', 'live')),
                CONSTRAINT commerce_transaction_kind_check CHECK (kind IN ('subscription', 'renewal', 'top_up', 'refund')),
                CONSTRAINT commerce_transaction_status_check CHECK (
                    status IN ('pending', 'succeeded', 'failed', 'canceled', 'refunded', 'partially_refunded')
                ),
                CONSTRAINT commerce_transaction_amount_check
                    CHECK (amount_micros >= 0 AND (credit_amount IS NULL OR credit_amount > 0)),
                CONSTRAINT commerce_transaction_identity_unique
                    UNIQUE (provider, provider_mode, external_transaction_id)
            );
            CREATE INDEX commerce_transaction_workspace_idx
                ON commerce_transactions (workspace_id, occurred_at);
            CREATE INDEX commerce_transaction_status_idx
                ON commerce_transactions (status, occurred_at);
            CREATE INDEX commerce_transaction_kind_idx ON commerce_transactions (kind);
            CREATE INDEX commerce_transaction_provider_event_idx ON commerce_transactions (provider_event_id);

            CREATE TABLE commerce_refunds (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                transaction_id UUID NOT NULL REFERENCES commerce_transactions(id) ON DELETE RESTRICT,
                status VARCHAR(16) NOT NULL DEFAULT 'pending',
                amount_micros BIGINT NOT NULL,
                credit_amount BIGINT NULL,
                reason TEXT NOT NULL,
                actor_user_id UUID NOT NULL,
                idempotency_key VARCHAR(160) NOT NULL UNIQUE,
                external_refund_id VARCHAR(255) NULL UNIQUE,
                provider_event_id VARCHAR(255) NULL,
                completed_at TIMESTAMPTZ NULL,
                failure_code VARCHAR(96) NULL,
                CONSTRAINT commerce_refund_status_check
                    CHECK (status IN ('pending', 'succeeded', 'failed', 'canceled')),
                CONSTRAINT commerce_refund_amount_check
                    CHECK (amount_micros > 0 AND (credit_amount IS NULL OR credit_amount > 0))
            );
            CREATE INDEX commerce_refund_transaction_idx ON commerce_refunds (transaction_id, created_at);
            CREATE INDEX commerce_refund_status_idx ON commerce_refunds (status, created_at);
            CREATE INDEX commerce_refund_actor_idx ON commerce_refunds (actor_user_id);
            CREATE INDEX commerce_refund_provider_event_idx ON commerce_refunds (provider_event_id);

            CREATE TABLE commerce_workspace_auto_refill_policies (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
                offer_id UUID NOT NULL REFERENCES commerce_credit_top_up_offers(id) ON DELETE RESTRICT,
                is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                trigger_below_credits BIGINT NOT NULL,
                monthly_ceiling_micros BIGINT NOT NULL,
                currency VARCHAR(3) NOT NULL,
                revision BIGINT NOT NULL DEFAULT 1,
                updated_by_user_id UUID NOT NULL,
                CONSTRAINT commerce_auto_refill_amount_check
                    CHECK (trigger_below_credits >= 0 AND monthly_ceiling_micros > 0),
                CONSTRAINT commerce_auto_refill_revision_check CHECK (revision >= 1)
            );
            CREATE INDEX commerce_workspace_auto_refill_enabled_idx
                ON commerce_workspace_auto_refill_policies (is_enabled);
            CREATE INDEX commerce_workspace_auto_refill_updated_by_idx
                ON commerce_workspace_auto_refill_policies (updated_by_user_id);

            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM ai_budget_reservations AS reservation
                    WHERE reservation.credit_account_id IS NOT NULL
                      AND reservation.credits_reconciled_at IS NULL
                      AND reservation.status NOT IN ('reserved', 'expired')
                ) THEN
                    RAISE EXCEPTION
                        '0116 credit lot backfill found an unreconciled terminal reservation';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM ai_budget_reservations AS reservation
                    WHERE reservation.credit_account_id IS NOT NULL
                      AND reservation.credits_reconciled_at IS NULL
                      AND reservation.status IN ('reserved', 'expired')
                      AND (reservation.reserved_credits IS NULL OR reservation.reserved_credits <= 0)
                ) THEN
                    RAISE EXCEPTION
                        '0116 credit lot backfill requires positive Credits for every unreconciled reservation';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM commerce_workspace_credit_accounts AS account
                    WHERE account.balance_credits > 0
                      AND account.period_end <= NOW()
                ) THEN
                    RAISE EXCEPTION
                        '0116 credit lot backfill cannot classify a positive balance from an expired legacy period';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM commerce_workspace_credit_accounts AS account
                    LEFT JOIN (
                        SELECT
                            reservation.credit_account_id,
                            SUM(reservation.reserved_credits) AS reserved_credits
                        FROM ai_budget_reservations AS reservation
                        WHERE reservation.credit_account_id IS NOT NULL
                          AND reservation.reserved_credits > 0
                          AND reservation.credits_reconciled_at IS NULL
                          AND reservation.status IN ('reserved', 'expired')
                        GROUP BY reservation.credit_account_id
                    ) AS reservation_totals
                        ON reservation_totals.credit_account_id = account.id
                    WHERE account.reserved_credits <> COALESCE(reservation_totals.reserved_credits, 0)
                ) THEN
                    RAISE EXCEPTION
                        '0116 credit lot backfill requires account reserved credits to equal unreconciled reservation totals';
                END IF;
            END $$;

            INSERT INTO commerce_workspace_credit_grant_lots (
                id, created_at, updated_at, workspace_id, account_id, subscription_id,
                plan_revision_id, source, source_identity, granted_credits,
                remaining_credits, reserved_credits, issued_at, expires_at,
                actor_user_id, description_key
            )
            SELECT
                md5('arclayer:commerce-credit-grant-lot:migration:' || account.id::text)::uuid,
                NOW(), NOW(), account.workspace_id, account.id, account.subscription_id,
                account.plan_revision_id, 'legacy_unattributed',
                'migration:unattributed-credit-account:' || account.id::text,
                account.balance_credits, account.balance_credits, account.reserved_credits,
                account.period_start, NULL, NULL, 'LEDGER_MIGRATION_UNATTRIBUTED'
            FROM commerce_workspace_credit_accounts AS account
            WHERE account.balance_credits > 0;

            INSERT INTO commerce_workspace_credit_lot_allocations (
                id, created_at, updated_at, lot_id, reservation_id, request_id,
                reserved_credits, committed_credits, released_credits, status
            )
            SELECT
                md5('arclayer:commerce-credit-lot-allocation:migration:' || reservation.id::text)::uuid,
                NOW(), NOW(), lot.id, reservation.id, reservation.request_id,
                reservation.reserved_credits, 0, 0, 'reserved'
            FROM ai_budget_reservations AS reservation
            JOIN commerce_workspace_credit_grant_lots AS lot
                ON lot.account_id = reservation.credit_account_id
            WHERE reservation.credit_account_id IS NOT NULL
              AND reservation.reserved_credits > 0
              AND reservation.credits_reconciled_at IS NULL
              AND reservation.status IN ('reserved', 'expired');

            INSERT INTO commerce_workspace_member_credit_policies (
                id, created_at, updated_at, workspace_id, default_limit_kind,
                default_limit_credits, revision, updated_by_user_id
            )
            SELECT
                md5('arclayer:commerce-member-credit-policy:' || workspace.id::text)::uuid,
                NOW(), NOW(), workspace.id, 'unlimited', NULL, 1, NULL
            FROM workspaces AS workspace
            ON CONFLICT (workspace_id) DO NOTHING;
            """
        )
    ]
