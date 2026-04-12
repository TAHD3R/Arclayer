from __future__ import annotations

from pathlib import Path
from typing import Any

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from apps.api.src.config import Settings
from apps.api.src.core.http.response import Response
from apps.api.src.settings.crypto import master_key_exists


class MasterKeyGuardMiddleware:
    """
    Fail-fast guard for missing master key.

    Why:
    - Secrets in system-scoped settings (e.g. storage/mail/oauth) rely on a stable master key.
    - When a master key is missing on an initialized instance, allowing the app to run until a
      secret-touching operation happens produces confusing, non-deterministic failures.

    Behavior:
    - If the instance is initialized and the master key is missing, reject requests with 503,
      except for a small allowlist of recovery endpoints.
    """

    def __init__(self, app: ASGIApp, *, settings: Settings) -> None:
        self.app = app
        self.settings = settings

        api_prefix = f"{settings.application.api_prefix}{settings.application.api_version_prefix}"
        self._allow_prefixes = (
            f"{api_prefix}/auth/",
            # Sys governance endpoints are part of the recovery surface: they must remain reachable
            # so super admins can step-up and repair misconfigured secrets.
            f"{api_prefix}/sys/",
        )
        self._allow_paths = {
            f"{api_prefix}/system/runtime",
            f"{settings.application.app_openapi_url or ''}".strip() or "/openapi.json",
        }

    def _is_allowed_path(self, path: str) -> bool:
        if not path:
            return True
        if path in self._allow_paths:
            return True
        return any(path.startswith(prefix) for prefix in self._allow_prefixes)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = str(scope.get("method") or "").upper()
        if method == "OPTIONS":
            await self.app(scope, receive, send)
            return

        path = str(scope.get("path") or "")
        if self._is_allowed_path(path):
            await self.app(scope, receive, send)
            return

        # Only enforce strict master-key requirement after the system is initialized.
        app = scope.get("app")
        initialized = bool(getattr(getattr(app, "state", None), "system_initialized", False))
        if not initialized:
            await self.app(scope, receive, send)
            return

        key_path = Path(self.settings.security.master_key_path)
        if master_key_exists(key_path):
            await self.app(scope, receive, send)
            return

        state: dict[str, Any] = scope.setdefault("state", {})  # for RequestLogMiddleware summary
        state["error_code"] = "MASTER_KEY_MISSING"
        state["error_message"] = "Master key missing: instance requires repair"

        payload = Response.fail(
            message="系统密钥缺失：服务暂不可用，请联系管理员修复。",
            error="MASTER_KEY_MISSING",
        )
        resp = JSONResponse(status_code=503, content=payload.model_dump(by_alias=True))
        await resp(scope, receive, send)
