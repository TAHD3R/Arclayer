from __future__ import annotations

from contextvars import ContextVar, Token

from src.modules.tenancy.schema import TenantContext

_current_tenant_context: ContextVar[TenantContext | None] = ContextVar("current_tenant_context", default=None)


def set_current_tenant_context(context: TenantContext) -> Token[TenantContext | None]:
    return _current_tenant_context.set(context)


def reset_current_tenant_context(token: Token[TenantContext | None]) -> None:
    _current_tenant_context.reset(token)


def get_current_tenant_context() -> TenantContext | None:
    return _current_tenant_context.get()


def require_current_tenant_context() -> TenantContext:
    context = get_current_tenant_context()
    if context is None:
        raise RuntimeError("TenantContext is required")
    return context
