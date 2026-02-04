import logging
import sys
import time
from logging.handlers import QueueHandler, QueueListener, TimedRotatingFileHandler
from pathlib import Path
from queue import SimpleQueue
from typing import Any, cast

import structlog
from asgi_correlation_id import correlation_id
from structlog.contextvars import merge_contextvars
from structlog.processors import JSONRenderer, StackInfoRenderer, TimeStamper, add_log_level, format_exc_info
from structlog.stdlib import (
    BoundLogger,
    LoggerFactory,
    PositionalArgumentsFormatter,
    ProcessorFormatter,
    add_logger_name,
)
from structlog.types import EventDict, Processor, WrappedLogger

from apps.api.common.utils.redact import redact
from apps.api.config import Settings


class _LoggerProxy:
    def __init__(self, name: str | None = None) -> None:
        self._name = name

    def __getattr__(self, item: str):
        return getattr(structlog.get_logger(self._name), item)


_listener: QueueListener | None = None


class _StructlogQueueHandler(QueueHandler):
    def prepare(self, record: logging.LogRecord) -> logging.LogRecord:
        return record


def _add_correlation_id(logger: WrappedLogger, method_name: str, event_dict: EventDict) -> EventDict:
    cid = correlation_id.get(None)
    if cid:
        # Use a single name everywhere (console/file/meta) to avoid "request_id vs trace_id" confusion.
        event_dict["trace_id"] = cid
    return event_dict


def _normalize_console_fields(logger: WrappedLogger, method_name: str, event_dict: EventDict) -> EventDict:
    # Keep console output compact:
    # - omit correlation_id when missing (do not render placeholder)
    # - keep logger as-is (will be rendered as a bracketed suffix after the event)
    correlation = event_dict.get("trace_id")
    if correlation:
        event_dict["trace_id"] = str(correlation)
    else:
        event_dict.pop("trace_id", None)
    return event_dict


def _redact_sensitive(logger: WrappedLogger, method_name: str, event_dict: EventDict) -> EventDict:
    """
    Best-effort log redaction.

    - Redacts known sensitive keys (password/token/secret/phone/id_card...)
    - Truncates overly long strings/arrays to keep logs bounded
    """

    cleaned = redact(event_dict)
    return cleaned if isinstance(cleaned, dict) else event_dict


def _ensure_event_dict(event_dict: EventDict) -> dict[str, Any]:
    # structlog's stubs use `EventDict` (MutableMapping) but in practice the runtime value is a `dict`.
    return event_dict if isinstance(event_dict, dict) else dict(event_dict)


def _merge_contextvars_processor(logger: WrappedLogger, method_name: str, event_dict: EventDict) -> EventDict:
    # structlog's type stubs for contextvars processors can be inconsistent across versions.
    # At runtime this returns a mapping; we cast to keep Pyright satisfied.
    return cast(EventDict, merge_contextvars(logger, method_name, _ensure_event_dict(event_dict)))


def _add_log_level_processor(logger: WrappedLogger, method_name: str, event_dict: EventDict) -> EventDict:
    return add_log_level(logger, method_name, _ensure_event_dict(event_dict))


def _add_logger_name_processor(logger: WrappedLogger, method_name: str, event_dict: EventDict) -> EventDict:
    # add_logger_name is a stdlib processor and expects a stdlib Logger in its stubs.
    return add_logger_name(cast(logging.Logger, logger), method_name, _ensure_event_dict(event_dict))


def _format_exc_info_processor(logger: WrappedLogger, method_name: str, event_dict: EventDict) -> EventDict:
    return format_exc_info(logger, method_name, _ensure_event_dict(event_dict))


def _wrap_for_formatter_processor(logger: WrappedLogger, method_name: str, event_dict: EventDict) -> Any:
    return ProcessorFormatter.wrap_for_formatter(
        cast(logging.Logger, logger), method_name, _ensure_event_dict(event_dict)
    )


def _remove_processors_meta_processor(logger: WrappedLogger, method_name: str, event_dict: EventDict) -> EventDict:
    return ProcessorFormatter.remove_processors_meta(
        cast(logging.Logger, logger), method_name, _ensure_event_dict(event_dict)
    )


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
            "trace_id",
            structlog.dev.KeyValueColumnFormatter(
                key_style=None,
                value_style=styles.logger_name,
                reset_style=styles.reset,
                value_repr=str,
                prefix="[",
                postfix="]",
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
            "logger",
            structlog.dev.KeyValueColumnFormatter(
                key_style=None,
                value_style=styles.logger_name,
                reset_style=styles.reset,
                value_repr=str,
                prefix="[",
                postfix="]",
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


def _add_exc_info_from_record(logger: WrappedLogger, method_name: str, event_dict: EventDict) -> EventDict:
    """
    Ensure exception/stack info is available to processors (renderer/format_exc_info)
    for structlog-originated records too.
    """

    payload = _ensure_event_dict(event_dict)
    record = payload.get("_record")
    if record is None:
        return payload
    try:
        exc_info = getattr(record, "exc_info", None)
        if exc_info and "exc_info" not in payload:
            payload["exc_info"] = exc_info
        stack_info = getattr(record, "stack_info", None)
        if stack_info and "stack_info" not in payload:
            payload["stack_info"] = stack_info
    except Exception:
        return payload
    return payload


def _parse_duration_seconds(value: str, *, min_value: int = 1) -> int:
    value = value.strip().lower()
    if value.isdigit():
        return max(min_value, int(value))

    units = {"s": 1, "m": 60, "h": 3600, "d": 86400, "w": 604800}
    number = ""
    unit = ""
    for ch in value:
        if ch.isdigit():
            number += ch
        elif ch.isalpha():
            unit += ch
        else:
            continue

    if not number or unit not in units:
        raise ValueError(f"Invalid duration format: {value}")

    return max(min_value, int(number) * units[unit])


def _cleanup_old_logs(log_dir: Path, base_filename: str, retention_seconds: int) -> None:
    if retention_seconds <= 0:
        return

    cutoff = time.time() - retention_seconds
    try:
        for path in sorted(
            (p for p in log_dir.glob(f"{base_filename}.*") if p.is_file()),
            key=lambda p: p.stat().st_mtime,
        ):
            if path.stat().st_mtime < cutoff:
                path.unlink(missing_ok=True)
    except OSError:
        return


def configure_logging(settings: Settings) -> None:
    timestamper = TimeStamper(fmt="%Y-%m-%d %H:%M:%S", utc=False)
    base_processors: list[Processor] = [
        _merge_contextvars_processor,
        _add_correlation_id,
        _add_log_level_processor,
        _add_logger_name_processor,
        PositionalArgumentsFormatter(),
        timestamper,
        _redact_sensitive,
    ]

    use_json = settings.logging.json_logs if settings.logging.json_logs is not None else not settings.debug

    if use_json:
        renderer = JSONRenderer()
        processors: list[Processor] = [
            *base_processors,
            StackInfoRenderer(),
            _format_exc_info_processor,
            _wrap_for_formatter_processor,
        ]
        foreign_pre_chain = base_processors
    else:
        renderer = _build_console_renderer()
        processors = [
            *base_processors,
            StackInfoRenderer(),
            _normalize_console_fields,
            _wrap_for_formatter_processor,
        ]
        foreign_pre_chain = [*base_processors, _normalize_console_fields]

    # Use handler-specific processors so we can keep pretty console tracebacks
    # while also producing full exception strings for JSON logs.
    if use_json:
        console_processors: list[Processor] = [
            _add_exc_info_from_record,
            _remove_processors_meta_processor,
            StackInfoRenderer(),
            _format_exc_info_processor,
            renderer,
        ]
    else:
        console_processors = [
            _add_exc_info_from_record,
            _remove_processors_meta_processor,
            renderer,
        ]

    console_formatter = ProcessorFormatter(
        processors=console_processors,
        foreign_pre_chain=foreign_pre_chain,
        keep_exc_info=True,
        keep_stack_info=True,
    )

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(settings.logging.level)
    console_handler.setFormatter(console_formatter)

    handlers: list[logging.Handler] = [console_handler]

    log_dir = settings.logging.log_dir
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / "app.log"
    rotation_seconds = _parse_duration_seconds(settings.logging.rotation, min_value=1)
    retention_seconds = _parse_duration_seconds(settings.logging.retention, min_value=0)

    file_handler = TimedRotatingFileHandler(
        log_path,
        when="S",
        interval=rotation_seconds,
        backupCount=0,
        encoding="utf-8",
        utc=True,
    )
    file_handler.suffix = "%Y-%m-%d_%H-%M-%S"
    file_formatter = ProcessorFormatter(
        processors=[
            _add_exc_info_from_record,
            _remove_processors_meta_processor,
            StackInfoRenderer(),
            _format_exc_info_processor,
            JSONRenderer(),
        ],
        foreign_pre_chain=base_processors,
        keep_exc_info=True,
        keep_stack_info=True,
    )
    file_handler.setLevel(settings.logging.level)
    file_handler.setFormatter(file_formatter)
    handlers.append(file_handler)

    root_logger = logging.getLogger()
    root_logger.setLevel(settings.logging.level)
    root_logger.propagate = False

    global _listener
    if _listener is not None:
        _listener.stop()
        _listener = None

    if settings.logging.async_enabled:
        queue = SimpleQueue()
        root_logger.handlers = [_StructlogQueueHandler(queue)]
        _listener = QueueListener(queue, *handlers, respect_handler_level=True)
        _listener.start()
    else:
        root_logger.handlers = handlers

    for name in ("uvicorn", "uvicorn.error"):
        logging.getLogger(name).handlers = []
        logging.getLogger(name).propagate = True

    if settings.logging.omit_uvicorn_access_logs:
        access_logger = logging.getLogger("uvicorn.access")
        access_logger.handlers = []
        access_logger.propagate = False
        access_logger.disabled = True
    else:
        access_logger = logging.getLogger("uvicorn.access")
        access_logger.handlers = []
        access_logger.propagate = True
        access_logger.disabled = False

    # Tortoise ORM logs can be extremely noisy (SQL/debug). Allow turning them off explicitly.
    if settings.logging.omit_tortoise_logs:
        tortoise_logger = logging.getLogger("tortoise")
        tortoise_logger.handlers = []
        tortoise_logger.propagate = False
        tortoise_logger.disabled = True
    else:
        tortoise_logger = logging.getLogger("tortoise")
        tortoise_logger.handlers = []
        tortoise_logger.propagate = True
        tortoise_logger.disabled = False

    # watchfiles can be extremely noisy (debug spam) in WSL/Docker bind mounts.
    # Keep root logger behavior unchanged; only raise watchfiles.* logger levels.
    try:
        watchfiles_level_name = str(settings.logging.watchfiles_level or "INFO").strip().upper()
        watchfiles_level = logging._nameToLevel.get(watchfiles_level_name, logging.INFO)
        for name in ("watchfiles", "watchfiles.main"):
            wf_logger = logging.getLogger(name)
            wf_logger.setLevel(watchfiles_level)
            wf_logger.handlers = []
            wf_logger.propagate = True
    except Exception:
        # Best-effort; never break app startup due to logger config.
        pass

    structlog.configure(
        processors=processors,
        logger_factory=LoggerFactory(),
        wrapper_class=BoundLogger,
        cache_logger_on_first_use=False,
    )

    _cleanup_old_logs(log_dir, log_path.name, retention_seconds)


def get_logger(name: str | None = None) -> BoundLogger:
    return structlog.get_logger(name)


logger = _LoggerProxy(__name__)
