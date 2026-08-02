from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0101_hosting_delivery_policy_previews")]

    initial = False

    operations = [
        ops.RunSQL(
            """
            -- This is a hard cut. Every legacy route must map to one exact typed
            -- target before the predecessor columns are touched. Aerich applies
            -- this operation transactionally, so a failed preflight leaves the
            -- predecessor schema and rows intact.
            CREATE OR REPLACE FUNCTION notification_0102_require_text(
                value JSONB,
                context_label TEXT,
                minimum_length INTEGER,
                maximum_length INTEGER
            ) RETURNS TEXT
            LANGUAGE plpgsql
            IMMUTABLE
            AS $$
            DECLARE
                result TEXT;
            BEGIN
                IF jsonb_typeof(value) <> 'string' THEN
                    RAISE EXCEPTION '0102 notification typed target cut blocked: % must be a string', context_label;
                END IF;
                result := value #>> '{}';
                IF char_length(result) < minimum_length OR char_length(result) > maximum_length THEN
                    RAISE EXCEPTION '0102 notification typed target cut blocked: % has an invalid length', context_label;
                END IF;
                RETURN result;
            END;
            $$;

            CREATE OR REPLACE FUNCTION notification_0102_require_uuid(
                value JSONB,
                context_label TEXT
            ) RETURNS UUID
            LANGUAGE plpgsql
            IMMUTABLE
            AS $$
            DECLARE
                result TEXT;
            BEGIN
                result := notification_0102_require_text(value, context_label, 1, 64);
                IF result !~ '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$' THEN
                    RAISE EXCEPTION '0102 notification typed target cut blocked: % must be a UUID', context_label;
                END IF;
                RETURN result::UUID;
            END;
            $$;

            CREATE OR REPLACE FUNCTION notification_0102_require_identifier(
                value JSONB,
                context_label TEXT
            ) RETURNS TEXT
            LANGUAGE plpgsql
            IMMUTABLE
            AS $$
            DECLARE
                result TEXT;
            BEGIN
                result := notification_0102_require_text(value, context_label, 1, 64);
                IF result !~ '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
                   AND result !~ '^[A-Za-z0-9_-]{22}$' THEN
                    RAISE EXCEPTION '0102 notification typed target cut blocked: % must be a UUID or public id', context_label;
                END IF;
                RETURN result;
            END;
            $$;

            CREATE OR REPLACE FUNCTION notification_0102_assert_object_keys(
                value JSONB,
                allowed_keys TEXT[],
                context_label TEXT
            ) RETURNS VOID
            LANGUAGE plpgsql
            IMMUTABLE
            AS $$
            BEGIN
                IF jsonb_typeof(value) <> 'object' THEN
                    RAISE EXCEPTION '0102 notification typed target cut blocked: % must be an object', context_label;
                END IF;
                IF EXISTS (
                    SELECT 1
                    FROM jsonb_object_keys(value) AS candidate(key)
                    WHERE NOT (candidate.key = ANY(allowed_keys))
                ) THEN
                    RAISE EXCEPTION '0102 notification typed target cut blocked: % contains an unsupported field', context_label;
                END IF;
            END;
            $$;

            CREATE OR REPLACE FUNCTION notification_0102_optional_timestamp(
                value JSONB,
                context_label TEXT
            ) RETURNS VOID
            LANGUAGE plpgsql
            STABLE
            AS $$
            DECLARE
                timestamp_value TEXT;
            BEGIN
                IF value IS NULL OR jsonb_typeof(value) = 'null' THEN
                    RETURN;
                END IF;
                timestamp_value := notification_0102_require_text(value, context_label, 1, 128);
                IF timestamp_value !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
                    RAISE EXCEPTION '0102 notification typed target cut blocked: % must include an explicit UTC offset', context_label;
                END IF;
                BEGIN
                    PERFORM timestamp_value::TIMESTAMPTZ;
                EXCEPTION
                    WHEN others THEN
                        RAISE EXCEPTION '0102 notification typed target cut blocked: % must be an ISO timestamp', context_label;
                END;
            END;
            $$;

            CREATE OR REPLACE FUNCTION notification_0102_meta_uuid(
                metadata JSONB,
                candidate_keys TEXT[],
                context_label TEXT
            ) RETURNS UUID
            LANGUAGE plpgsql
            IMMUTABLE
            AS $$
            DECLARE
                candidate_key TEXT;
                selected_value JSONB;
                matches INTEGER := 0;
            BEGIN
                IF jsonb_typeof(metadata) <> 'object' THEN
                    RAISE EXCEPTION '0102 notification typed target cut blocked: % metadata must be an object', context_label;
                END IF;
                FOREACH candidate_key IN ARRAY candidate_keys LOOP
                    IF metadata ? candidate_key THEN
                        matches := matches + 1;
                        selected_value := metadata -> candidate_key;
                    END IF;
                END LOOP;
                IF matches <> 1 THEN
                    RAISE EXCEPTION '0102 notification typed target cut blocked: % requires one unambiguous entity id', context_label;
                END IF;
                RETURN notification_0102_require_uuid(selected_value, context_label);
            END;
            $$;

            CREATE OR REPLACE FUNCTION notification_0102_static_target(
                legacy_route TEXT,
                context_label TEXT
            ) RETURNS JSONB
            LANGUAGE plpgsql
            IMMUTABLE
            AS $$
            BEGIN
                IF legacy_route IS NULL
                   OR legacy_route <> BTRIM(legacy_route)
                   OR legacy_route !~ '^/'
                   OR POSITION('//' IN legacy_route) > 0 THEN
                    RAISE EXCEPTION '0102 notification typed target cut blocked: % has an invalid legacy route', context_label;
                END IF;
                IF legacy_route LIKE '/w/%' OR legacy_route LIKE '/o/%' THEN
                    RAISE EXCEPTION '0102 notification typed target cut blocked: % uses a retired scoped route', context_label;
                END IF;

                IF legacy_route = '/notifications' THEN
                    RETURN jsonb_build_object('kind', 'inbox');
                END IF;
                IF legacy_route IN ('/settings/team/members', '/settings/people') THEN
                    RETURN jsonb_build_object(
                        'kind', 'workspace_settings',
                        'destination', 'people',
                        'section', 'members-table'
                    );
                END IF;
                IF legacy_route IN ('/settings/team/invitations', '/settings/people/pending') THEN
                    RETURN jsonb_build_object(
                        'kind', 'workspace_settings',
                        'destination', 'people',
                        'section', 'pending-invitations'
                    );
                END IF;
                IF legacy_route IN ('/settings/team/roles', '/settings/roles') THEN
                    RETURN jsonb_build_object(
                        'kind', 'workspace_settings',
                        'destination', 'roles',
                        'section', 'roles-table'
                    );
                END IF;
                IF legacy_route IN ('/settings/general', '/settings/workspace/general') THEN
                    RETURN jsonb_build_object('kind', 'workspace_settings', 'destination', 'general');
                END IF;
                IF legacy_route IN ('/settings/billing', '/settings/plan', '/settings/plan-usage') THEN
                    RETURN jsonb_build_object('kind', 'workspace_settings', 'destination', 'plan_usage');
                END IF;
                RAISE EXCEPTION '0102 notification typed target cut blocked: % has no typed route mapping for "%"', context_label, legacy_route;
            END;
            $$;

            CREATE OR REPLACE FUNCTION notification_0102_action(
                action JSONB,
                context_label TEXT
            ) RETURNS JSONB
            LANGUAGE plpgsql
            IMMUTABLE
            AS $$
            DECLARE
                action_kind TEXT;
                action_label TEXT;
                action_target TEXT;
            BEGIN
                PERFORM notification_0102_assert_object_keys(
                    action,
                    ARRAY['kind', 'label', 'target'],
                    context_label
                );
                action_kind := notification_0102_require_text(action -> 'kind', context_label || '.kind', 1, 32);
                action_label := notification_0102_require_text(action -> 'label', context_label || '.label', 1, 80);
                action_target := notification_0102_require_text(action -> 'target', context_label || '.target', 1, 1024);

                IF action_kind = 'internal_route' THEN
                    RETURN jsonb_build_object(
                        'kind', 'internal_route',
                        'label', action_label,
                        'target', notification_0102_static_target(action_target, context_label || '.target')
                    );
                END IF;
                IF action_kind = 'external_https' THEN
                    IF action_target !~ '^https://[^/@?#]+(:[0-9]+)?([/?#].*)?$' THEN
                        RAISE EXCEPTION '0102 notification typed target cut blocked: % has an invalid HTTPS action target', context_label;
                    END IF;
                    RETURN jsonb_build_object(
                        'kind', 'external_https',
                        'label', action_label,
                        'target', action_target
                    );
                END IF;
                RAISE EXCEPTION '0102 notification typed target cut blocked: % has an unsupported action kind', context_label;
            END;
            $$;

            CREATE OR REPLACE FUNCTION notification_0102_media(
                media JSONB,
                context_label TEXT
            ) RETURNS VOID
            LANGUAGE plpgsql
            IMMUTABLE
            AS $$
            BEGIN
                PERFORM notification_0102_assert_object_keys(
                    media,
                    ARRAY['asset_id', 'kind', 'alt_text', 'poster_asset_id', 'captions_asset_id'],
                    context_label
                );
                PERFORM notification_0102_require_identifier(media -> 'asset_id', context_label || '.asset_id');
                IF notification_0102_require_text(media -> 'kind', context_label || '.kind', 1, 16) NOT IN ('image', 'video') THEN
                    RAISE EXCEPTION '0102 notification typed target cut blocked: % has an invalid media kind', context_label;
                END IF;
                PERFORM notification_0102_require_text(media -> 'alt_text', context_label || '.alt_text', 1, 256);
                IF media ? 'poster_asset_id' AND jsonb_typeof(media -> 'poster_asset_id') <> 'null' THEN
                    PERFORM notification_0102_require_identifier(media -> 'poster_asset_id', context_label || '.poster_asset_id');
                END IF;
                IF media ? 'captions_asset_id' AND jsonb_typeof(media -> 'captions_asset_id') <> 'null' THEN
                    PERFORM notification_0102_require_identifier(media -> 'captions_asset_id', context_label || '.captions_asset_id');
                END IF;
            END;
            $$;

            CREATE OR REPLACE FUNCTION notification_0102_campaign_payload(
                presentation TEXT,
                payload JSONB,
                context_label TEXT
            ) RETURNS JSONB
            LANGUAGE plpgsql
            IMMUTABLE
            AS $$
            DECLARE
                result JSONB := payload;
                severity TEXT;
                dismiss_policy TEXT;
            BEGIN
                IF presentation = 'inbox' THEN
                    PERFORM notification_0102_assert_object_keys(
                        payload,
                        ARRAY['title', 'body', 'severity', 'action'],
                        context_label
                    );
                    PERFORM notification_0102_require_text(payload -> 'title', context_label || '.title', 1, 256);
                    IF payload ? 'body' AND jsonb_typeof(payload -> 'body') <> 'null' THEN
                        PERFORM notification_0102_require_text(payload -> 'body', context_label || '.body', 0, 512);
                    END IF;
                    IF payload ? 'severity' THEN
                        severity := notification_0102_require_text(payload -> 'severity', context_label || '.severity', 1, 16);
                        IF severity NOT IN ('info', 'success', 'warning', 'error') THEN
                            RAISE EXCEPTION '0102 notification typed target cut blocked: % has an invalid severity', context_label;
                        END IF;
                    END IF;
                    IF payload ? 'action' AND jsonb_typeof(payload -> 'action') <> 'null' THEN
                        result := jsonb_set(
                            result,
                            ARRAY['action'],
                            notification_0102_action(payload -> 'action', context_label || '.action')
                        );
                    END IF;
                    RETURN result;
                END IF;

                IF presentation = 'modal' THEN
                    PERFORM notification_0102_assert_object_keys(
                        payload,
                        ARRAY['title', 'body', 'media', 'primary_action', 'secondary_action', 'dismiss_policy'],
                        context_label
                    );
                    PERFORM notification_0102_require_text(payload -> 'title', context_label || '.title', 1, 256);
                    PERFORM notification_0102_require_text(payload -> 'body', context_label || '.body', 1, 4000);
                    IF payload ? 'media' AND jsonb_typeof(payload -> 'media') <> 'null' THEN
                        PERFORM notification_0102_media(payload -> 'media', context_label || '.media');
                    END IF;
                    result := jsonb_set(
                        result,
                        ARRAY['primary_action'],
                        notification_0102_action(payload -> 'primary_action', context_label || '.primary_action')
                    );
                    IF payload ? 'secondary_action' AND jsonb_typeof(payload -> 'secondary_action') <> 'null' THEN
                        result := jsonb_set(
                            result,
                            ARRAY['secondary_action'],
                            notification_0102_action(payload -> 'secondary_action', context_label || '.secondary_action')
                        );
                    END IF;
                    IF payload ? 'dismiss_policy' THEN
                        dismiss_policy := notification_0102_require_text(
                            payload -> 'dismiss_policy',
                            context_label || '.dismiss_policy',
                            1,
                            32
                        );
                        IF dismiss_policy NOT IN ('dismissible', 'action_required') THEN
                            RAISE EXCEPTION '0102 notification typed target cut blocked: % has an invalid dismiss policy', context_label;
                        END IF;
                    END IF;
                    RETURN result;
                END IF;

                IF presentation = 'banner' THEN
                    PERFORM notification_0102_assert_object_keys(
                        payload,
                        ARRAY['title', 'body', 'action', 'dismissible'],
                        context_label
                    );
                    PERFORM notification_0102_require_text(payload -> 'title', context_label || '.title', 1, 160);
                    IF payload ? 'body' AND jsonb_typeof(payload -> 'body') <> 'null' THEN
                        PERFORM notification_0102_require_text(payload -> 'body', context_label || '.body', 0, 320);
                    END IF;
                    IF payload ? 'dismissible' AND jsonb_typeof(payload -> 'dismissible') <> 'boolean' THEN
                        RAISE EXCEPTION '0102 notification typed target cut blocked: % has an invalid dismissible flag', context_label;
                    END IF;
                    IF payload ? 'action' AND jsonb_typeof(payload -> 'action') <> 'null' THEN
                        result := jsonb_set(
                            result,
                            ARRAY['action'],
                            notification_0102_action(payload -> 'action', context_label || '.action')
                        );
                    END IF;
                    RETURN result;
                END IF;

                IF presentation = 'toast' THEN
                    PERFORM notification_0102_assert_object_keys(
                        payload,
                        ARRAY['title', 'body', 'action'],
                        context_label
                    );
                    PERFORM notification_0102_require_text(payload -> 'title', context_label || '.title', 1, 160);
                    IF payload ? 'body' AND jsonb_typeof(payload -> 'body') <> 'null' THEN
                        PERFORM notification_0102_require_text(payload -> 'body', context_label || '.body', 0, 320);
                    END IF;
                    IF payload ? 'action' AND jsonb_typeof(payload -> 'action') <> 'null' THEN
                        result := jsonb_set(
                            result,
                            ARRAY['action'],
                            notification_0102_action(payload -> 'action', context_label || '.action')
                        );
                    END IF;
                    RETURN result;
                END IF;

                RAISE EXCEPTION '0102 notification typed target cut blocked: % has an unsupported presentation', context_label;
            END;
            $$;

            CREATE OR REPLACE FUNCTION notification_0102_campaign_surface(
                metadata JSONB,
                context_label TEXT
            ) RETURNS JSONB
            LANGUAGE plpgsql
            STABLE
            AS $$
            DECLARE
                campaign_id UUID;
                delivery_id UUID;
                presentation TEXT;
                priority_text TEXT;
                priority_value INTEGER;
                payload JSONB;
            BEGIN
                PERFORM notification_0102_assert_object_keys(
                    metadata,
                    ARRAY[
                        'campaignId', 'deliveryId', 'presentation', 'priority',
                        'displayStartAt', 'displayEndAt', 'scheduleAt', 'payload'
                    ],
                    context_label
                );
                campaign_id := notification_0102_meta_uuid(metadata, ARRAY['campaignId'], context_label || '.campaignId');
                delivery_id := notification_0102_meta_uuid(metadata, ARRAY['deliveryId'], context_label || '.deliveryId');
                presentation := notification_0102_require_text(
                    metadata -> 'presentation',
                    context_label || '.presentation',
                    1,
                    16
                );
                IF presentation NOT IN ('inbox', 'modal', 'banner', 'toast') THEN
                    RAISE EXCEPTION '0102 notification typed target cut blocked: % has an invalid presentation', context_label;
                END IF;
                IF jsonb_typeof(metadata -> 'priority') <> 'number' THEN
                    RAISE EXCEPTION '0102 notification typed target cut blocked: % has a non-integer priority', context_label;
                END IF;
                priority_text := metadata ->> 'priority';
                IF priority_text !~ '^-?[0-9]+$' THEN
                    RAISE EXCEPTION '0102 notification typed target cut blocked: % has a non-integer priority', context_label;
                END IF;
                priority_value := priority_text::INTEGER;
                IF priority_value < -100 OR priority_value > 100 THEN
                    RAISE EXCEPTION '0102 notification typed target cut blocked: % has an out-of-range priority', context_label;
                END IF;
                PERFORM notification_0102_optional_timestamp(metadata -> 'displayStartAt', context_label || '.displayStartAt');
                PERFORM notification_0102_optional_timestamp(metadata -> 'displayEndAt', context_label || '.displayEndAt');
                PERFORM notification_0102_optional_timestamp(metadata -> 'scheduleAt', context_label || '.scheduleAt');
                payload := notification_0102_campaign_payload(presentation, metadata -> 'payload', context_label || '.payload');

                RETURN jsonb_build_object(
                    'campaignId', campaign_id::TEXT,
                    'deliveryId', delivery_id::TEXT,
                    'presentation', presentation,
                    'priority', priority_value,
                    'displayStartAt', COALESCE(metadata -> 'displayStartAt', 'null'::JSONB),
                    'displayEndAt', COALESCE(metadata -> 'displayEndAt', 'null'::JSONB),
                    'payload', payload
                );
            END;
            $$;

            CREATE OR REPLACE FUNCTION notification_0102_record_target(
                legacy_route TEXT,
                metadata JSONB,
                notification_workspace_id UUID,
                notification_event_name TEXT,
                context_label TEXT
            ) RETURNS JSONB
            LANGUAGE plpgsql
            AS $$
            DECLARE
                project_id UUID;
                entity_id UUID;
                ticket_id UUID;
            BEGIN
                -- Dev seeds are intentionally retired fixtures rather than live
                -- navigation data. Their historical maintenance routes have no
                -- Product Application equivalent, so every dev.seed record is
                -- explicitly converted to the inbox target.
                IF notification_event_name = 'dev.seed' THEN
                    RETURN jsonb_build_object('kind', 'inbox');
                END IF;

                IF legacy_route = '/settings/team/members'
                   AND notification_event_name LIKE 'workspace.invite.email.%' THEN
                    RETURN jsonb_build_object(
                        'kind', 'workspace_settings',
                        'destination', 'people',
                        'section', 'pending-invitations'
                    );
                END IF;

                IF legacy_route IN (
                    '/notifications',
                    '/settings/team/members',
                    '/settings/people',
                    '/settings/team/invitations',
                    '/settings/people/pending',
                    '/settings/team/roles',
                    '/settings/roles',
                    '/settings/general',
                    '/settings/workspace/general',
                    '/settings/billing',
                    '/settings/plan',
                    '/settings/plan-usage'
                ) THEN
                    RETURN notification_0102_static_target(legacy_route, context_label);
                END IF;

                IF legacy_route IN ('/feedback', '/feedback/tickets')
                   AND notification_event_name = 'feedback.ticket.reply' THEN
                    ticket_id := notification_0102_meta_uuid(
                        metadata,
                        ARRAY['ticketId', 'ticket_id', 'feedbackTicketId'],
                        context_label || '.ticketId'
                    );
                    IF to_regclass('public.product_feedback_tickets') IS NULL THEN
                        RAISE EXCEPTION '0102 notification typed target cut blocked: % cannot verify feedback ticket', context_label;
                    END IF;
                    IF NOT EXISTS (
                        SELECT 1
                        FROM product_feedback_tickets AS ticket
                        WHERE ticket.id = ticket_id
                          AND (ticket.workspace_id IS NULL OR ticket.workspace_id = notification_workspace_id)
                    ) THEN
                        RAISE EXCEPTION '0102 notification typed target cut blocked: % has no workspace-consistent feedback ticket', context_label;
                    END IF;
                    RETURN jsonb_build_object('kind', 'feedback_ticket', 'ticketId', ticket_id::TEXT);
                END IF;

                IF legacy_route = '/settings/api-keys'
                   AND notification_event_name IN ('project.api_key.rotated', 'project.api_key.revoked') THEN
                    project_id := notification_0102_meta_uuid(
                        metadata,
                        ARRAY['projectId', 'project_id'],
                        context_label || '.projectId'
                    );
                    entity_id := notification_0102_meta_uuid(
                        metadata,
                        ARRAY['entityId', 'entity_id', 'apiKeyId'],
                        context_label || '.entityId'
                    );
                    IF to_regclass('public.api_keys') IS NULL
                       OR to_regclass('public.sites') IS NULL
                       OR to_regclass('public.projects') IS NULL THEN
                        RAISE EXCEPTION '0102 notification typed target cut blocked: % cannot verify API key ownership', context_label;
                    END IF;
                    IF NOT EXISTS (
                        SELECT 1
                        FROM api_keys AS api_key
                        JOIN sites AS site ON site.id = api_key.site_id
                        JOIN projects AS project ON project.id = site.project_id
                        WHERE api_key.id = entity_id
                          AND project.id = project_id
                          AND api_key.workspace_id = notification_workspace_id
                          AND site.workspace_id = notification_workspace_id
                          AND project.workspace_id = notification_workspace_id
                    ) THEN
                        RAISE EXCEPTION '0102 notification typed target cut blocked: % has no workspace-consistent API key and project', context_label;
                    END IF;
                    RETURN jsonb_build_object(
                        'kind', 'project',
                        'projectId', project_id::TEXT,
                        'destination', 'settings_api',
                        'entityId', entity_id::TEXT,
                        'focus', 'api_key'
                    );
                END IF;

                IF legacy_route = '/settings/content'
                   AND notification_event_name = 'project.preview_token.created' THEN
                    project_id := notification_0102_meta_uuid(
                        metadata,
                        ARRAY['projectId', 'project_id'],
                        context_label || '.projectId'
                    );
                    entity_id := notification_0102_meta_uuid(
                        metadata,
                        ARRAY['entityId', 'entity_id', 'siteId', 'site_id'],
                        context_label || '.entityId'
                    );
                    IF to_regclass('public.sites') IS NULL OR to_regclass('public.projects') IS NULL THEN
                        RAISE EXCEPTION '0102 notification typed target cut blocked: % cannot verify preview token site ownership', context_label;
                    END IF;
                    IF NOT EXISTS (
                        SELECT 1
                        FROM sites AS site
                        JOIN projects AS project ON project.id = site.project_id
                        WHERE site.id = entity_id
                          AND project.id = project_id
                          AND site.workspace_id = notification_workspace_id
                          AND project.workspace_id = notification_workspace_id
                    ) THEN
                        RAISE EXCEPTION '0102 notification typed target cut blocked: % has no workspace-consistent preview token site and project', context_label;
                    END IF;
                    RETURN jsonb_build_object(
                        'kind', 'project',
                        'projectId', project_id::TEXT,
                        'destination', 'settings_api',
                        'entityId', entity_id::TEXT,
                        'focus', 'preview_token'
                    );
                END IF;

                IF legacy_route = '/settings/content'
                   AND notification_event_name = 'project.content.item.workflow.updated' THEN
                    project_id := notification_0102_meta_uuid(
                        metadata,
                        ARRAY['projectId', 'project_id'],
                        context_label || '.projectId'
                    );
                    entity_id := notification_0102_meta_uuid(
                        metadata,
                        ARRAY['entityId', 'entity_id', 'itemId', 'item_id'],
                        context_label || '.entityId'
                    );
                    IF to_regclass('public.content_items') IS NULL
                       OR to_regclass('public.sites') IS NULL
                       OR to_regclass('public.projects') IS NULL THEN
                        RAISE EXCEPTION '0102 notification typed target cut blocked: % cannot verify content item ownership', context_label;
                    END IF;
                    IF NOT EXISTS (
                        SELECT 1
                        FROM content_items AS item
                        JOIN sites AS site ON site.id = item.site_id
                        JOIN projects AS project ON project.id = site.project_id
                        WHERE item.id = entity_id
                          AND project.id = project_id
                          AND item.workspace_id = notification_workspace_id
                          AND site.workspace_id = notification_workspace_id
                          AND project.workspace_id = notification_workspace_id
                    ) THEN
                        RAISE EXCEPTION '0102 notification typed target cut blocked: % has no workspace-consistent content item and project', context_label;
                    END IF;
                    RETURN jsonb_build_object(
                        'kind', 'project',
                        'projectId', project_id::TEXT,
                        'destination', 'content_library',
                        'entityId', entity_id::TEXT,
                        'focus', 'content_item'
                    );
                END IF;

                IF legacy_route = '/content/releases'
                   AND notification_event_name IN (
                       'project.release.scheduled_publish.completed',
                       'project.release.scheduled_publish.failed'
                   ) THEN
                    entity_id := notification_0102_meta_uuid(
                        metadata,
                        ARRAY['releaseId', 'release_id', 'entityId', 'entity_id'],
                        context_label || '.releaseId'
                    );
                    IF to_regclass('public.content_releases') IS NULL
                       OR to_regclass('public.sites') IS NULL
                       OR to_regclass('public.projects') IS NULL THEN
                        RAISE EXCEPTION '0102 notification typed target cut blocked: % cannot verify release ownership', context_label;
                    END IF;
                    SELECT project.id
                    INTO project_id
                    FROM content_releases AS release
                    JOIN sites AS site ON site.id = release.site_id
                    JOIN projects AS project ON project.id = site.project_id
                    WHERE release.id = entity_id
                      AND release.workspace_id = notification_workspace_id
                      AND site.workspace_id = notification_workspace_id
                      AND project.workspace_id = notification_workspace_id;
                    IF NOT FOUND OR project_id IS NULL THEN
                        RAISE EXCEPTION '0102 notification typed target cut blocked: % has no workspace-consistent release and project', context_label;
                    END IF;
                    RETURN jsonb_build_object(
                        'kind', 'project',
                        'projectId', project_id::TEXT,
                        'destination', 'website_releases',
                        'entityId', entity_id::TEXT,
                        'focus', 'release'
                    );
                END IF;

                RETURN notification_0102_static_target(legacy_route, context_label);
            END;
            $$;

            CREATE OR REPLACE FUNCTION notification_0102_automation_config(
                config JSONB,
                context_label TEXT
            ) RETURNS JSONB
            LANGUAGE plpgsql
            IMMUTABLE
            AS $$
            DECLARE
                target_route JSONB;
                legacy_target_count INTEGER := 0;
                result JSONB;
            BEGIN
                IF config IS NULL OR jsonb_typeof(config) <> 'object' THEN
                    RAISE EXCEPTION '0102 notification typed target cut blocked: % must be an object', context_label;
                END IF;
                IF config ? 'target' THEN
                    RAISE EXCEPTION '0102 notification typed target cut blocked: % contains both a typed and legacy target', context_label;
                END IF;
                IF config ? 'targetTo' THEN
                    legacy_target_count := legacy_target_count + 1;
                    target_route := config -> 'targetTo';
                END IF;
                IF config ? 'target_to' THEN
                    legacy_target_count := legacy_target_count + 1;
                    target_route := config -> 'target_to';
                END IF;
                IF legacy_target_count <> 1 THEN
                    RAISE EXCEPTION '0102 notification typed target cut blocked: % requires exactly one legacy target route', context_label;
                END IF;
                IF (config ? 'targetMeta' AND config -> 'targetMeta' <> 'null'::JSONB)
                   OR (config ? 'target_meta' AND config -> 'target_meta' <> 'null'::JSONB) THEN
                    RAISE EXCEPTION '0102 notification typed target cut blocked: % has legacy target metadata that cannot be converted without loss', context_label;
                END IF;
                result := config - 'targetTo' - 'targetMeta' - 'target_to' - 'target_meta';
                RETURN result || jsonb_build_object(
                    'target',
                    notification_0102_static_target(
                        notification_0102_require_text(target_route, context_label || '.targetTo', 1, 512),
                        context_label || '.targetTo'
                    )
                );
            END;
            $$;

            DO $$
            DECLARE
                notification_row RECORD;
                operation_row RECORD;
                variant_row RECORD;
            BEGIN
                FOR notification_row IN
                    SELECT id, workspace_id, target_to, target_meta, event_name
                    FROM system_notifications
                LOOP
                    PERFORM notification_0102_record_target(
                        notification_row.target_to,
                        notification_row.target_meta,
                        notification_row.workspace_id,
                        notification_row.event_name,
                        format('system_notifications[%s]', notification_row.id)
                    );
                    IF notification_row.event_name = 'system.broadcast' THEN
                        PERFORM notification_0102_campaign_surface(
                            notification_row.target_meta,
                            format('system_notifications[%s].campaign_surface', notification_row.id)
                        );
                    END IF;
                END LOOP;

                FOR operation_row IN
                    SELECT id, config
                    FROM automation_operations
                    WHERE kind = 'notification'
                LOOP
                    PERFORM notification_0102_automation_config(
                        operation_row.config,
                        format('automation_operations[%s].config', operation_row.id)
                    );
                END LOOP;

                FOR variant_row IN
                    SELECT id, inbox_payload, modal_payload, banner_payload, toast_payload
                    FROM notification_campaign_variants
                LOOP
                    IF variant_row.inbox_payload IS NOT NULL THEN
                        PERFORM notification_0102_campaign_payload(
                            'inbox',
                            variant_row.inbox_payload,
                            format('notification_campaign_variants[%s].inbox_payload', variant_row.id)
                        );
                    END IF;
                    IF variant_row.modal_payload IS NOT NULL THEN
                        PERFORM notification_0102_campaign_payload(
                            'modal',
                            variant_row.modal_payload,
                            format('notification_campaign_variants[%s].modal_payload', variant_row.id)
                        );
                    END IF;
                    IF variant_row.banner_payload IS NOT NULL THEN
                        PERFORM notification_0102_campaign_payload(
                            'banner',
                            variant_row.banner_payload,
                            format('notification_campaign_variants[%s].banner_payload', variant_row.id)
                        );
                    END IF;
                    IF variant_row.toast_payload IS NOT NULL THEN
                        PERFORM notification_0102_campaign_payload(
                            'toast',
                            variant_row.toast_payload,
                            format('notification_campaign_variants[%s].toast_payload', variant_row.id)
                        );
                    END IF;
                END LOOP;
            END;
            $$;

            ALTER TABLE system_notifications
                ADD COLUMN target JSONB,
                ADD COLUMN campaign_surface JSONB;

            UPDATE system_notifications
            SET
                target = notification_0102_record_target(
                    target_to,
                    target_meta,
                    workspace_id,
                    event_name,
                    format('system_notifications[%s]', id)
                ),
                campaign_surface = CASE
                    WHEN event_name = 'system.broadcast' THEN notification_0102_campaign_surface(
                        target_meta,
                        format('system_notifications[%s].campaign_surface', id)
                    )
                    ELSE NULL
                END;

            ALTER TABLE system_notifications
                ALTER COLUMN target SET NOT NULL,
                DROP COLUMN target_to,
                DROP COLUMN target_meta;

            UPDATE automation_operations
            SET config = notification_0102_automation_config(
                config,
                format('automation_operations[%s].config', id)
            )
            WHERE kind = 'notification';

            UPDATE notification_campaign_variants
            SET
                inbox_payload = CASE
                    WHEN inbox_payload IS NULL THEN NULL
                    ELSE notification_0102_campaign_payload(
                        'inbox',
                        inbox_payload,
                        format('notification_campaign_variants[%s].inbox_payload', id)
                    )
                END,
                modal_payload = CASE
                    WHEN modal_payload IS NULL THEN NULL
                    ELSE notification_0102_campaign_payload(
                        'modal',
                        modal_payload,
                        format('notification_campaign_variants[%s].modal_payload', id)
                    )
                END,
                banner_payload = CASE
                    WHEN banner_payload IS NULL THEN NULL
                    ELSE notification_0102_campaign_payload(
                        'banner',
                        banner_payload,
                        format('notification_campaign_variants[%s].banner_payload', id)
                    )
                END,
                toast_payload = CASE
                    WHEN toast_payload IS NULL THEN NULL
                    ELSE notification_0102_campaign_payload(
                        'toast',
                        toast_payload,
                        format('notification_campaign_variants[%s].toast_payload', id)
                    )
                END;

            DROP FUNCTION notification_0102_automation_config(JSONB, TEXT);
            DROP FUNCTION notification_0102_record_target(TEXT, JSONB, UUID, TEXT, TEXT);
            DROP FUNCTION notification_0102_campaign_surface(JSONB, TEXT);
            DROP FUNCTION notification_0102_campaign_payload(TEXT, JSONB, TEXT);
            DROP FUNCTION notification_0102_media(JSONB, TEXT);
            DROP FUNCTION notification_0102_action(JSONB, TEXT);
            DROP FUNCTION notification_0102_static_target(TEXT, TEXT);
            DROP FUNCTION notification_0102_meta_uuid(JSONB, TEXT[], TEXT);
            DROP FUNCTION notification_0102_optional_timestamp(JSONB, TEXT);
            DROP FUNCTION notification_0102_assert_object_keys(JSONB, TEXT[], TEXT);
            DROP FUNCTION notification_0102_require_identifier(JSONB, TEXT);
            DROP FUNCTION notification_0102_require_uuid(JSONB, TEXT);
            DROP FUNCTION notification_0102_require_text(JSONB, TEXT, INTEGER, INTEGER);
            """
        )
    ]
