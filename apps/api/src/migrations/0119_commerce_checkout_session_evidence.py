from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0118_ai_thread_pinning")]
    initial = False
    operations = [
        ops.RunSQL(
            """
            ALTER TABLE commerce_checkout_sessions
                ADD COLUMN plan_code VARCHAR(48) NULL,
                ADD COLUMN provider_account_id VARCHAR(255) NOT NULL DEFAULT 'platform',
                ADD COLUMN external_price_id VARCHAR(255) NULL,
                ADD COLUMN request_fingerprint VARCHAR(64) NULL,
                ADD COLUMN revision BIGINT NOT NULL DEFAULT 1;

            UPDATE commerce_checkout_sessions AS checkout
            SET plan_code = plan.code
            FROM commerce_plan_revisions AS revision
            JOIN commerce_plans AS plan ON plan.id = revision.plan_id
            WHERE checkout.target_plan_revision_id = revision.id;

            UPDATE commerce_checkout_sessions AS checkout
            SET external_price_id = price.external_price_id
            FROM commerce_plan_revision_prices AS price
            WHERE checkout.kind = 'subscription'
              AND checkout.target_plan_revision_id = price.plan_revision_id
              AND checkout.provider = price.provider
              AND checkout.provider_mode = price.provider_mode
              AND checkout.billing_cycle = price.billing_cycle
              AND checkout.currency = price.currency;

            UPDATE commerce_checkout_sessions AS checkout
            SET external_price_id = price.external_price_id
            FROM commerce_credit_top_up_offer_prices AS price
            WHERE checkout.kind = 'top_up'
              AND checkout.top_up_offer_id = price.offer_id
              AND checkout.provider = price.provider
              AND checkout.provider_mode = price.provider_mode
              AND checkout.currency = price.currency;

            UPDATE commerce_checkout_sessions
            SET request_fingerprint =
                md5('commerce-checkout:' || idempotency_key)
                || md5('commerce-checkout:evidence:' || idempotency_key);

            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM commerce_checkout_sessions
                    WHERE external_price_id IS NULL OR request_fingerprint IS NULL
                ) THEN
                    RAISE EXCEPTION 'unable to backfill canonical checkout Price or request evidence';
                END IF;
            END $$;

            ALTER TABLE commerce_checkout_sessions
                ALTER COLUMN provider_account_id DROP DEFAULT,
                ALTER COLUMN external_price_id SET NOT NULL,
                ALTER COLUMN request_fingerprint SET NOT NULL,
                DROP CONSTRAINT commerce_checkout_session_target_check,
                ADD CONSTRAINT commerce_checkout_session_target_check CHECK (
                    (
                        kind = 'subscription'
                        AND target_plan_revision_id IS NOT NULL
                        AND top_up_offer_id IS NULL
                        AND plan_code IS NOT NULL
                    )
                    OR (
                        kind = 'top_up'
                        AND target_plan_revision_id IS NULL
                        AND top_up_offer_id IS NOT NULL
                        AND plan_code IS NULL
                        AND credit_amount IS NOT NULL
                    )
                ),
                ADD CONSTRAINT commerce_checkout_session_fingerprint_check
                    CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
                ADD CONSTRAINT commerce_checkout_session_revision_check CHECK (revision >= 1);

            DROP INDEX commerce_checkout_session_provider_status_idx;
            CREATE INDEX commerce_checkout_session_provider_status_idx
                ON commerce_checkout_sessions (provider, provider_mode, provider_account_id, status);
            CREATE INDEX commerce_checkout_session_price_idx
                ON commerce_checkout_sessions (provider, provider_mode, external_price_id);
            """
        )
    ]
