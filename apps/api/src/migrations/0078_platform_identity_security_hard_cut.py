from tortoise import fields, migrations
from tortoise.fields.base import OnDelete
from tortoise.indexes import Index
from tortoise.migrations import operations as ops

from src.common.utils.ids import uuid7

PERMISSION_CATALOG = (
    ("platform:access-team:read", "access"),
    ("platform:access-team:invite", "access"),
    ("platform:access-team:remove", "access"),
    ("platform:access-roles:read", "access"),
    ("platform:access-roles:manage", "access"),
    ("platform:access-mfa:reset", "access"),
    ("platform:access-sessions:read", "access"),
    ("platform:access-sessions:revoke", "access"),
    ("platform:access-sign-in-settings:read", "access"),
    ("platform:access-sign-in-settings:manage", "access"),
    ("platform:monitoring-requests:read", "monitoring"),
    ("platform:monitoring-audit:read", "monitoring"),
    ("platform:tenant-users:read", "tenant-governance"),
    ("platform:tenant-users:manage", "tenant-governance"),
    ("platform:tenant-workspaces:read", "tenant-governance"),
    ("platform:tenant-workspaces:manage", "tenant-governance"),
    ("platform:tenant-projects:read", "tenant-governance"),
    ("platform:tenant-projects:manage", "tenant-governance"),
    ("platform:commerce-plans:read", "commerce"),
    ("platform:commerce-plans:manage", "commerce"),
    ("platform:commerce-subscriptions:read", "commerce"),
    ("platform:commerce-subscriptions:manage", "commerce"),
    ("platform:commerce-credits:read", "commerce"),
    ("platform:commerce-credits:correct", "commerce"),
    ("platform:commerce-settings:read", "commerce"),
    ("platform:commerce-settings:manage", "commerce"),
    ("platform:ai-providers:read", "ai"),
    ("platform:ai-providers:manage", "ai"),
    ("platform:ai-agents:read", "ai"),
    ("platform:ai-agents:manage", "ai"),
    ("platform:ai-assignments:read", "ai"),
    ("platform:ai-assignments:manage", "ai"),
    ("platform:ai-runtime-settings:read", "ai"),
    ("platform:ai-runtime-settings:manage", "ai"),
    ("platform:site-delivery:read", "site-delivery"),
    ("platform:site-delivery:manage", "site-delivery"),
    ("platform:site-storage:read", "site-delivery"),
    ("platform:site-storage:manage", "site-delivery"),
    ("platform:site-delivery-settings:read", "site-delivery"),
    ("platform:site-delivery-settings:manage", "site-delivery"),
    ("platform:messages-feedback:read", "messages"),
    ("platform:messages-feedback:manage", "messages"),
    ("platform:messages-mail:read", "messages"),
    ("platform:messages-mail:manage", "messages"),
    ("platform:messages-campaigns:read", "messages"),
    ("platform:messages-campaigns:manage", "messages"),
    ("platform:messages-campaigns:send", "messages"),
    ("platform:messages-delivery:retry", "messages"),
    ("platform:messages-delivery-settings:read", "messages"),
    ("platform:messages-delivery-settings:manage", "messages"),
    ("platform:extensions-catalog:read", "extensions"),
    ("platform:extensions:install", "extensions"),
    ("platform:extensions:configure", "extensions"),
    ("platform:jobs:read", "jobs"),
    ("platform:jobs:manage", "jobs"),
)


BUILT_IN_ROLE_CATALOG = (
    (
        "access-security-operator",
        "platform.role.access_security_operator.name",
        "platform.role.access_security_operator.description",
        (
            "platform:access-team:read",
            "platform:access-team:invite",
            "platform:access-team:remove",
            "platform:access-roles:read",
            "platform:access-roles:manage",
            "platform:access-mfa:reset",
            "platform:access-sessions:read",
            "platform:access-sessions:revoke",
            "platform:access-sign-in-settings:read",
            "platform:access-sign-in-settings:manage",
        ),
    ),
    (
        "platform-operations-reader",
        "platform.role.platform_operations_reader.name",
        "platform.role.platform_operations_reader.description",
        (
            "platform:monitoring-requests:read",
            "platform:monitoring-audit:read",
            "platform:jobs:read",
        ),
    ),
    (
        "tenant-governance-operator",
        "platform.role.tenant_governance_operator.name",
        "platform.role.tenant_governance_operator.description",
        (
            "platform:tenant-users:read",
            "platform:tenant-users:manage",
            "platform:tenant-workspaces:read",
            "platform:tenant-workspaces:manage",
            "platform:tenant-projects:read",
            "platform:tenant-projects:manage",
        ),
    ),
    (
        "commerce-operations-operator",
        "platform.role.commerce_operations_operator.name",
        "platform.role.commerce_operations_operator.description",
        (
            "platform:commerce-plans:read",
            "platform:commerce-plans:manage",
            "platform:commerce-subscriptions:read",
            "platform:commerce-subscriptions:manage",
            "platform:commerce-credits:read",
            "platform:commerce-credits:correct",
            "platform:commerce-settings:read",
            "platform:commerce-settings:manage",
        ),
    ),
)


class Migration(migrations.Migration):
    dependencies = [("models", "0077_workspace_owner_authority_hard_cut")]

    initial = False

    operations = [
        ops.RemoveField(model_name="User", name="is_super_admin"),
        ops.CreateModel(
            name="PlatformInstanceOwnership",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True)),
                ("singleton_key", fields.CharField(max_length=16, unique=True, default="instance")),
                (
                    "owner_user",
                    fields.ForeignKeyField(
                        "models.User",
                        related_name="platform_instance_ownerships",
                        on_delete=OnDelete.RESTRICT,
                        unique=True,
                    ),
                ),
                ("revision", fields.BigIntField(default=1)),
            ],
            options={"table": "platform_instance_ownership", "app": "models", "pk_attr": "id"},
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="PlatformOperator",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True)),
                (
                    "user",
                    fields.ForeignKeyField(
                        "models.User",
                        related_name="platform_operator_records",
                        on_delete=OnDelete.RESTRICT,
                        unique=True,
                    ),
                ),
                ("status", fields.CharField(max_length=32, default="active", db_index=True)),
                ("activated_at", fields.DatetimeField(null=True)),
                ("deactivated_at", fields.DatetimeField(null=True)),
                ("deactivated_by_user_id", fields.UUIDField(null=True, db_index=True)),
                ("revision", fields.BigIntField(default=1)),
            ],
            options={
                "table": "platform_operators",
                "app": "models",
                "indexes": [Index(fields=["status", "updated_at"])],
                "pk_attr": "id",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="PlatformOperatorInvitation",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True)),
                (
                    "recipient_user",
                    fields.ForeignKeyField(
                        "models.User",
                        related_name="platform_operator_invitations_received",
                        on_delete=OnDelete.RESTRICT,
                    ),
                ),
                (
                    "invited_by_user",
                    fields.ForeignKeyField(
                        "models.User", related_name="platform_operator_invitations_sent", on_delete=OnDelete.RESTRICT
                    ),
                ),
                ("status", fields.CharField(max_length=32, default="pending", db_index=True)),
                ("expires_at", fields.DatetimeField(db_index=True)),
                ("accepted_at", fields.DatetimeField(null=True)),
                ("revoked_at", fields.DatetimeField(null=True)),
                ("invalidated_at", fields.DatetimeField(null=True)),
                ("revision", fields.BigIntField(default=1)),
                ("idempotency_key", fields.CharField(max_length=128)),
                ("correlation_id", fields.UUIDField(unique=True, db_index=True)),
            ],
            options={
                "table": "platform_operator_invitations",
                "app": "models",
                "unique_together": (("invited_by_user_id", "idempotency_key"),),
                "indexes": [
                    Index(fields=["recipient_user_id", "status", "expires_at"]),
                    Index(fields=["invited_by_user_id", "status"]),
                ],
                "pk_attr": "id",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="PlatformPermission",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True)),
                ("code", fields.CharField(max_length=128, unique=True, db_index=True)),
                ("owner_domain", fields.CharField(max_length=64, db_index=True)),
                ("name_i18n", fields.CharField(max_length=200)),
                ("description_i18n", fields.CharField(max_length=200)),
                ("is_delegable", fields.BooleanField(default=True, db_index=True)),
                ("catalog_revision", fields.BigIntField(default=1)),
                ("is_active", fields.BooleanField(default=True, db_index=True)),
            ],
            options={
                "table": "platform_permissions",
                "app": "models",
                "indexes": [Index(fields=["owner_domain", "is_active"])],
                "pk_attr": "id",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="PlatformRole",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True)),
                ("code", fields.CharField(max_length=128, unique=True, db_index=True)),
                ("kind", fields.CharField(max_length=32, db_index=True)),
                ("name", fields.CharField(max_length=128)),
                ("description", fields.TextField(null=True)),
                ("name_i18n", fields.CharField(max_length=200, null=True)),
                ("description_i18n", fields.CharField(max_length=200, null=True)),
                ("created_by_user_id", fields.UUIDField(null=True, db_index=True)),
                ("is_active", fields.BooleanField(default=True, db_index=True)),
            ],
            options={
                "table": "platform_roles",
                "app": "models",
                "indexes": [Index(fields=["kind", "is_active"])],
                "pk_attr": "id",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="PlatformRoleRevision",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True)),
                (
                    "role",
                    fields.ForeignKeyField("models.PlatformRole", related_name="revisions", on_delete=OnDelete.CASCADE),
                ),
                ("sequence", fields.IntField()),
                ("is_current", fields.BooleanField(default=False, db_index=True)),
                ("created_by_user_id", fields.UUIDField(null=True, db_index=True)),
                ("superseded_at", fields.DatetimeField(null=True)),
            ],
            options={
                "table": "platform_role_revisions",
                "app": "models",
                "unique_together": (("role_id", "sequence"),),
                "indexes": [Index(fields=["role_id", "is_current"])],
                "pk_attr": "id",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="PlatformRoleRevisionPermission",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True)),
                (
                    "role_revision",
                    fields.ForeignKeyField(
                        "models.PlatformRoleRevision", related_name="permission_bindings", on_delete=OnDelete.CASCADE
                    ),
                ),
                (
                    "permission",
                    fields.ForeignKeyField(
                        "models.PlatformPermission", related_name="role_revision_bindings", on_delete=OnDelete.RESTRICT
                    ),
                ),
            ],
            options={
                "table": "platform_role_revision_permissions",
                "app": "models",
                "unique_together": (("role_revision_id", "permission_id"),),
                "pk_attr": "id",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="PlatformOperatorRoleAssignment",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True)),
                (
                    "operator",
                    fields.ForeignKeyField(
                        "models.PlatformOperator", related_name="role_assignments", on_delete=OnDelete.RESTRICT
                    ),
                ),
                (
                    "role",
                    fields.ForeignKeyField(
                        "models.PlatformRole", related_name="operator_assignments", on_delete=OnDelete.RESTRICT
                    ),
                ),
                ("assigned_by_user_id", fields.UUIDField(null=True, db_index=True)),
                ("started_at", fields.DatetimeField(db_index=True)),
                ("ended_at", fields.DatetimeField(null=True, db_index=True)),
            ],
            options={
                "table": "platform_operator_role_assignments",
                "app": "models",
                "indexes": [Index(fields=["operator_id", "ended_at"]), Index(fields=["role_id", "ended_at"])],
                "pk_attr": "id",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="PlatformOperatorInvitationRole",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True)),
                (
                    "invitation",
                    fields.ForeignKeyField(
                        "models.PlatformOperatorInvitation", related_name="role_bindings", on_delete=OnDelete.CASCADE
                    ),
                ),
                (
                    "role",
                    fields.ForeignKeyField(
                        "models.PlatformRole", related_name="invitation_bindings", on_delete=OnDelete.RESTRICT
                    ),
                ),
                (
                    "role_revision",
                    fields.ForeignKeyField(
                        "models.PlatformRoleRevision", related_name="invitation_bindings", on_delete=OnDelete.RESTRICT
                    ),
                ),
            ],
            options={
                "table": "platform_operator_invitation_roles",
                "app": "models",
                "unique_together": (("invitation_id", "role_id"),),
                "pk_attr": "id",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="PlatformMfaMethod",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True)),
                (
                    "user",
                    fields.ForeignKeyField(
                        "models.User", related_name="platform_mfa_methods", on_delete=OnDelete.RESTRICT
                    ),
                ),
                ("kind", fields.CharField(max_length=32, db_index=True)),
                ("status", fields.CharField(max_length=32, default="pending", db_index=True)),
                ("label", fields.CharField(max_length=128, null=True)),
                ("credential_id", fields.CharField(max_length=1024, null=True, unique=True)),
                ("credential_public_key", fields.TextField(null=True)),
                ("sign_count", fields.BigIntField(null=True)),
                ("relying_party_id", fields.CharField(max_length=255, null=True)),
                ("totp_secret_enc", fields.TextField(null=True)),
                ("verified_at", fields.DatetimeField(null=True, db_index=True)),
                ("revoked_at", fields.DatetimeField(null=True, db_index=True)),
                ("last_totp_counter", fields.BigIntField(null=True)),
                ("last_used_at", fields.DatetimeField(null=True, db_index=True)),
            ],
            options={
                "table": "platform_mfa_methods",
                "app": "models",
                "indexes": [Index(fields=["user_id", "status", "kind"])],
                "pk_attr": "id",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="PlatformWebAuthnChallenge",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True)),
                (
                    "user",
                    fields.ForeignKeyField(
                        "models.User",
                        related_name="platform_webauthn_challenges",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                ("purpose", fields.CharField(max_length=32, db_index=True)),
                ("challenge_hash", fields.CharField(max_length=64, unique=True)),
                ("binding_hash", fields.CharField(max_length=64)),
                ("relying_party_id", fields.CharField(max_length=255)),
                ("origin", fields.CharField(max_length=2048)),
                ("expires_at", fields.DatetimeField(db_index=True)),
                ("consumed_at", fields.DatetimeField(null=True, db_index=True)),
            ],
            options={
                "table": "platform_webauthn_challenges",
                "app": "models",
                "indexes": [Index(fields=["user_id", "purpose", "consumed_at", "expires_at"])],
                "pk_attr": "id",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="PlatformAuthFlowChallenge",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True)),
                (
                    "user",
                    fields.ForeignKeyField(
                        "models.User",
                        related_name="platform_auth_flow_challenges",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                ("purpose", fields.CharField(max_length=32, db_index=True)),
                ("token_hash", fields.CharField(max_length=64, unique=True)),
                ("identity_revision", fields.BigIntField()),
                ("expires_at", fields.DatetimeField(db_index=True)),
                ("consumed_at", fields.DatetimeField(null=True, db_index=True)),
                ("failure_count", fields.BigIntField(default=0)),
                ("last_failure_at", fields.DatetimeField(null=True)),
            ],
            options={
                "table": "platform_auth_flow_challenges",
                "app": "models",
                "indexes": [Index(fields=["user_id", "purpose", "consumed_at", "expires_at"])],
                "pk_attr": "id",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="PlatformMfaRecoveryCode",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True)),
                (
                    "operator",
                    fields.ForeignKeyField(
                        "models.PlatformOperator", related_name="mfa_recovery_codes", on_delete=OnDelete.CASCADE
                    ),
                ),
                ("salt", fields.CharField(max_length=64)),
                ("code_hash", fields.CharField(max_length=128)),
                ("used_at", fields.DatetimeField(null=True, db_index=True)),
                ("invalidated_at", fields.DatetimeField(null=True, db_index=True)),
            ],
            options={
                "table": "platform_mfa_recovery_codes",
                "app": "models",
                "indexes": [Index(fields=["operator_id", "used_at", "invalidated_at"])],
                "pk_attr": "id",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="PlatformActionPolicy",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True)),
                ("code", fields.CharField(max_length=128, unique=True, db_index=True)),
                (
                    "permission",
                    fields.ForeignKeyField(
                        "models.PlatformPermission", related_name="action_policies", on_delete=OnDelete.RESTRICT
                    ),
                ),
                ("requires_step_up", fields.BooleanField(default=False, db_index=True)),
                ("required_assurance", fields.CharField(max_length=32, default="local_mfa")),
                ("freshness_seconds", fields.IntField(null=True)),
                ("policy_revision", fields.BigIntField(default=1)),
                ("is_active", fields.BooleanField(default=True, db_index=True)),
            ],
            options={"table": "platform_action_policies", "app": "models", "pk_attr": "id"},
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="PlatformSession",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True)),
                (
                    "actor_user",
                    fields.ForeignKeyField(
                        "models.User", related_name="platform_sessions", on_delete=OnDelete.RESTRICT
                    ),
                ),
                (
                    "operator",
                    fields.ForeignKeyField(
                        "models.PlatformOperator", related_name="sessions", on_delete=OnDelete.RESTRICT, null=True
                    ),
                ),
                ("session_identifier_hash", fields.CharField(max_length=128, unique=True, db_index=True)),
                ("device_label", fields.CharField(max_length=128, null=True)),
                ("recent_activity_at", fields.DatetimeField(db_index=True)),
                ("inactivity_expires_at", fields.DatetimeField(db_index=True)),
                ("absolute_expires_at", fields.DatetimeField(db_index=True)),
                ("policy_revision", fields.BigIntField()),
                ("token_version", fields.BigIntField(default=1)),
                ("assurance", fields.CharField(max_length=32)),
                ("revoked_at", fields.DatetimeField(null=True, db_index=True)),
                ("revoked_by_user_id", fields.UUIDField(null=True, db_index=True)),
            ],
            options={
                "table": "platform_sessions",
                "app": "models",
                "indexes": [Index(fields=["actor_user_id", "revoked_at"]), Index(fields=["operator_id", "revoked_at"])],
                "pk_attr": "id",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="PlatformStepUpProof",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True)),
                (
                    "session",
                    fields.ForeignKeyField(
                        "models.PlatformSession", related_name="step_up_proofs", on_delete=OnDelete.CASCADE
                    ),
                ),
                (
                    "actor_user",
                    fields.ForeignKeyField(
                        "models.User", related_name="platform_step_up_proofs", on_delete=OnDelete.RESTRICT
                    ),
                ),
                (
                    "action_policy",
                    fields.ForeignKeyField(
                        "models.PlatformActionPolicy", related_name="step_up_proofs", on_delete=OnDelete.RESTRICT
                    ),
                ),
                ("proof_hash", fields.CharField(max_length=128, unique=True, db_index=True)),
                ("assurance", fields.CharField(max_length=32)),
                ("target_type", fields.CharField(max_length=64)),
                ("target_id", fields.UUIDField(null=True, db_index=True)),
                ("scope", fields.JSONField(default=dict)),
                ("expected_revision", fields.BigIntField(null=True)),
                ("preview_revision", fields.BigIntField(null=True)),
                ("policy_revision", fields.BigIntField()),
                ("idempotency_key", fields.CharField(max_length=128)),
                ("expires_at", fields.DatetimeField(db_index=True)),
                ("status", fields.CharField(max_length=32, default="active", db_index=True)),
                ("consumed_at", fields.DatetimeField(null=True)),
            ],
            options={
                "table": "platform_step_up_proofs",
                "app": "models",
                "indexes": [
                    Index(fields=["session_id", "status", "expires_at"]),
                    Index(fields=["actor_user_id", "status"]),
                ],
                "pk_attr": "id",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="PlatformOwnershipTransfer",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True)),
                (
                    "previous_owner_user",
                    fields.ForeignKeyField(
                        "models.User", related_name="platform_ownership_transfers_from", on_delete=OnDelete.RESTRICT
                    ),
                ),
                (
                    "next_owner_user",
                    fields.ForeignKeyField(
                        "models.User", related_name="platform_ownership_transfers_to", on_delete=OnDelete.RESTRICT
                    ),
                ),
                (
                    "initiated_by_user",
                    fields.ForeignKeyField(
                        "models.User",
                        related_name="platform_ownership_transfers_initiated",
                        on_delete=OnDelete.RESTRICT,
                    ),
                ),
                ("status", fields.CharField(max_length=32, default="pending", db_index=True)),
                ("ownership_revision", fields.BigIntField()),
                ("target_operator_revision", fields.BigIntField()),
                ("expires_at", fields.DatetimeField(db_index=True)),
                ("accepted_at", fields.DatetimeField(null=True)),
                ("idempotency_key", fields.CharField(max_length=128)),
                ("acceptance_idempotency_key", fields.CharField(max_length=128, null=True)),
                ("correlation_id", fields.UUIDField(unique=True, db_index=True)),
                ("revision", fields.BigIntField(default=1)),
            ],
            options={
                "table": "platform_ownership_transfers",
                "app": "models",
                "unique_together": (("previous_owner_user_id", "idempotency_key"),),
                "indexes": [Index(fields=["next_owner_user_id", "status", "expires_at"])],
                "pk_attr": "id",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="PlatformOwnershipTransferFormerOwnerRole",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True)),
                (
                    "transfer",
                    fields.ForeignKeyField(
                        "models.PlatformOwnershipTransfer",
                        related_name="former_owner_role_bindings",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                (
                    "role",
                    fields.ForeignKeyField(
                        "models.PlatformRole", related_name="ownership_transfer_bindings", on_delete=OnDelete.RESTRICT
                    ),
                ),
                (
                    "role_revision",
                    fields.ForeignKeyField(
                        "models.PlatformRoleRevision",
                        related_name="ownership_transfer_bindings",
                        on_delete=OnDelete.RESTRICT,
                    ),
                ),
            ],
            options={
                "table": "platform_ownership_transfer_former_owner_roles",
                "app": "models",
                "unique_together": (("transfer_id", "role_id"),),
                "pk_attr": "id",
            },
            bases=["BaseModel"],
        ),
        ops.RunSQL(
            """
            ALTER TABLE platform_instance_ownership
                ADD CONSTRAINT platform_instance_ownership_singleton_key_check
                CHECK (singleton_key = 'instance');

            ALTER TABLE platform_webauthn_challenges
                ADD CONSTRAINT platform_webauthn_challenges_purpose_check
                CHECK (purpose IN ('registration', 'authentication')),
                ADD CONSTRAINT platform_webauthn_challenges_expiry_check
                CHECK (expires_at > created_at),
                ADD CONSTRAINT platform_webauthn_challenges_consumed_at_check
                CHECK (consumed_at IS NULL OR consumed_at >= created_at);

            ALTER TABLE platform_auth_flow_challenges
                ADD CONSTRAINT platform_auth_flow_challenges_purpose_check
                CHECK (purpose IN ('setup', 'login_mfa')),
                ADD CONSTRAINT platform_auth_flow_challenges_identity_revision_check
                CHECK (identity_revision >= 0),
                ADD CONSTRAINT platform_auth_flow_challenges_failure_count_check
                CHECK (failure_count >= 0),
                ADD CONSTRAINT platform_auth_flow_challenges_expiry_check
                CHECK (expires_at > created_at),
                ADD CONSTRAINT platform_auth_flow_challenges_consumed_at_check
                CHECK (consumed_at IS NULL OR consumed_at >= created_at);

            CREATE UNIQUE INDEX platform_role_revisions_one_current_per_role
                ON platform_role_revisions (role_id)
                WHERE is_current;
            CREATE UNIQUE INDEX platform_operator_role_assignments_one_active_per_role
                ON platform_operator_role_assignments (operator_id, role_id)
                WHERE ended_at IS NULL;
            CREATE UNIQUE INDEX platform_operator_invitations_one_pending_per_recipient
                ON platform_operator_invitations (recipient_user_id)
                WHERE status = 'pending';
            CREATE UNIQUE INDEX platform_ownership_transfers_one_pending_per_owner
                ON platform_ownership_transfers (previous_owner_user_id)
                WHERE status = 'pending';
            CREATE UNIQUE INDEX platform_ownership_transfers_one_pending_per_target
                ON platform_ownership_transfers (next_owner_user_id)
                WHERE status = 'pending';
            CREATE UNIQUE INDEX platform_ownership_transfers_acceptance_idempotency
                ON platform_ownership_transfers (next_owner_user_id, acceptance_idempotency_key)
                WHERE acceptance_idempotency_key IS NOT NULL;
            """
        ),
        ops.RunSQL(
            """
            INSERT INTO platform_permissions (
                id, created_at, updated_at, code, owner_domain, name_i18n,
                description_i18n, is_delegable, catalog_revision, is_active
            ) VALUES
            """
            + ",\n".join(
                "(md5('arclayer:platform-permission:' || '{code}')::uuid, NOW(), NOW(), '{code}', '{domain}', "
                "'platform.permission.{key}.name', 'platform.permission.{key}.description', TRUE, 1, TRUE)".format(
                    code=code, domain=domain, key=code.removeprefix("platform:").replace(":", "_").replace("-", "_")
                )
                for code, domain in PERMISSION_CATALOG
            )
            + ";"
        ),
        ops.RunSQL(
            """
            INSERT INTO platform_roles (
                id, created_at, updated_at, code, kind, name, description,
                name_i18n, description_i18n, created_by_user_id, is_active
            ) VALUES
            """
            + ",\n".join(
                "(md5('arclayer:platform-role:' || '{code}')::uuid, NOW(), NOW(), '{code}', 'built_in', '{code}', NULL, "
                "'{name_key}', '{description_key}', NULL, TRUE)".format(
                    code=code, name_key=name_key, description_key=description_key
                )
                for code, name_key, description_key, _permissions in BUILT_IN_ROLE_CATALOG
            )
            + ";"
        ),
        ops.RunSQL(
            """
            INSERT INTO platform_role_revisions (
                id, created_at, updated_at, role_id, sequence, is_current,
                created_by_user_id, superseded_at
            )
            SELECT
                md5('arclayer:platform-role-revision:' || role.code || ':1')::uuid,
                NOW(), NOW(), role.id, 1, TRUE, NULL, NULL
            FROM platform_roles AS role
            WHERE role.kind = 'built_in';

            INSERT INTO platform_role_revision_permissions (
                id, created_at, updated_at, role_revision_id, permission_id
            ) VALUES
            """
            + ",\n".join(
                "(md5('arclayer:platform-role-permission:{role}:{permission}')::uuid, NOW(), NOW(), "
                "md5('arclayer:platform-role-revision:{role}:1')::uuid, "
                "md5('arclayer:platform-permission:{permission}')::uuid)".format(role=role, permission=permission)
                for role, _name_key, _description_key, permissions in BUILT_IN_ROLE_CATALOG
                for permission in permissions
            )
            + ";"
        ),
        ops.RunSQL(
            """
            INSERT INTO platform_action_policies (
                id, created_at, updated_at, code, permission_id, requires_step_up,
                required_assurance, freshness_seconds, policy_revision, is_active
            ) VALUES
                (md5('arclayer:platform-action:platform.access.invite_operator')::uuid, NOW(), NOW(), 'platform.access.invite_operator', md5('arclayer:platform-permission:platform:access-team:invite')::uuid, TRUE, 'phishing_resistant', NULL, 1, TRUE),
                (md5('arclayer:platform-action:platform.access.change_role')::uuid, NOW(), NOW(), 'platform.access.change_role', md5('arclayer:platform-permission:platform:access-roles:manage')::uuid, TRUE, 'phishing_resistant', NULL, 1, TRUE),
                (md5('arclayer:platform-action:platform.access.remove_operator')::uuid, NOW(), NOW(), 'platform.access.remove_operator', md5('arclayer:platform-permission:platform:access-team:remove')::uuid, TRUE, 'phishing_resistant', NULL, 1, TRUE),
                (md5('arclayer:platform-action:platform.access.reset_operator_mfa')::uuid, NOW(), NOW(), 'platform.access.reset_operator_mfa', md5('arclayer:platform-permission:platform:access-mfa:reset')::uuid, TRUE, 'phishing_resistant', NULL, 1, TRUE),
                (md5('arclayer:platform-action:platform.access.transfer_instance_ownership')::uuid, NOW(), NOW(), 'platform.access.transfer_instance_ownership', md5('arclayer:platform-permission:platform:access-team:remove')::uuid, TRUE, 'phishing_resistant', NULL, 1, TRUE);
            """
        ),
    ]
