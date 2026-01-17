import logging
import sys
from typing import Any

import structlog
from asgi_correlation_id import correlation_id
from structlog.contextvars import merge_contextvars
from structlog.processors import JSONRenderer, StackInfoRenderer, TimeStamper, add_log_level, format_exc_info
from structlog.stdlib import BoundLogger, LoggerFactory, ProcessorFormatter, add_logger_name

from apps.api.config import Settings


def _add_correlation_id(logger: BoundLogger, method_name: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    cid = correlation_id.get(None)
    if cid:
        event_dict["correlation_id"] = cid
    return event_dict


def _normalize_console_fields(logger: BoundLogger, method_name: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    logger_name = event_dict.get("logger") or "-"
    event_dict["logger"] = logger_name

    correlation = event_dict.get("correlation_id")
    if not correlation:
        event_dict["correlation_id"] = "-"
    else:
        correlation = str(correlation)
        event_dict["correlation_id"] = correlation
    return event_dict


def _build_console_renderer() -> structlog.dev.ConsoleRenderer:
    styles = structlog.dev.ConsoleRenderer.get_default_column_styles(colors=True)
    level_styles = structlog.dev.ConsoleRenderer.get_default_level_styles(colors=True)

    columns = [
        structlog.dev.Column(
            "timestamp",
            structlog.dev.KeyValueColumnFormatter(
                key_style=None,
                value_style=styles.timestamp,
                reset_style=styles.reset,
                value_repr=str,
            ),
        ),
        structlog.dev.Column(
            "level",
            structlog.dev.LogLevelColumnFormatter(
                level_styles=level_styles,
                reset_style=styles.reset,
            ),
        ),
        structlog.dev.Column(
            "logger",
            structlog.dev.KeyValueColumnFormatter(
                key_style=None,
                value_style=styles.logger_name,
                reset_style=styles.reset,
                value_repr=str,
            ),
        ),
        structlog.dev.Column(
            "correlation_id",
            structlog.dev.KeyValueColumnFormatter(
                key_style=None,
                value_style=styles.logger_name,
                reset_style=styles.reset,
                value_repr=str,
            ),
        ),
        structlog.dev.Column(
            "event",
            structlog.dev.KeyValueColumnFormatter(
                key_style=None,
                value_style=styles.reset,
                reset_style=styles.reset,
                value_repr=str,
            ),
        ),
        structlog.dev.Column(
            "",
            structlog.dev.KeyValueColumnFormatter(
                key_style=styles.kv_key,
                value_style=styles.kv_value,
                reset_style=styles.reset,
                value_repr=str,
            ),
        ),
    ]

    return structlog.dev.ConsoleRenderer(columns=columns, colors=True, sort_keys=False)


def configure_logging(settings: Settings) -> None:
    timestamper = TimeStamper(fmt="%Y-%m-%d %H:%M:%S", utc=False)
    base_processors = [
        merge_contextvars,
        _add_correlation_id,
        add_log_level,
        add_logger_name,
        timestamper,
    ]

    use_json = settings.logging.json_logs if settings.logging.json_logs is not None else not settings.debug

    if use_json:
        renderer = JSONRenderer()
        processors = [
            *base_processors,
            StackInfoRenderer(),
            format_exc_info,
            ProcessorFormatter.wrap_for_formatter,
        ]
        foreign_pre_chain = base_processors
    else:
        renderer = _build_console_renderer()
        processors = [
            *base_processors,
            StackInfoRenderer(),
            _normalize_console_fields,
            ProcessorFormatter.wrap_for_formatter,
        ]
        foreign_pre_chain = [*base_processors, _normalize_console_fields]

    formatter = ProcessorFormatter(
        processor=renderer,
        foreign_pre_chain=foreign_pre_chain,
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(settings.logging.level)
    root_logger.propagate = False

    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logging.getLogger(name).handlers = []
        logging.getLogger(name).propagate = True

    structlog.configure(
        processors=processors,
        logger_factory=LoggerFactory(),
        wrapper_class=BoundLogger,
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None) -> BoundLogger:
    return structlog.get_logger(name)
