from __future__ import annotations

from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from sentry_sdk import init as sentry_init
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from apps.api.config import Settings
from apps.api.core.logging import get_logger

logger = get_logger(__name__)


def configure_observability(app: FastAPI, settings: Settings) -> None:
    obs = settings.observability

    if obs.sentry_enabled:
        if not obs.sentry_dsn:
            logger.warning("Sentry enabled without valid DSN")
        else:
            sentry_init(
                dsn=obs.sentry_dsn,
                environment=obs.sentry_environment or settings.app_env,
                release=obs.sentry_release,
                traces_sample_rate=obs.sentry_traces_sample_rate,
                profiles_sample_rate=obs.sentry_profiles_sample_rate,
                send_default_pii=obs.sentry_send_pii,
                integrations=[FastApiIntegration(), StarletteIntegration()],
            )

    if obs.metrics_enabled:
        instrumentator = Instrumentator(
            should_group_status_codes=False,
            should_ignore_untemplated=True,
        )
        instrumentator.instrument(app).expose(
            app,
            endpoint=obs.metrics_path,
            include_in_schema=obs.metrics_include_in_schema,
        )
