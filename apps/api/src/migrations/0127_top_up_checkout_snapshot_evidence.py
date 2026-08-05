from tortoise import fields, migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0126_commerce_provider_payment_projections")]

    initial = False

    operations = [
        ops.AddField(
            model_name="CommerceCheckoutSession",
            name="top_up_offer_revision",
            field=fields.BigIntField(null=True),
        ),
        ops.RunSQL(
            """
            UPDATE commerce_checkout_sessions AS checkout
            SET top_up_offer_revision = offer.revision
            FROM commerce_credit_top_up_offers AS offer
            WHERE checkout.kind = 'top_up'
              AND checkout.top_up_offer_id = offer.id;

            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM commerce_checkout_sessions
                    WHERE kind = 'top_up'
                      AND top_up_offer_revision IS NULL
                ) THEN
                    RAISE EXCEPTION 'unable to backfill immutable top-up Checkout offer revision';
                END IF;
            END $$;

            ALTER TABLE commerce_checkout_sessions
                DROP CONSTRAINT commerce_checkout_session_target_check,
                ADD CONSTRAINT commerce_checkout_session_target_check CHECK (
                    (
                        kind = 'subscription'
                        AND subscription_id IS NOT NULL
                        AND target_plan_revision_id IS NOT NULL
                        AND top_up_offer_id IS NULL
                        AND top_up_offer_revision IS NULL
                        AND plan_code IS NOT NULL
                        AND billing_cycle IS NOT NULL
                        AND credit_amount IS NULL
                    )
                    OR (
                        kind = 'top_up'
                        AND subscription_id IS NULL
                        AND target_plan_revision_id IS NULL
                        AND top_up_offer_id IS NOT NULL
                        AND top_up_offer_revision IS NOT NULL
                        AND plan_code IS NULL
                        AND billing_cycle IS NULL
                        AND credit_amount IS NOT NULL
                    )
                ),
                ADD CONSTRAINT commerce_checkout_session_top_up_offer_revision_check
                    CHECK (top_up_offer_revision IS NULL OR top_up_offer_revision >= 1);
            """
        ),
    ]
