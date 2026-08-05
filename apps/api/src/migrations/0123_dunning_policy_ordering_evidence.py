from tortoise import fields, migrations
from tortoise.fields.base import OnDelete
from tortoise.migrations import operations as ops
from tortoise.migrations.constraints import UniqueConstraint


class Migration(migrations.Migration):
    dependencies = [("models", "0122_checkout_activation_evidence")]

    initial = False

    operations = [
        ops.AddField(
            model_name="WorkspaceCommercialAccess",
            name="provider_period_identity",
            field=fields.CharField(max_length=255, null=True),
        ),
        ops.AddField(
            model_name="WorkspaceCommercialAccess",
            name="provider_period_start",
            field=fields.DatetimeField(null=True),
        ),
        ops.AddField(
            model_name="WorkspaceCommercialAccess",
            name="provider_period_end",
            field=fields.DatetimeField(null=True),
        ),
        ops.AddField(
            model_name="WorkspaceCommercialAccess",
            name="source_occurred_at",
            field=fields.DatetimeField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name="WorkspaceCommercialAccess",
            name="dunning_policy",
            field=fields.ForeignKeyField(
                "models.CommerceDunningPolicy",
                source_field="dunning_policy_id",
                null=True,
                db_constraint=True,
                to_field="id",
                related_name="current_access_projections",
                on_delete=OnDelete.RESTRICT,
            ),
        ),
        ops.AddField(
            model_name="CommercialAccessTransition",
            name="provider",
            field=fields.CharField(max_length=32, null=True),
        ),
        ops.AddField(
            model_name="CommercialAccessTransition",
            name="provider_mode",
            field=fields.CharField(max_length=16, null=True),
        ),
        ops.AddField(
            model_name="CommercialAccessTransition",
            name="provider_account_id",
            field=fields.CharField(max_length=255, null=True),
        ),
        ops.AddField(
            model_name="CommercialAccessTransition",
            name="provider_event_id",
            field=fields.CharField(max_length=255, null=True),
        ),
        ops.AddField(
            model_name="CommercialAccessTransition",
            name="subscription_revision_identity",
            field=fields.UUIDField(null=True),
        ),
        ops.AddField(
            model_name="CommercialAccessTransition",
            name="provider_period_identity",
            field=fields.CharField(max_length=255, null=True),
        ),
        ops.AddField(
            model_name="CommercialAccessTransition",
            name="provider_period_start",
            field=fields.DatetimeField(null=True),
        ),
        ops.AddField(
            model_name="CommercialAccessTransition",
            name="provider_period_end",
            field=fields.DatetimeField(null=True),
        ),
        ops.AddField(
            model_name="CommercialAccessTransition",
            name="source_occurred_at",
            field=fields.DatetimeField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name="CommercialAccessTransition",
            name="resulting_state_revision",
            field=fields.BigIntField(null=True),
        ),
        ops.AddField(
            model_name="CommercialAccessTransition",
            name="dunning_policy_revision",
            field=fields.BigIntField(null=True),
        ),
        ops.AddField(
            model_name="CommercialAccessTransition",
            name="dunning_policy",
            field=fields.ForeignKeyField(
                "models.CommerceDunningPolicy",
                source_field="dunning_policy_id",
                null=True,
                db_constraint=True,
                to_field="id",
                related_name="access_transitions",
                on_delete=OnDelete.RESTRICT,
            ),
        ),
        ops.RunSQL(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM commerce_commercial_access_transitions AS transition
                    WHERE transition.source_identity NOT LIKE 'provider:%'
                ) THEN
                    RAISE EXCEPTION
                        'cannot backfill non-Provider commercial access transition evidence';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM commerce_commercial_access_transitions AS transition
                    JOIN commerce_workspace_commercial_access AS access
                      ON access.id = transition.access_id
                    LEFT JOIN LATERAL (
                        SELECT COUNT(*) AS match_count
                        FROM commerce_provider_event_applications AS application
                        WHERE transition.source_identity =
                            'provider:' || application.provider || ':' || application.provider_event_id
                          AND application.workspace_id = access.workspace_id
                          AND application.subscription_id = access.subscription_id
                    ) AS matches ON TRUE
                    WHERE matches.match_count <> 1
                ) THEN
                    RAISE EXCEPTION
                        'cannot resolve exact Provider application for commercial access transition';
                END IF;
            END $$;

            WITH ranked_transition AS (
                SELECT
                    transition.id,
                    application.provider,
                    application.provider_mode,
                    application.provider_account_id,
                    application.provider_event_id,
                    application.plan_revision_id,
                    application.provider_period_identity,
                    subscription.current_period_start,
                    subscription.current_period_end,
                    access.state_revision
                        - COUNT(*) OVER (PARTITION BY transition.access_id)
                        + ROW_NUMBER() OVER (
                            PARTITION BY transition.access_id
                            ORDER BY transition.created_at, transition.id
                        ) AS resulting_state_revision
                FROM commerce_commercial_access_transitions AS transition
                JOIN commerce_workspace_commercial_access AS access
                  ON access.id = transition.access_id
                JOIN commerce_workspace_subscriptions AS subscription
                  ON subscription.id = access.subscription_id
                JOIN commerce_provider_event_applications AS application
                  ON transition.source_identity =
                    'provider:' || application.provider || ':' || application.provider_event_id
                 AND application.workspace_id = access.workspace_id
                 AND application.subscription_id = access.subscription_id
            )
            UPDATE commerce_commercial_access_transitions AS transition
            SET
                provider = ranked.provider,
                provider_mode = ranked.provider_mode,
                provider_account_id = ranked.provider_account_id,
                provider_event_id = ranked.provider_event_id,
                subscription_revision_identity = ranked.plan_revision_id,
                provider_period_identity = ranked.provider_period_identity,
                provider_period_start = ranked.current_period_start,
                provider_period_end = ranked.current_period_end,
                resulting_state_revision = ranked.resulting_state_revision
            FROM ranked_transition AS ranked
            WHERE transition.id = ranked.id;

            UPDATE commerce_workspace_commercial_access AS access
            SET
                provider_period_identity = transition.provider_period_identity,
                provider_period_start = transition.provider_period_start,
                provider_period_end = transition.provider_period_end
            FROM commerce_commercial_access_transitions AS transition
            WHERE transition.access_id = access.id
              AND transition.resulting_state_revision = access.state_revision;

            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM commerce_commercial_access_transitions
                    WHERE provider IS NULL
                       OR provider_mode IS NULL
                       OR provider_account_id IS NULL
                       OR provider_event_id IS NULL
                       OR subscription_revision_identity IS NULL
                       OR provider_period_identity IS NULL
                       OR provider_period_start IS NULL
                       OR provider_period_end IS NULL
                       OR resulting_state_revision IS NULL
                ) THEN
                    RAISE EXCEPTION
                        'commercial access transition evidence backfill is incomplete';
                END IF;
            END $$;
            """,
            reverse_sql=ops.RunSQL.noop,
        ),
        ops.AlterField(
            model_name="CommercialAccessTransition",
            name="provider",
            field=fields.CharField(max_length=32),
        ),
        ops.AlterField(
            model_name="CommercialAccessTransition",
            name="provider_mode",
            field=fields.CharField(max_length=16),
        ),
        ops.AlterField(
            model_name="CommercialAccessTransition",
            name="provider_account_id",
            field=fields.CharField(max_length=255),
        ),
        ops.AlterField(
            model_name="CommercialAccessTransition",
            name="provider_event_id",
            field=fields.CharField(max_length=255),
        ),
        ops.AlterField(
            model_name="CommercialAccessTransition",
            name="subscription_revision_identity",
            field=fields.UUIDField(),
        ),
        ops.AlterField(
            model_name="CommercialAccessTransition",
            name="provider_period_identity",
            field=fields.CharField(max_length=255),
        ),
        ops.AlterField(
            model_name="CommercialAccessTransition",
            name="provider_period_start",
            field=fields.DatetimeField(),
        ),
        ops.AlterField(
            model_name="CommercialAccessTransition",
            name="provider_period_end",
            field=fields.DatetimeField(),
        ),
        ops.AlterField(
            model_name="CommercialAccessTransition",
            name="resulting_state_revision",
            field=fields.BigIntField(),
        ),
        ops.AddConstraint(
            model_name="CommercialAccessTransition",
            constraint=UniqueConstraint(
                fields=("provider", "provider_mode", "provider_account_id", "provider_event_id"),
                name=None,
            ),
        ),
        ops.RunSQL(
            """
            CREATE FUNCTION commerce_reject_commercial_access_transition_update()
            RETURNS TRIGGER AS $$
            BEGIN
                RAISE EXCEPTION 'commercial access transition evidence is immutable';
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER commerce_commercial_access_transitions_immutable
            BEFORE UPDATE ON commerce_commercial_access_transitions
            FOR EACH ROW EXECUTE FUNCTION commerce_reject_commercial_access_transition_update();
            """,
            reverse_sql="""
            DROP TRIGGER IF EXISTS commerce_commercial_access_transitions_immutable
                ON commerce_commercial_access_transitions;
            DROP FUNCTION IF EXISTS commerce_reject_commercial_access_transition_update();
            """,
        ),
    ]
