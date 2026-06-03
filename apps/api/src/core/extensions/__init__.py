from __future__ import annotations

from src.core.extensions.manager import (
    ExtensionInstance,
    ExtensionLoadError,
    ExtensionManager,
)
from src.core.extensions.manifest import (
    ExtensionManifest,
    PackageState,
    ProcessState,
    WorkspaceActivationState,
    parse_manifest,
)
from src.core.extensions.middleware_dispatcher import (
    TenantAwareExtensionMiddlewareDispatcher,
)
from src.core.extensions.tenant_registry import (
    TenantAwareContentTypeRegistry,
    TenantAwareMiddlewareRegistry,
    TenantAwareProviderRegistry,
    TenantAwareRegistrySet,
    TenantAwareServiceRegistry,
)
from src.core.extensions.workspace_context_middleware import (
    WorkspaceContextMiddleware,
)

__all__ = [
    "ExtensionInstance",
    "ExtensionLoadError",
    "ExtensionManager",
    "ExtensionManifest",
    "PackageState",
    "ProcessState",
    "TenantAwareContentTypeRegistry",
    "TenantAwareExtensionMiddlewareDispatcher",
    "TenantAwareMiddlewareRegistry",
    "TenantAwareProviderRegistry",
    "TenantAwareRegistrySet",
    "TenantAwareServiceRegistry",
    "WorkspaceActivationState",
    "WorkspaceContextMiddleware",
    "parse_manifest",
]
