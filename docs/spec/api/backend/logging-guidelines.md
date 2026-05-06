# Backend Logging Guidelines

This code-spec defines structured logging behavior for backend runtime, request middleware, and exception handlers.

## Scenario: Structured Request and Runtime Logging

### 1. Scope / Trigger

- Trigger: adding or changing backend logging in core runtime, middleware, exception handlers, platform adapters, or services.
- Applies to `structlog` configuration, request logs, exception logs, database/runtime startup logs, and any emitted log payloads that can escape to file or console.

### 2. Signatures

- Logger factory: `src.core.logging.get_logger(name: str | None = None) -> BoundLogger`
- Logging setup: `configure_logging(settings: Settings) -> None`
- Request middleware: `RequestLogMiddleware`
- Correlation helper: `trace_id`
- Renderer path: console and JSON renderers through `structlog`

### 3. Contracts

- Backend logging uses `structlog` as the primary structured logger.
- Logging configuration writes to stdout and a rotating file when enabled.
- All logs should carry the same trace identifier name: `trace_id`.
- Request middleware clears context vars between requests and binds the current trace id when present.
- Log redaction must run before rendering so sensitive fields do not reach stdout or the file sink.
- Exception handlers log stack traces with an explicit `exc_info` tuple so traceback capture survives handler boundaries.
- Request summary logs should include method, path, status, elapsed time, and stable error code/message fields when available.
- Do not log request bodies or raw auth headers in request summaries.
- Uvicorn and Tortoise logger handling is centralized in `configure_logging`; feature code should not reconfigure those loggers locally.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Missing trace id | Omit `trace_id` rather than emitting placeholder noise |
| Sensitive payload field reaches logger | Redaction must remove or mask it before render |
| Exception handler logs without traceback | Use the explicit exception tuple helper |
| Request completes successfully | Middleware emits an info-level summary log |
| Request returns 401 or 403 | Middleware emits an info-level rejection log |
| Request returns 4xx other than authz | Middleware emits a warning-level failure log |
| Request returns 5xx | Middleware emits an error-level failure log |
| Uvicorn access logs are omitted | Logger propagation is disabled for access logs |

### 5. Good/Base/Bad Cases

- Good: `logger.warning("HTTP request failed", method=..., path=..., status=..., error=...)`.
- Good: `logger.exception("APIError", exc_info=_exc_info_tuple(exc), ...)` inside the exception handler.
- Base: a startup log records that database or plugin initialization was skipped because a feature flag is disabled.
- Bad: logging a request body, password, token, or cookie value in a summary log.
- Bad: introducing a separate logger format for one service while the rest of the backend uses `structlog`.
- Bad: catching an exception and logging only `str(exc)` without stack context when the error is unexpected.

### 6. Tests Required

- Logging tests should assert that request summaries include the trace id and stable status/error fields.
- Redaction tests should verify that known sensitive keys are masked before rendering.
- Exception-handler tests should confirm that 500s log a stack trace while 4xx business failures do not over-log.
- Runtime tests should verify that startup logging does not break when watchfiles or Tortoise loggers are present.

### 7. Wrong vs Correct

#### Wrong

```python
logger.info("request", headers=request.headers, body=await request.body())
```

#### Correct

```python
logger.info(
    "HTTP request completed",
    method=request.method,
    path=request.url.path,
    status=status,
    elapsed_ms=elapsed_ms,
)
```

The request middleware and exception handlers are responsible for stable, structured fields. Feature code should not invent a second logging protocol.
