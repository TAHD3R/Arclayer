from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0106_agent_run_platform_recovery")]
    initial = False
    operations = [
        ops.RunSQL(
            """
            CREATE TABLE user_webauthn_credentials (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                label VARCHAR(128) NULL,
                credential_id VARCHAR(1024) NOT NULL UNIQUE,
                credential_public_key TEXT NOT NULL,
                sign_count BIGINT NOT NULL,
                relying_party_id VARCHAR(255) NOT NULL,
                last_used_at TIMESTAMPTZ NULL
            );
            CREATE INDEX user_webauthn_credentials_user_created_idx
                ON user_webauthn_credentials(user_id, created_at);
            CREATE INDEX user_webauthn_credentials_last_used_idx
                ON user_webauthn_credentials(last_used_at);

            CREATE TABLE user_webauthn_challenges (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                purpose VARCHAR(32) NOT NULL,
                challenge_hash VARCHAR(64) NOT NULL UNIQUE,
                binding_hash VARCHAR(64) NOT NULL,
                relying_party_id VARCHAR(255) NOT NULL,
                origin VARCHAR(2048) NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                consumed_at TIMESTAMPTZ NULL,
                CONSTRAINT user_webauthn_challenges_purpose_check
                    CHECK (purpose IN ('registration', 'authentication'))
            );
            CREATE INDEX user_webauthn_challenges_lookup_idx
                ON user_webauthn_challenges(user_id, purpose, consumed_at, expires_at);
            CREATE INDEX user_webauthn_challenges_expiry_idx
                ON user_webauthn_challenges(expires_at);
            """
        )
    ]
