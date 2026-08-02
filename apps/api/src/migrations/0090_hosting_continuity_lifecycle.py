from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0089_commerce_catalog_command_persistence")]

    initial = False

    operations = [
        ops.RunSQL(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM hosting_commercial_access_projections
                    WHERE state <> 'serving'
                ) THEN
                    RAISE EXCEPTION
                        'Hosting continuity migration blocked: legacy non-serving projection lacks target-level lifecycle evidence';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM hosting_commercial_access_projections AS projection
                    WHERE projection.preserved_release_id IS NOT NULL
                      AND NOT EXISTS (
                          SELECT 1
                          FROM content_releases AS release
                          JOIN sites AS site
                            ON site.id = release.site_id
                           AND site.workspace_id = projection.workspace_id
                           AND site.project_id IS NOT NULL
                           AND site.runtime_id IS NOT NULL
                           AND site.is_active = TRUE
                          JOIN projects AS project
                            ON project.id = site.project_id
                           AND project.workspace_id = projection.workspace_id
                           AND project.is_active = TRUE
                          JOIN project_runtimes AS runtime
                            ON runtime.id = site.runtime_id
                           AND runtime.project_id = project.id
                           AND runtime.is_active = TRUE
                          JOIN LATERAL (
                              SELECT deployment.source_type, deployment.source_ref
                              FROM project_deployments AS deployment
                              JOIN project_environments AS environment
                                ON environment.id = deployment.environment_id
                              WHERE deployment.project_id = project.id
                                AND environment.key = 'production'
                                AND deployment.is_active = TRUE
                              ORDER BY deployment.created_at DESC, deployment.id DESC
                              LIMIT 1
                          ) AS active_deployment ON TRUE
                          WHERE release.id = projection.preserved_release_id
                            AND release.workspace_id = projection.workspace_id
                            AND active_deployment.source_type = 'cms_runtime'
                            AND active_deployment.source_ref = release.id::text
                      )
                ) THEN
                    RAISE EXCEPTION
                        'Hosting continuity migration blocked: legacy preserved release lacks one current delivery target';
                END IF;
            END $$;

            CREATE TABLE hosting_continuity_policies (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                revision BIGINT NOT NULL UNIQUE,
                is_active BOOLEAN NOT NULL DEFAULT FALSE,
                continuity_window_seconds INTEGER NOT NULL,
                CONSTRAINT hosting_continuity_policies_revision_check CHECK (revision > 0),
                CONSTRAINT hosting_continuity_policies_window_check CHECK (continuity_window_seconds > 0)
            );
            CREATE UNIQUE INDEX hosting_continuity_policies_one_active_idx
                ON hosting_continuity_policies (is_active) WHERE is_active;

            ALTER TABLE hosting_commercial_access_projections
                ADD COLUMN continuity_source_identity VARCHAR(255),
                ADD COLUMN continuity_started_at TIMESTAMPTZ,
                ADD COLUMN continuity_deadline TIMESTAMPTZ,
                ADD COLUMN policy_revision BIGINT,
                ADD COLUMN last_fact_effective_at TIMESTAMPTZ,
                ADD COLUMN restoration_source_identity VARCHAR(255),
                ADD COLUMN delivery_error_code VARCHAR(128),
                ADD COLUMN delivery_error_message VARCHAR(512);
            ALTER TABLE hosting_commercial_access_projections
                DROP CONSTRAINT hosting_commercial_access_projections_state_check,
                ADD CONSTRAINT hosting_commercial_access_projections_state_check
                    CHECK (state IN ('serving', 'continuity_required', 'suspended', 'restoration_required', 'restored', 'partial'));
            ALTER TABLE hosting_commercial_access_receipts
                DROP CONSTRAINT hosting_commercial_access_receipts_state_check,
                ADD CONSTRAINT hosting_commercial_access_receipts_state_check
                    CHECK (resulting_state IN ('serving', 'continuity_required', 'suspended', 'restoration_required', 'restored', 'partial'));
            CREATE INDEX hosting_commercial_access_projections_continuity_deadline_idx
                ON hosting_commercial_access_projections (continuity_deadline);

            CREATE TABLE hosting_continuity_targets (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                projection_id UUID NOT NULL REFERENCES hosting_commercial_access_projections(id) ON DELETE CASCADE,
                site_id UUID NOT NULL,
                runtime_id UUID NOT NULL,
                preserved_release_id UUID,
                gate VARCHAR(16) NOT NULL DEFAULT 'serving',
                restoration_state VARCHAR(16) NOT NULL DEFAULT 'not_required',
                operation_identity VARCHAR(255),
                failure_code VARCHAR(128),
                failure_message VARCHAR(512),
                verification_evidence TEXT,
                verified_at TIMESTAMPTZ,
                CONSTRAINT hosting_continuity_targets_gate_check
                    CHECK (gate IN ('serving', 'continuity', 'suspended')),
                CONSTRAINT hosting_continuity_targets_restoration_state_check
                    CHECK (restoration_state IN ('not_required', 'pending', 'succeeded', 'failed')),
                CONSTRAINT hosting_continuity_targets_identity_unique
                    UNIQUE (projection_id, site_id, runtime_id)
            );
            CREATE INDEX hosting_continuity_targets_projection_gate_updated_idx
                ON hosting_continuity_targets (projection_id, gate, updated_at);

            INSERT INTO hosting_continuity_targets (
                id,
                created_at,
                updated_at,
                projection_id,
                site_id,
                runtime_id,
                preserved_release_id
            )
            SELECT
                md5(
                    'arclayer:hosting-continuity-target:'
                    || projection.id::text
                    || ':' || site.id::text
                    || ':' || runtime.id::text
                )::uuid,
                projection.created_at,
                projection.updated_at,
                projection.id,
                site.id,
                runtime.id,
                release.id
            FROM hosting_commercial_access_projections AS projection
            JOIN content_releases AS release
              ON release.id = projection.preserved_release_id
             AND release.workspace_id = projection.workspace_id
            JOIN sites AS site
              ON site.id = release.site_id
             AND site.workspace_id = projection.workspace_id
            JOIN project_runtimes AS runtime ON runtime.id = site.runtime_id
            WHERE projection.preserved_release_id IS NOT NULL;

            ALTER TABLE hosting_commercial_access_projections
                DROP COLUMN preserved_release_id;
            """
        )
    ]
