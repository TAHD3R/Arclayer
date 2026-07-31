from tortoise import fields, migrations
from tortoise.fields.base import OnDelete
from tortoise.indexes import Index
from tortoise.migrations import operations as ops

from src.common.utils.ids import uuid7


class Migration(migrations.Migration):
    dependencies = [("models", "0076_auto_20260729_1107")]

    initial = False

    operations = [
        ops.RunSQL(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM workspaces AS workspace
                    LEFT JOIN users AS creator ON creator.id = workspace.created_by_user_id
                    LEFT JOIN workspace_memberships AS membership
                      ON membership.workspace_id = workspace.id
                     AND membership.user_id = workspace.created_by_user_id
                     AND membership.status = 'active'
                    WHERE workspace.owner_user_id IS NULL
                      AND (creator.id IS NULL OR membership.id IS NULL)
                ) THEN
                    RAISE EXCEPTION
                        'Workspace owner migration blocked: a Workspace without owner_user_id has no active creator membership';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM workspaces AS workspace
                    JOIN system_roles AS role
                      ON role.workspace_id = workspace.id
                     AND role.code = 'owner'
                    JOIN workspace_membership_roles AS binding ON binding.role_id = role.id
                    JOIN workspace_memberships AS membership
                      ON membership.id = binding.membership_id
                     AND membership.status = 'active'
                    WHERE workspace.owner_user_id IS NULL
                      AND membership.user_id <> workspace.created_by_user_id
                ) THEN
                    RAISE EXCEPTION
                        'Workspace owner migration blocked: assignable Owner role conflicts with the Workspace creator';
                END IF;

                UPDATE workspaces
                SET owner_user_id = created_by_user_id,
                    updated_at = NOW()
                WHERE owner_user_id IS NULL;

                IF EXISTS (
                    SELECT 1
                    FROM workspaces AS workspace
                    LEFT JOIN users AS owner_user ON owner_user.id = workspace.owner_user_id
                    WHERE workspace.owner_user_id IS NULL OR owner_user.id IS NULL
                ) THEN
                    RAISE EXCEPTION
                        'Workspace owner migration blocked: canonical owner is missing';
                END IF;

                INSERT INTO workspace_memberships (
                    id,
                    created_at,
                    updated_at,
                    workspace_id,
                    user_id,
                    status,
                    invited_by_user_id
                )
                SELECT
                    md5('arclayer:workspace-owner-membership:' || workspace.id::text)::uuid,
                    NOW(),
                    NOW(),
                    workspace.id,
                    workspace.owner_user_id,
                    'active',
                    NULL
                FROM workspaces AS workspace
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM workspace_memberships AS membership
                    WHERE membership.workspace_id = workspace.id
                      AND membership.user_id = workspace.owner_user_id
                );

                UPDATE workspace_memberships AS membership
                SET status = 'active',
                    updated_at = NOW()
                FROM workspaces AS workspace
                WHERE membership.workspace_id = workspace.id
                  AND membership.user_id = workspace.owner_user_id
                  AND membership.status <> 'active';

                IF EXISTS (
                    SELECT 1
                    FROM system_roles
                    WHERE code = 'owner' AND is_system = FALSE
                ) THEN
                    RAISE EXCEPTION
                        'Workspace owner migration blocked: custom role uses reserved legacy owner code';
                END IF;

                DELETE FROM system_roles
                WHERE code = 'owner';

                IF EXISTS (
                    SELECT 1
                    FROM workspaces AS workspace
                    LEFT JOIN commerce_workspace_subscriptions AS subscription
                      ON subscription.workspace_id = workspace.id
                    WHERE subscription.id IS NULL
                ) AND NOT EXISTS (
                    SELECT 1
                    FROM commerce_plans
                    WHERE code = 'free'
                      AND tier = 'free'
                      AND is_active = TRUE
                ) THEN
                    RAISE EXCEPTION
                        'Workspace owner migration blocked: missing Workspace subscriptions require one active free Plan';
                END IF;

                INSERT INTO commerce_workspace_subscriptions (
                    id,
                    created_at,
                    updated_at,
                    workspace_id,
                    plan_id,
                    status,
                    billing_cycle,
                    current_period_start,
                    current_period_end,
                    cancel_at_period_end,
                    billing_provider,
                    external_customer_id,
                    external_subscription_id
                )
                SELECT
                    md5('arclayer:workspace-free-subscription:' || workspace.id::text)::uuid,
                    NOW(),
                    NOW(),
                    workspace.id,
                    plan.id,
                    'active',
                    'monthly',
                    NOW(),
                    NOW() + INTERVAL '1 month',
                    FALSE,
                    'manual',
                    NULL,
                    NULL
                FROM workspaces AS workspace
                JOIN commerce_plans AS plan
                  ON plan.code = 'free'
                 AND plan.tier = 'free'
                 AND plan.is_active = TRUE
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM commerce_workspace_subscriptions AS subscription
                    WHERE subscription.workspace_id = workspace.id
                );

                IF EXISTS (
                    SELECT workspace.owner_user_id
                    FROM workspaces AS workspace
                    JOIN commerce_workspace_subscriptions AS subscription
                      ON subscription.workspace_id = workspace.id
                    JOIN commerce_plans AS plan ON plan.id = subscription.plan_id
                    WHERE workspace.deleted_at IS NULL
                      AND plan.tier = 'free'
                    GROUP BY workspace.owner_user_id
                    HAVING COUNT(*) > 1
                ) THEN
                    RAISE EXCEPTION
                        'Workspace owner migration blocked: a User owns more than one Free Workspace';
                END IF;
            END $$;
            """
        ),
        ops.AlterField(
            model_name="Workspace",
            name="owner_user_id",
            field=fields.UUIDField(db_index=True),
        ),
        ops.CreateModel(
            name="WorkspaceOwnershipTransfer",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                (
                    "workspace",
                    fields.ForeignKeyField(
                        "models.Workspace",
                        source_field="workspace_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="ownership_transfers",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                ("previous_owner_user_id", fields.UUIDField(db_index=True)),
                ("next_owner_user_id", fields.UUIDField(db_index=True)),
                ("initiated_by_user_id", fields.UUIDField(db_index=True)),
                ("idempotency_key", fields.CharField(max_length=128)),
                ("correlation_id", fields.UUIDField(unique=True, db_index=True)),
            ],
            options={
                "table": "workspace_ownership_transfers",
                "app": "models",
                "unique_together": (("workspace_id", "idempotency_key"),),
                "indexes": [Index(fields=["workspace_id", "created_at"])],
                "pk_attr": "id",
                "table_description": "Immutable idempotency and audit receipts for Workspace ownership transfer.",
            },
            bases=["BaseModel"],
        ),
    ]
