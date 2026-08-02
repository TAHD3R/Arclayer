from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0078_platform_identity_security_hard_cut")]

    initial = False

    operations = [
        ops.RunSQL(
            """
            -- Aerich applies this operation in one transaction. Validate the complete
            -- predecessor contract before any DDL so failed cutovers leave it intact.
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM commerce_subscription_change_requests
                    WHERE status NOT IN ('approved', 'rejected', 'canceled')
                ) THEN
                    RAISE EXCEPTION '0079 commercialization hard cut blocked: unresolved subscription change requests exist';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM commerce_workspace_subscriptions
                    WHERE status NOT IN ('active', 'past_due', 'canceled')
                ) THEN
                    RAISE EXCEPTION '0079 commercialization hard cut blocked: trialing or illegal subscription status exists';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM commerce_workspace_subscriptions
                    WHERE billing_provider <> 'manual'
                ) THEN
                    RAISE EXCEPTION '0079 commercialization hard cut blocked: external subscription lacks provider_mode and exact price identity';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM commerce_plans
                    WHERE credit_grant_amount < 0 OR credit_value_micros <= 0
                ) THEN
                    RAISE EXCEPTION '0079 commercialization hard cut blocked: plan credit grant or credit value invariant is invalid';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM commerce_plans
                    WHERE price_monthly_micros <> 0 OR price_yearly_micros <> 0
                ) THEN
                    RAISE EXCEPTION '0079 commercialization hard cut blocked: nonzero legacy price has no exact revision-scoped provider mapping';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM commerce_plans
                    WHERE code NOT IN ('free', 'premium')
                      AND (NULLIF(BTRIM(name_i18n_key), '') IS NULL OR NULLIF(BTRIM(description_i18n_key), '') IS NULL)
                ) THEN
                    RAISE EXCEPTION '0079 commercialization hard cut blocked: unknown plan lacks required i18n keys';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM commerce_plans
                    WHERE (code = 'free' AND tier <> 'free')
                       OR (code <> 'free' AND tier = 'free')
                ) THEN
                    RAISE EXCEPTION '0079 commercialization hard cut blocked: legacy Free Plan identity is ambiguous';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM commerce_plans
                    WHERE jsonb_typeof(features) <> 'array'
                ) OR EXISTS (
                    SELECT 1
                    FROM commerce_plans AS plan
                    CROSS JOIN LATERAL jsonb_array_elements(plan.features) AS feature(value)
                    WHERE jsonb_typeof(plan.features) = 'array'
                      AND (
                          jsonb_typeof(feature.value) <> 'string'
                          OR feature.value #>> '{}' NOT IN ('sites.generate', 'workspace.roles.manage')
                      )
                ) THEN
                    RAISE EXCEPTION '0079 commercialization hard cut blocked: legacy plan features are not an explicit supported entitlement array';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM commerce_workspace_subscriptions
                    WHERE billing_cycle NOT IN ('monthly', 'yearly')
                       OR current_period_end <= current_period_start
                ) THEN
                    RAISE EXCEPTION '0079 commercialization hard cut blocked: subscription billing cycle or period invariant is invalid';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM commerce_workspace_credit_accounts AS account
                    LEFT JOIN commerce_workspace_subscriptions AS subscription ON subscription.id = account.subscription_id
                    WHERE subscription.id IS NULL
                       OR subscription.workspace_id <> account.workspace_id
                       OR account.balance_credits < 0
                       OR account.reserved_credits < 0
                       OR account.balance_credits < account.reserved_credits
                       OR account.lifetime_granted_credits < 0
                       OR account.lifetime_spent_credits < 0
                       OR account.period_granted_credits < 0
                       OR account.period_spent_credits < 0
                       OR account.lifetime_spent_credits > account.lifetime_granted_credits
                       OR account.period_spent_credits > account.period_granted_credits
                       OR account.period_end <= account.period_start
                ) THEN
                    RAISE EXCEPTION '0079 commercialization hard cut blocked: credit account balance or period invariant is invalid';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM commerce_workspace_credit_ledger AS ledger
                    LEFT JOIN commerce_workspace_credit_accounts AS account ON account.id = ledger.account_id
                    WHERE account.id IS NULL
                       OR account.workspace_id <> ledger.workspace_id
                       OR ledger.balance_after_credits < 0
                       OR ledger.reserved_after_credits < 0
                       OR ledger.balance_after_credits < ledger.reserved_after_credits
                       OR NULLIF(BTRIM(ledger.idempotency_key), '') IS NULL
                       OR ledger.entry_type NOT IN ('period_grant', 'reservation', 'commit', 'release', 'adjustment', 'expiration')
                ) THEN
                    RAISE EXCEPTION '0079 commercialization hard cut blocked: credit ledger balance or idempotency invariant is invalid';
                END IF;
            END $$;

            ALTER TABLE commerce_subscription_change_requests RENAME TO commerce_subscription_change_requests_legacy_0079;
            ALTER TABLE commerce_workspace_credit_ledger RENAME TO commerce_workspace_credit_ledger_legacy_0079;
            ALTER TABLE commerce_workspace_credit_accounts RENAME TO commerce_workspace_credit_accounts_legacy_0079;
            ALTER TABLE commerce_billing_provider_event_receipts RENAME TO commerce_billing_provider_event_receipts_legacy_0079;
            ALTER TABLE commerce_workspace_subscriptions RENAME TO commerce_workspace_subscriptions_legacy_0079;
            ALTER TABLE commerce_plans RENAME TO commerce_plans_legacy_0079;

            CREATE TABLE commerce_plans (
                id UUID CONSTRAINT commerce_plans_0079_pkey PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                code VARCHAR(48) NOT NULL CONSTRAINT commerce_plans_0079_code_unique UNIQUE,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                sort_order INTEGER NOT NULL DEFAULT 100
            );
            CREATE INDEX commerce_plans_code_idx ON commerce_plans (code);
            CREATE INDEX commerce_plans_is_active_idx ON commerce_plans (is_active);
            CREATE INDEX commerce_plans_sort_order_idx ON commerce_plans (sort_order);

            CREATE TABLE commerce_plan_revisions (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                plan_id UUID NOT NULL REFERENCES commerce_plans(id) ON DELETE RESTRICT,
                sequence INTEGER NOT NULL,
                status VARCHAR(16) NOT NULL,
                name_i18n_key VARCHAR(128) NOT NULL,
                description_i18n_key VARCHAR(128) NOT NULL,
                credit_grant_amount BIGINT NOT NULL,
                credit_refresh_interval VARCHAR(16) NOT NULL,
                credit_value_micros BIGINT NOT NULL,
                currency VARCHAR(3) NOT NULL,
                content_hash VARCHAR(64) UNIQUE,
                published_at TIMESTAMPTZ,
                is_selling BOOLEAN NOT NULL DEFAULT FALSE,
                CONSTRAINT commerce_plan_revisions_sequence_unique UNIQUE (plan_id, sequence),
                CONSTRAINT commerce_plan_revisions_status_check CHECK (status IN ('draft', 'published', 'retired')),
                CONSTRAINT commerce_plan_revisions_credit_check CHECK (credit_grant_amount >= 0 AND credit_value_micros > 0),
                CONSTRAINT commerce_plan_revisions_published_check CHECK (
                    (status = 'published' AND published_at IS NOT NULL AND content_hash IS NOT NULL)
                    OR status <> 'published'
                ),
                CONSTRAINT commerce_plan_revisions_selling_check CHECK (NOT is_selling OR status = 'published')
            );
            CREATE INDEX commerce_plan_revisions_plan_status_sequence_idx
                ON commerce_plan_revisions (plan_id, status, sequence);
            CREATE UNIQUE INDEX commerce_plan_revisions_one_selling_published
                ON commerce_plan_revisions (plan_id) WHERE is_selling AND status = 'published';

            CREATE TABLE commerce_plan_revision_prices (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                plan_revision_id UUID NOT NULL REFERENCES commerce_plan_revisions(id) ON DELETE CASCADE,
                provider VARCHAR(32) NOT NULL,
                provider_mode VARCHAR(8) NOT NULL,
                billing_cycle VARCHAR(16) NOT NULL,
                currency VARCHAR(3) NOT NULL,
                amount_micros BIGINT NOT NULL,
                external_price_id VARCHAR(255) NOT NULL,
                CONSTRAINT commerce_plan_revision_prices_scope_unique
                    UNIQUE (plan_revision_id, provider, provider_mode, billing_cycle, currency),
                CONSTRAINT commerce_plan_revision_prices_amount_check CHECK (amount_micros >= 0),
                CONSTRAINT commerce_plan_revision_prices_mode_check CHECK (provider_mode IN ('test', 'live')),
                CONSTRAINT commerce_plan_revision_prices_cycle_check CHECK (billing_cycle IN ('monthly', 'yearly'))
            );
            CREATE UNIQUE INDEX commerce_plan_revision_prices_external_price_unique
                ON commerce_plan_revision_prices (provider, provider_mode, external_price_id);

            CREATE TABLE commerce_resource_definitions (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                key VARCHAR(128) NOT NULL UNIQUE,
                is_active BOOLEAN NOT NULL DEFAULT TRUE
            );

            CREATE TABLE commerce_plan_revision_resource_allowances (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                plan_revision_id UUID NOT NULL REFERENCES commerce_plan_revisions(id) ON DELETE CASCADE,
                resource_id UUID NOT NULL REFERENCES commerce_resource_definitions(id) ON DELETE RESTRICT,
                limit_kind VARCHAR(16) NOT NULL,
                limit_value BIGINT,
                CONSTRAINT commerce_plan_revision_resource_allowances_unique UNIQUE (plan_revision_id, resource_id),
                CONSTRAINT commerce_plan_revision_resource_allowances_value_check CHECK (
                    (limit_kind = 'limited' AND limit_value > 0)
                    OR (limit_kind = 'unlimited' AND limit_value IS NULL)
                )
            );

            CREATE TABLE commerce_entitlement_definitions (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                key VARCHAR(160) NOT NULL UNIQUE,
                supports_workspace_allocation BOOLEAN NOT NULL DEFAULT TRUE,
                supports_member_seat_allocation BOOLEAN NOT NULL DEFAULT FALSE,
                is_active BOOLEAN NOT NULL DEFAULT TRUE
            );

            CREATE TABLE commerce_plan_revision_entitlements (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                plan_revision_id UUID NOT NULL REFERENCES commerce_plan_revisions(id) ON DELETE CASCADE,
                entitlement_id UUID NOT NULL REFERENCES commerce_entitlement_definitions(id) ON DELETE RESTRICT,
                is_included BOOLEAN NOT NULL,
                allocation_mode VARCHAR(16),
                seat_limit_kind VARCHAR(16),
                seat_limit_value BIGINT,
                CONSTRAINT commerce_plan_revision_entitlements_unique UNIQUE (plan_revision_id, entitlement_id),
                CONSTRAINT commerce_plan_revision_entitlements_shape_check CHECK (
                    (NOT is_included AND allocation_mode IS NULL AND seat_limit_kind IS NULL AND seat_limit_value IS NULL)
                    OR (is_included AND allocation_mode = 'workspace' AND seat_limit_kind IS NULL AND seat_limit_value IS NULL)
                    OR (is_included AND allocation_mode = 'member_seat' AND (
                        (seat_limit_kind = 'limited' AND seat_limit_value > 0)
                        OR (seat_limit_kind = 'unlimited' AND seat_limit_value IS NULL)
                    ))
                )
            );

            CREATE TABLE commerce_workspace_subscriptions (
                id UUID CONSTRAINT commerce_workspace_subscriptions_0079_pkey PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                workspace_id UUID NOT NULL CONSTRAINT commerce_workspace_subscriptions_0079_workspace_unique UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
                plan_revision_id UUID NOT NULL REFERENCES commerce_plan_revisions(id) ON DELETE RESTRICT,
                status VARCHAR(16) NOT NULL DEFAULT 'active',
                billing_cycle VARCHAR(16) NOT NULL,
                current_period_start TIMESTAMPTZ NOT NULL,
                current_period_end TIMESTAMPTZ NOT NULL,
                cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
                billing_provider VARCHAR(32) NOT NULL,
                provider_mode VARCHAR(8),
                external_customer_id VARCHAR(128),
                external_subscription_id VARCHAR(128) CONSTRAINT commerce_workspace_subscriptions_0079_external_subscription_unique UNIQUE,
                revision BIGINT NOT NULL DEFAULT 1,
                CONSTRAINT commerce_workspace_subscriptions_status_check CHECK (status IN ('active', 'past_due', 'canceled')),
                CONSTRAINT commerce_workspace_subscriptions_cycle_check CHECK (billing_cycle IN ('monthly', 'yearly')),
                CONSTRAINT commerce_workspace_subscriptions_period_check CHECK (current_period_end > current_period_start),
                CONSTRAINT commerce_workspace_subscriptions_mode_check CHECK (provider_mode IS NULL OR provider_mode IN ('test', 'live'))
            );
            CREATE INDEX commerce_workspace_subscriptions_plan_revision_status_idx
                ON commerce_workspace_subscriptions (plan_revision_id, status);
            CREATE INDEX commerce_workspace_subscriptions_external_customer_idx
                ON commerce_workspace_subscriptions (external_customer_id);

            CREATE TABLE commerce_workspace_credit_accounts (
                id UUID CONSTRAINT commerce_workspace_credit_accounts_0079_pkey PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                workspace_id UUID NOT NULL CONSTRAINT commerce_workspace_credit_accounts_0079_workspace_unique UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
                subscription_id UUID NOT NULL CONSTRAINT commerce_workspace_credit_accounts_0079_subscription_unique UNIQUE REFERENCES commerce_workspace_subscriptions(id) ON DELETE CASCADE,
                plan_revision_id UUID NOT NULL REFERENCES commerce_plan_revisions(id) ON DELETE RESTRICT,
                balance_credits BIGINT NOT NULL DEFAULT 0,
                reserved_credits BIGINT NOT NULL DEFAULT 0,
                period_start TIMESTAMPTZ NOT NULL,
                period_end TIMESTAMPTZ NOT NULL,
                period_identity VARCHAR(255) NOT NULL CONSTRAINT commerce_workspace_credit_accounts_0079_period_identity_unique UNIQUE,
                revision BIGINT NOT NULL DEFAULT 1,
                CONSTRAINT commerce_workspace_credit_accounts_balance_check CHECK (
                    balance_credits >= 0 AND reserved_credits >= 0 AND balance_credits >= reserved_credits
                ),
                CONSTRAINT commerce_workspace_credit_accounts_period_check CHECK (period_end > period_start)
            );

            CREATE TABLE commerce_workspace_credit_ledger (
                id UUID CONSTRAINT commerce_workspace_credit_ledger_0079_pkey PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
                account_id UUID NOT NULL REFERENCES commerce_workspace_credit_accounts(id) ON DELETE RESTRICT,
                subscription_id UUID NOT NULL REFERENCES commerce_workspace_subscriptions(id) ON DELETE RESTRICT,
                plan_revision_id UUID NOT NULL REFERENCES commerce_plan_revisions(id) ON DELETE RESTRICT,
                entry_type VARCHAR(16) NOT NULL,
                request_id UUID,
                provider_period_identity VARCHAR(255),
                estimated_cost_micros BIGINT,
                actual_cost_micros BIGINT,
                applied_credit_value_micros BIGINT NOT NULL,
                reserved_credits BIGINT NOT NULL DEFAULT 0,
                committed_credits BIGINT NOT NULL DEFAULT 0,
                delta_balance_credits BIGINT NOT NULL,
                delta_reserved_credits BIGINT NOT NULL,
                balance_after_credits BIGINT NOT NULL,
                reserved_after_credits BIGINT NOT NULL,
                idempotency_key VARCHAR(160) NOT NULL,
                actor_user_id UUID,
                description_key VARCHAR(128) NOT NULL,
                CONSTRAINT commerce_workspace_credit_ledger_idempotency_unique UNIQUE (workspace_id, idempotency_key),
                CONSTRAINT commerce_workspace_credit_ledger_values_check CHECK (
                    applied_credit_value_micros > 0 AND reserved_credits >= 0 AND committed_credits >= 0
                    AND balance_after_credits >= reserved_after_credits AND reserved_after_credits >= 0
                )
            );
            CREATE INDEX commerce_workspace_credit_ledger_workspace_created_idx ON commerce_workspace_credit_ledger (workspace_id, created_at);
            CREATE INDEX commerce_workspace_credit_ledger_account_created_idx ON commerce_workspace_credit_ledger (account_id, created_at);
            CREATE INDEX commerce_workspace_credit_ledger_period_created_idx ON commerce_workspace_credit_ledger (provider_period_identity, created_at);

            CREATE TABLE commerce_feature_access_allocation_scopes (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                entitlement_id UUID NOT NULL REFERENCES commerce_entitlement_definitions(id) ON DELETE RESTRICT,
                revision BIGINT NOT NULL DEFAULT 1,
                CONSTRAINT commerce_feature_access_allocation_scopes_unique UNIQUE (workspace_id, entitlement_id),
                CONSTRAINT commerce_feature_access_allocation_scopes_revision_check CHECK (revision >= 0)
            );

            CREATE TABLE commerce_feature_access_command_receipts (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                scope_id UUID NOT NULL REFERENCES commerce_feature_access_allocation_scopes(id) ON DELETE CASCADE,
                idempotency_key_hash VARCHAR(64) NOT NULL UNIQUE,
                fingerprint VARCHAR(64) NOT NULL,
                operation VARCHAR(16) NOT NULL,
                result_revision BIGINT NOT NULL,
                result_snapshot JSONB NOT NULL,
                CONSTRAINT commerce_feature_access_command_receipts_operation_check
                    CHECK (operation IN ('assign', 'revoke', 'move', 'release', 'convergence')),
                CONSTRAINT commerce_feature_access_command_receipts_revision_check CHECK (result_revision >= 0)
            );
            CREATE INDEX commerce_feature_access_command_receipts_scope_created_idx
                ON commerce_feature_access_command_receipts (scope_id, created_at);

            CREATE TABLE commerce_feature_access_assignments (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                entitlement_id UUID NOT NULL REFERENCES commerce_entitlement_definitions(id) ON DELETE RESTRICT,
                membership_id UUID NOT NULL,
                assigned_by_user_id UUID,
                started_at TIMESTAMPTZ NOT NULL,
                ended_at TIMESTAMPTZ,
                ended_reason VARCHAR(64),
                revision BIGINT NOT NULL DEFAULT 1,
                idempotency_key VARCHAR(128) NOT NULL,
                CONSTRAINT commerce_feature_access_assignments_end_check CHECK (ended_at IS NULL OR ended_at >= started_at)
            );
            CREATE UNIQUE INDEX commerce_feature_access_assignments_one_active
                ON commerce_feature_access_assignments (workspace_id, entitlement_id, membership_id) WHERE ended_at IS NULL;
            CREATE INDEX commerce_feature_access_assignments_workspace_entitlement_active_idx
                ON commerce_feature_access_assignments (workspace_id, entitlement_id, ended_at);
            CREATE INDEX commerce_feature_access_assignments_membership_active_idx
                ON commerce_feature_access_assignments (membership_id, ended_at);

            CREATE TABLE commerce_subscription_revision_transitions (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                source_plan_revision_id UUID NOT NULL REFERENCES commerce_plan_revisions(id) ON DELETE RESTRICT,
                target_plan_revision_id UUID NOT NULL REFERENCES commerce_plan_revisions(id) ON DELETE RESTRICT,
                actor_user_id UUID,
                reason TEXT NOT NULL,
                preview_token_hash VARCHAR(128) NOT NULL UNIQUE,
                idempotency_key VARCHAR(128) NOT NULL UNIQUE,
                requested_at TIMESTAMPTZ NOT NULL,
                status VARCHAR(16) NOT NULL DEFAULT 'scheduled',
                correlation_id UUID NOT NULL UNIQUE,
                CONSTRAINT commerce_subscription_revision_transitions_status_check CHECK (status IN ('scheduled', 'applied', 'canceled', 'failed')),
                CONSTRAINT commerce_subscription_revision_transitions_distinct_check CHECK (source_plan_revision_id <> target_plan_revision_id)
            );

            CREATE TABLE commerce_subscription_revision_transition_items (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                transition_id UUID NOT NULL REFERENCES commerce_subscription_revision_transitions(id) ON DELETE CASCADE,
                subscription_id UUID NOT NULL REFERENCES commerce_workspace_subscriptions(id) ON DELETE RESTRICT,
                effective_at TIMESTAMPTZ NOT NULL,
                provider_schedule_id VARCHAR(255) UNIQUE,
                status VARCHAR(16) NOT NULL DEFAULT 'scheduled',
                result_code VARCHAR(96),
                CONSTRAINT commerce_subscription_revision_transition_items_unique UNIQUE (transition_id, subscription_id),
                CONSTRAINT commerce_subscription_revision_transition_items_status_check CHECK (status IN ('scheduled', 'applied', 'canceled', 'failed'))
            );
            CREATE UNIQUE INDEX commerce_subscription_revision_transition_items_one_pending
                ON commerce_subscription_revision_transition_items (subscription_id) WHERE status = 'scheduled';

            CREATE TABLE commerce_plan_access_convergences (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                source_plan_revision_id UUID NOT NULL REFERENCES commerce_plan_revisions(id) ON DELETE RESTRICT,
                target_plan_revision_id UUID NOT NULL REFERENCES commerce_plan_revisions(id) ON DELETE RESTRICT,
                preview_token_hash VARCHAR(128) NOT NULL UNIQUE,
                effective_at TIMESTAMPTZ NOT NULL,
                status VARCHAR(16) NOT NULL DEFAULT 'scheduled',
                revision BIGINT NOT NULL DEFAULT 1,
                CONSTRAINT commerce_plan_access_convergences_status_check CHECK (status IN ('scheduled', 'applied', 'canceled', 'failed'))
            );

            CREATE TABLE commerce_plan_access_convergence_feature_outcomes (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                convergence_id UUID NOT NULL REFERENCES commerce_plan_access_convergences(id) ON DELETE CASCADE,
                assignment_id UUID NOT NULL REFERENCES commerce_feature_access_assignments(id) ON DELETE RESTRICT,
                is_retained BOOLEAN NOT NULL,
                CONSTRAINT commerce_plan_access_convergence_feature_outcomes_unique UNIQUE (convergence_id, assignment_id)
            );

            CREATE TABLE commerce_provider_event_applications (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                provider VARCHAR(32) NOT NULL,
                provider_mode VARCHAR(8) NOT NULL,
                provider_account_id VARCHAR(255) NOT NULL,
                provider_event_id VARCHAR(255) NOT NULL,
                workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
                subscription_id UUID NOT NULL REFERENCES commerce_workspace_subscriptions(id) ON DELETE RESTRICT,
                plan_revision_id UUID NOT NULL REFERENCES commerce_plan_revisions(id) ON DELETE RESTRICT,
                provider_period_identity VARCHAR(255),
                applied_at TIMESTAMPTZ,
                result_code VARCHAR(96),
                CONSTRAINT commerce_provider_event_applications_unique UNIQUE (provider, provider_mode, provider_account_id, provider_event_id),
                CONSTRAINT commerce_provider_event_applications_mode_check CHECK (provider_mode IN ('test', 'live'))
            );
            CREATE INDEX commerce_provider_event_applications_workspace_created_idx ON commerce_provider_event_applications (workspace_id, created_at);
            CREATE INDEX commerce_provider_event_applications_period_created_idx ON commerce_provider_event_applications (provider_period_identity, created_at);

            CREATE TABLE commerce_dunning_policies (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                provider VARCHAR(32) NOT NULL,
                provider_mode VARCHAR(8) NOT NULL,
                revision BIGINT NOT NULL DEFAULT 1,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                policy JSONB NOT NULL,
                CONSTRAINT commerce_dunning_policies_unique UNIQUE (provider, provider_mode, revision),
                CONSTRAINT commerce_dunning_policies_mode_check CHECK (provider_mode IN ('test', 'live'))
            );
            CREATE UNIQUE INDEX commerce_dunning_policies_one_active
                ON commerce_dunning_policies (provider, provider_mode) WHERE is_active;

            CREATE TABLE commerce_workspace_commercial_access (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
                subscription_id UUID NOT NULL REFERENCES commerce_workspace_subscriptions(id) ON DELETE RESTRICT,
                state VARCHAR(24) NOT NULL DEFAULT 'normal',
                deadline_at TIMESTAMPTZ,
                state_revision BIGINT NOT NULL DEFAULT 1,
                source_identity VARCHAR(255) NOT NULL UNIQUE,
                CONSTRAINT commerce_workspace_commercial_access_state_check CHECK (state IN ('normal', 'payment_grace', 'payment_restricted')),
                CONSTRAINT commerce_workspace_commercial_access_deadline_check CHECK (
                    (state = 'payment_grace' AND deadline_at IS NOT NULL)
                    OR (state IN ('normal', 'payment_restricted') AND deadline_at IS NULL)
                )
            );
            CREATE INDEX commerce_workspace_commercial_access_state_deadline_idx ON commerce_workspace_commercial_access (state, deadline_at);

            CREATE TABLE commerce_commercial_access_transitions (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                access_id UUID NOT NULL REFERENCES commerce_workspace_commercial_access(id) ON DELETE CASCADE,
                from_state VARCHAR(24) NOT NULL,
                to_state VARCHAR(24) NOT NULL,
                deadline_at TIMESTAMPTZ,
                source_identity VARCHAR(255) NOT NULL UNIQUE,
                correlation_id UUID NOT NULL UNIQUE,
                CONSTRAINT commerce_commercial_access_transitions_from_check CHECK (from_state IN ('normal', 'payment_grace', 'payment_restricted')),
                CONSTRAINT commerce_commercial_access_transitions_to_check CHECK (to_state IN ('normal', 'payment_grace', 'payment_restricted'))
            );
            CREATE INDEX commerce_commercial_access_transitions_access_created_idx ON commerce_commercial_access_transitions (access_id, created_at);

            CREATE TABLE commerce_policy_exceptions (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                access_id UUID NOT NULL REFERENCES commerce_workspace_commercial_access(id) ON DELETE RESTRICT,
                expected_state_revision BIGINT NOT NULL,
                original_deadline_at TIMESTAMPTZ NOT NULL,
                replacement_deadline_at TIMESTAMPTZ NOT NULL,
                reason TEXT NOT NULL,
                evidence_reference VARCHAR(255) NOT NULL,
                actor_user_id UUID NOT NULL,
                idempotency_key VARCHAR(128) NOT NULL UNIQUE,
                correlation_id UUID NOT NULL UNIQUE,
                CONSTRAINT commerce_policy_exceptions_deadline_check CHECK (replacement_deadline_at > original_deadline_at)
            );

            CREATE TABLE commerce_state_corrections (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                access_id UUID NOT NULL REFERENCES commerce_workspace_commercial_access(id) ON DELETE RESTRICT,
                expected_state_revision BIGINT NOT NULL,
                from_state VARCHAR(24) NOT NULL,
                to_state VARCHAR(24) NOT NULL,
                replacement_deadline_at TIMESTAMPTZ,
                reason TEXT NOT NULL,
                evidence_reference VARCHAR(255) NOT NULL,
                actor_user_id UUID NOT NULL,
                idempotency_key VARCHAR(128) NOT NULL UNIQUE,
                correlation_id UUID NOT NULL UNIQUE,
                CONSTRAINT commerce_state_corrections_from_check CHECK (from_state IN ('normal', 'payment_grace', 'payment_restricted')),
                CONSTRAINT commerce_state_corrections_to_check CHECK (to_state IN ('normal', 'payment_grace', 'payment_restricted'))
            );

            CREATE TABLE commerce_legacy_data_retirements (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                retired_table VARCHAR(96) NOT NULL,
                legacy_id UUID NOT NULL,
                evidence_kind VARCHAR(64) NOT NULL,
                payload JSONB NOT NULL,
                evidence_hash VARCHAR(64) NOT NULL UNIQUE,
                CONSTRAINT commerce_legacy_data_retirements_identity_unique
                    UNIQUE (retired_table, legacy_id, evidence_kind)
            );
            CREATE FUNCTION commerce_reject_legacy_retirement_mutation()
            RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                RAISE EXCEPTION 'commerce legacy retirement evidence is immutable';
                RETURN NULL;
            END;
            $$;
            CREATE TRIGGER commerce_legacy_data_retirements_immutable
                BEFORE UPDATE OR DELETE ON commerce_legacy_data_retirements
                FOR EACH ROW EXECUTE FUNCTION commerce_reject_legacy_retirement_mutation();

            INSERT INTO commerce_resource_definitions (id, created_at, updated_at, key, is_active)
            VALUES (md5('arclayer:commerce-resource:projects.active')::uuid, NOW(), NOW(), 'projects.active', TRUE);
            INSERT INTO commerce_entitlement_definitions (
                id, created_at, updated_at, key, supports_workspace_allocation,
                supports_member_seat_allocation, is_active
            ) VALUES
                (md5('arclayer:commerce-entitlement:sites.generate')::uuid, NOW(), NOW(), 'sites.generate', TRUE, FALSE, TRUE),
                (md5('arclayer:commerce-entitlement:workspace.roles.manage')::uuid, NOW(), NOW(), 'workspace.roles.manage', TRUE, FALSE, TRUE);

            INSERT INTO commerce_plans (id, created_at, updated_at, code, is_active, sort_order)
            SELECT id, created_at, updated_at, code, is_active, sort_order
            FROM commerce_plans_legacy_0079;

            INSERT INTO commerce_plan_revisions (
                id, created_at, updated_at, plan_id, sequence, status, name_i18n_key,
                description_i18n_key, credit_grant_amount, credit_refresh_interval,
                credit_value_micros, currency, content_hash, published_at, is_selling
            )
            SELECT
                md5('arclayer:commerce-plan-revision:' || legacy.id::text || ':1')::uuid,
                legacy.created_at, legacy.updated_at, legacy.id, 1, 'published',
                COALESCE(NULLIF(BTRIM(legacy.name_i18n_key), ''), CASE legacy.code
                    WHEN 'free' THEN 'PLAN_DEFAULT_FREE_NAME' WHEN 'premium' THEN 'PLAN_DEFAULT_PREMIUM_NAME' END),
                COALESCE(NULLIF(BTRIM(legacy.description_i18n_key), ''), CASE legacy.code
                    WHEN 'free' THEN 'PLAN_DEFAULT_FREE_DESCRIPTION' WHEN 'premium' THEN 'PLAN_DEFAULT_PREMIUM_DESCRIPTION' END),
                legacy.credit_grant_amount, legacy.credit_refresh_interval, legacy.credit_value_micros,
                legacy.currency,
                md5(concat_ws('|', legacy.id::text, legacy.code, legacy.name_i18n_key,
                    legacy.description_i18n_key, legacy.credit_grant_amount::text,
                    legacy.credit_refresh_interval, legacy.credit_value_micros::text,
                    legacy.currency, legacy.features::text))
                    || md5('arclayer:commerce-plan-revision:' || legacy.id::text || ':1:content'),
                legacy.updated_at, legacy.is_active
            FROM commerce_plans_legacy_0079 AS legacy;

            INSERT INTO commerce_plan_revision_resource_allowances (
                id, created_at, updated_at, plan_revision_id, resource_id, limit_kind, limit_value
            )
            SELECT
                md5('arclayer:commerce-allowance:' || revision.id::text || ':projects.active')::uuid,
                revision.created_at, revision.updated_at, revision.id, resource.id, 'unlimited', NULL
            FROM commerce_plan_revisions AS revision
            CROSS JOIN commerce_resource_definitions AS resource
            WHERE resource.key = 'projects.active';

            INSERT INTO commerce_plan_revision_entitlements (
                id, created_at, updated_at, plan_revision_id, entitlement_id, is_included,
                allocation_mode, seat_limit_kind, seat_limit_value
            )
            SELECT
                md5('arclayer:commerce-entitlement:' || revision.id::text || ':' || entitlement.id::text)::uuid,
                revision.created_at, revision.updated_at, revision.id, entitlement.id,
                legacy.features ? entitlement.key,
                CASE WHEN legacy.features ? entitlement.key THEN 'workspace' ELSE NULL END,
                NULL, NULL
            FROM commerce_plans_legacy_0079 AS legacy
            JOIN commerce_plan_revisions AS revision ON revision.plan_id = legacy.id
            CROSS JOIN commerce_entitlement_definitions AS entitlement;

            INSERT INTO commerce_workspace_subscriptions (
                id, created_at, updated_at, workspace_id, plan_revision_id, status,
                billing_cycle, current_period_start, current_period_end,
                cancel_at_period_end, billing_provider, provider_mode,
                external_customer_id, external_subscription_id, revision
            )
            SELECT
                legacy.id, legacy.created_at, legacy.updated_at, legacy.workspace_id,
                revision.id, legacy.status, legacy.billing_cycle,
                legacy.current_period_start,
                CASE WHEN legacy_plan.code = 'free' THEN 'infinity'::TIMESTAMPTZ ELSE legacy.current_period_end END,
                legacy.cancel_at_period_end, legacy.billing_provider, NULL,
                legacy.external_customer_id, legacy.external_subscription_id, 1
            FROM commerce_workspace_subscriptions_legacy_0079 AS legacy
            JOIN commerce_plan_revisions AS revision
                ON revision.plan_id = legacy.plan_id AND revision.sequence = 1
            JOIN commerce_plans_legacy_0079 AS legacy_plan ON legacy_plan.id = legacy.plan_id;

            INSERT INTO commerce_workspace_credit_accounts (
                id, created_at, updated_at, workspace_id, subscription_id, plan_revision_id,
                balance_credits, reserved_credits, period_start, period_end, period_identity, revision
            )
            SELECT
                legacy.id, legacy.created_at, legacy.updated_at, legacy.workspace_id,
                legacy.subscription_id, subscription.plan_revision_id,
                legacy.balance_credits, legacy.reserved_credits,
                legacy.period_start, legacy.period_end,
                'legacy:0079:credit-account:' || legacy.id::text, 1
            FROM commerce_workspace_credit_accounts_legacy_0079 AS legacy
            JOIN commerce_workspace_subscriptions AS subscription ON subscription.id = legacy.subscription_id;

            INSERT INTO commerce_workspace_credit_ledger (
                id, created_at, updated_at, workspace_id, account_id, subscription_id,
                plan_revision_id, entry_type, request_id, provider_period_identity,
                estimated_cost_micros, actual_cost_micros, applied_credit_value_micros,
                reserved_credits, committed_credits, delta_balance_credits,
                delta_reserved_credits, balance_after_credits, reserved_after_credits,
                idempotency_key, actor_user_id, description_key
            )
            SELECT
                legacy.id, legacy.created_at, legacy.updated_at, legacy.workspace_id,
                legacy.account_id, account.subscription_id, account.plan_revision_id,
                legacy.entry_type, legacy.reference_id, NULL, NULL, NULL,
                revision.credit_value_micros,
                CASE WHEN legacy.entry_type = 'reservation' THEN GREATEST(legacy.delta_reserved_credits, 0) ELSE 0 END,
                CASE WHEN legacy.entry_type = 'commit' THEN GREATEST(-legacy.delta_balance_credits, 0) ELSE 0 END,
                legacy.delta_balance_credits, legacy.delta_reserved_credits,
                legacy.balance_after_credits, legacy.reserved_after_credits,
                legacy.idempotency_key, legacy.actor_user_id, legacy.description_key
            FROM commerce_workspace_credit_ledger_legacy_0079 AS legacy
            JOIN commerce_workspace_credit_accounts AS account ON account.id = legacy.account_id
            JOIN commerce_plan_revisions AS revision ON revision.id = account.plan_revision_id;

            INSERT INTO commerce_legacy_data_retirements (
                id, created_at, retired_table, legacy_id, evidence_kind, payload, evidence_hash
            )
            SELECT
                md5('arclayer:commerce-retirement:raw-plan:' || legacy.id::text)::uuid,
                NOW(), 'commerce_plans', legacy.id, 'raw_plan', to_jsonb(legacy),
                md5('commerce_plans:raw_plan:' || legacy.id::text)
                    || md5('commerce_plans:raw_plan:' || legacy.id::text || ':0079')
            FROM commerce_plans_legacy_0079 AS legacy;

            INSERT INTO commerce_legacy_data_retirements (
                id, created_at, retired_table, legacy_id, evidence_kind, payload, evidence_hash
            )
            SELECT
                md5('arclayer:commerce-retirement:credit-account-counters:' || legacy.id::text)::uuid,
                NOW(), 'commerce_workspace_credit_accounts', legacy.id,
                'legacy_credit_account_counters',
                jsonb_build_object(
                    'lifetime_granted_credits', legacy.lifetime_granted_credits,
                    'lifetime_spent_credits', legacy.lifetime_spent_credits,
                    'period_granted_credits', legacy.period_granted_credits,
                    'period_spent_credits', legacy.period_spent_credits
                ),
                md5('commerce_workspace_credit_accounts:legacy_credit_account_counters:' || legacy.id::text)
                    || md5('commerce_workspace_credit_accounts:legacy_credit_account_counters:' || legacy.id::text || ':0079')
            FROM commerce_workspace_credit_accounts_legacy_0079 AS legacy;

            INSERT INTO commerce_legacy_data_retirements (
                id, created_at, retired_table, legacy_id, evidence_kind, payload, evidence_hash
            )
            SELECT
                md5('arclayer:commerce-retirement:ledger-details:' || legacy.id::text)::uuid,
                NOW(), 'commerce_workspace_credit_ledger', legacy.id, 'legacy_ledger_details',
                jsonb_build_object('reference_type', legacy.reference_type, 'reference_id', legacy.reference_id,
                    'details', legacy.details),
                md5('commerce_workspace_credit_ledger:legacy_ledger_details:' || legacy.id::text)
                    || md5('commerce_workspace_credit_ledger:legacy_ledger_details:' || legacy.id::text || ':0079')
            FROM commerce_workspace_credit_ledger_legacy_0079 AS legacy;

            INSERT INTO commerce_legacy_data_retirements (
                id, created_at, retired_table, legacy_id, evidence_kind, payload, evidence_hash
            )
            SELECT
                md5('arclayer:commerce-retirement:change-request:' || legacy.id::text)::uuid,
                NOW(), 'commerce_subscription_change_requests', legacy.id,
                'terminal_change_request', to_jsonb(legacy),
                md5('commerce_subscription_change_requests:terminal_change_request:' || legacy.id::text)
                    || md5('commerce_subscription_change_requests:terminal_change_request:' || legacy.id::text || ':0079')
            FROM commerce_subscription_change_requests_legacy_0079 AS legacy;

            INSERT INTO commerce_legacy_data_retirements (
                id, created_at, retired_table, legacy_id, evidence_kind, payload, evidence_hash
            )
            SELECT
                md5('arclayer:commerce-retirement:provider-receipt:' || legacy.id::text)::uuid,
                NOW(), 'commerce_billing_provider_event_receipts', legacy.id,
                'provider_event_receipt', to_jsonb(legacy),
                md5('commerce_billing_provider_event_receipts:provider_event_receipt:' || legacy.id::text)
                    || md5('commerce_billing_provider_event_receipts:provider_event_receipt:' || legacy.id::text || ':0079')
            FROM commerce_billing_provider_event_receipts_legacy_0079 AS legacy;

            INSERT INTO commerce_plans (id, created_at, updated_at, code, is_active, sort_order)
            SELECT md5('arclayer:commerce-plan:free')::uuid, NOW(), NOW(), 'free', TRUE, 10
            WHERE NOT EXISTS (SELECT 1 FROM commerce_plans WHERE code = 'free');
            INSERT INTO commerce_plans (id, created_at, updated_at, code, is_active, sort_order)
            SELECT md5('arclayer:commerce-plan:premium')::uuid, NOW(), NOW(), 'premium', TRUE, 20
            WHERE NOT EXISTS (SELECT 1 FROM commerce_plans WHERE code = 'premium');

            INSERT INTO commerce_plan_revisions (
                id, created_at, updated_at, plan_id, sequence, status, name_i18n_key,
                description_i18n_key, credit_grant_amount, credit_refresh_interval,
                credit_value_micros, currency, content_hash, published_at, is_selling
            )
            SELECT
                md5('arclayer:commerce-plan-revision:' || plan.code || ':1')::uuid,
                NOW(), NOW(), plan.id, 1, 'published',
                CASE plan.code WHEN 'free' THEN 'PLAN_DEFAULT_FREE_NAME' ELSE 'PLAN_DEFAULT_PREMIUM_NAME' END,
                CASE plan.code WHEN 'free' THEN 'PLAN_DEFAULT_FREE_DESCRIPTION' ELSE 'PLAN_DEFAULT_PREMIUM_DESCRIPTION' END,
                CASE plan.code WHEN 'free' THEN 70 ELSE 10000 END,
                CASE plan.code WHEN 'free' THEN 'daily' ELSE 'monthly' END,
                1000, 'USD',
                md5('arclayer:commerce-plan-revision:' || plan.code || ':1')
                    || md5('arclayer:commerce-plan-revision:' || plan.code || ':1:content'),
                NOW(), TRUE
            FROM commerce_plans AS plan
            WHERE plan.code IN ('free', 'premium')
              AND NOT EXISTS (
                  SELECT 1 FROM commerce_plan_revisions AS revision WHERE revision.plan_id = plan.id
              );

            INSERT INTO commerce_plan_revision_resource_allowances (
                id, created_at, updated_at, plan_revision_id, resource_id, limit_kind, limit_value
            )
            SELECT
                md5('arclayer:commerce-allowance:' || revision.id::text || ':projects.active')::uuid,
                NOW(), NOW(), revision.id, resource.id, 'unlimited', NULL
            FROM commerce_plan_revisions AS revision
            CROSS JOIN commerce_resource_definitions AS resource
            LEFT JOIN commerce_plan_revision_resource_allowances AS allowance
                ON allowance.plan_revision_id = revision.id AND allowance.resource_id = resource.id
            WHERE resource.key = 'projects.active' AND allowance.id IS NULL;

            INSERT INTO commerce_plan_revision_entitlements (
                id, created_at, updated_at, plan_revision_id, entitlement_id, is_included,
                allocation_mode, seat_limit_kind, seat_limit_value
            )
            SELECT
                md5('arclayer:commerce-entitlement:' || revision.id::text || ':' || entitlement.id::text)::uuid,
                NOW(), NOW(), revision.id, entitlement.id,
                CASE
                    WHEN plan.code = 'free' AND entitlement.key = 'sites.generate' THEN TRUE
                    WHEN plan.code = 'premium' THEN TRUE
                    ELSE FALSE
                END,
                CASE
                    WHEN plan.code = 'free' AND entitlement.key = 'sites.generate' THEN 'workspace'
                    WHEN plan.code = 'premium' THEN 'workspace'
                    ELSE NULL
                END,
                NULL, NULL
            FROM commerce_plan_revisions AS revision
            JOIN commerce_plans AS plan ON plan.id = revision.plan_id
            CROSS JOIN commerce_entitlement_definitions AS entitlement
            LEFT JOIN commerce_plan_revision_entitlements AS existing
                ON existing.plan_revision_id = revision.id AND existing.entitlement_id = entitlement.id
            WHERE plan.code IN ('free', 'premium') AND existing.id IS NULL;

            DROP TABLE commerce_workspace_credit_ledger_legacy_0079;
            DROP TABLE commerce_workspace_credit_accounts_legacy_0079;
            DROP TABLE commerce_subscription_change_requests_legacy_0079;
            DROP TABLE commerce_billing_provider_event_receipts_legacy_0079;
            DROP TABLE commerce_workspace_subscriptions_legacy_0079;
            DROP TABLE commerce_plans_legacy_0079;
            """
        )
    ]
