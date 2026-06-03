"""Unit tests for tenant-aware extension registries."""

from __future__ import annotations

from uuid import uuid4

from src.core.extensions.tenant_registry import (
    TenantAwareContentTypeRegistry,
    TenantAwareMiddlewareRegistry,
    TenantAwareProviderRegistry,
    TenantAwareRegistrySet,
    TenantAwareServiceRegistry,
)

# ——— TenantAwareServiceRegistry ————————————————————————————————————————


class TestTenantAwareServiceRegistry:
    def test_register_and_resolve_active(self):
        reg = TenantAwareServiceRegistry()
        ws = uuid4()
        created = []

        def factory():
            created.append(1)
            return "svc-instance"

        reg.register("core-ext", "health", factory)
        reg.set_active("core-ext", ws)

        result = reg.resolve("health", ws)
        assert result == "svc-instance"
        assert len(created) == 1

    def test_resolve_returns_none_when_not_active(self):
        reg = TenantAwareServiceRegistry()
        ws = uuid4()

        reg.register("core-ext", "health", lambda: "x")
        # Never set active

        assert reg.resolve("health", ws) is None

    def test_resolve_returns_none_for_inactive_workspace(self):
        reg = TenantAwareServiceRegistry()
        ws1 = uuid4()
        ws2 = uuid4()

        reg.register("core-ext", "health", lambda: "x")
        reg.set_active("core-ext", ws1)

        # ws2 is not activated
        assert reg.resolve("health", ws2) is None

    def test_multiple_extensions_same_service_name_last_active_wins(self):
        reg = TenantAwareServiceRegistry()
        ws = uuid4()

        reg.register("ext-a", "svc", lambda: "a")
        reg.register("ext-b", "svc", lambda: "b")
        reg.set_active("ext-a", ws)
        reg.set_active("ext-b", ws)

        # Both active — first match (by insertion order) wins
        result = reg.resolve("svc", ws)
        assert result in ("a", "b")

    def test_unregister_removes_service(self):
        reg = TenantAwareServiceRegistry()
        ws = uuid4()

        reg.register("ext-a", "svc", lambda: "x")
        reg.set_active("ext-a", ws)
        reg.unregister("ext-a", "svc")

        assert reg.resolve("svc", ws) is None

    def test_unregister_all_removes_extension(self):
        reg = TenantAwareServiceRegistry()
        ws = uuid4()

        reg.register("ext-a", "svc1", lambda: "x")
        reg.register("ext-a", "svc2", lambda: "y")
        reg.set_active("ext-a", ws)
        reg.unregister_all("ext-a")

        assert reg.resolve("svc1", ws) is None
        assert reg.resolve("svc2", ws) is None

    def test_set_inactive_hides_services(self):
        reg = TenantAwareServiceRegistry()
        ws = uuid4()

        reg.register("ext-a", "svc", lambda: "x")
        reg.set_active("ext-a", ws)
        assert reg.resolve("svc", ws) == "x"

        reg.set_inactive("ext-a", ws)
        assert reg.resolve("svc", ws) is None

    def test_list_services_active_only(self):
        reg = TenantAwareServiceRegistry()
        ws1 = uuid4()
        ws2 = uuid4()

        reg.register("ext-a", "svc1", lambda: "x")
        reg.register("ext-a", "svc2", lambda: "y")
        reg.set_active("ext-a", ws1)

        assert sorted(reg.list_services(ws1)) == ["svc1", "svc2"]
        assert reg.list_services(ws2) == []

    def test_name_collision_replaces(self):
        reg = TenantAwareServiceRegistry()
        reg.register("ext-a", "svc", lambda: "first")
        reg.register("ext-a", "svc", lambda: "second")
        ws = uuid4()
        reg.set_active("ext-a", ws)
        assert reg.resolve("svc", ws) == "second"

    def test_active_extensions_property(self):
        reg = TenantAwareServiceRegistry()
        ws1 = uuid4()
        ws2 = uuid4()

        reg.set_active("ext-a", ws1)
        reg.set_active("ext-a", ws2)
        reg.set_active("ext-b", ws1)

        active = reg.active_extensions
        assert active["ext-a"] == {ws1, ws2}
        assert active["ext-b"] == {ws1}


# ——— TenantAwareMiddlewareRegistry —————————————————————————————————————


class TestTenantAwareMiddlewareRegistry:
    def test_register_and_get_active_hooks(self):
        reg = TenantAwareMiddlewareRegistry()
        ws = uuid4()

        class TestHook:
            hook_type = "request"

            async def before_route(self, request):
                return request

            async def after_response(self, request, response):
                return response

        reg.register("core-ext", "audit", TestHook)
        reg.set_active("core-ext", ws)

        hooks = reg.get_active_hooks(ws)
        assert len(hooks) == 1
        assert isinstance(hooks[0], TestHook)

    def test_get_active_hooks_excludes_inactive(self):
        reg = TenantAwareMiddlewareRegistry()
        ws1 = uuid4()
        ws2 = uuid4()

        class TestHook:
            hook_type = "request"

        reg.register("core-ext", "audit", TestHook)
        reg.set_active("core-ext", ws1)

        assert len(reg.get_active_hooks(ws2)) == 0

    def test_resolve_middleware(self):
        reg = TenantAwareMiddlewareRegistry()
        ws = uuid4()

        reg.register("core-ext", "cors", lambda: "mw-instance")
        reg.set_active("core-ext", ws)

        assert reg.resolve("cors", ws) == "mw-instance"


# ——— TenantAwareContentTypeRegistry ————————————————————————————————————


class TestTenantAwareContentTypeRegistry:
    def test_register_and_resolve(self):
        reg = TenantAwareContentTypeRegistry()
        ws = uuid4()

        definition = {"name": "Article", "fields": []}
        reg.register("core-ext", "article", definition)
        reg.set_active("core-ext", ws)

        result = reg.resolve("article", ws)
        assert result == definition

    def test_list_types_sorted(self):
        reg = TenantAwareContentTypeRegistry()
        ws = uuid4()

        reg.register("ext-a", "zebra", {})
        reg.register("ext-b", "alpha", {})
        reg.set_active("ext-a", ws)
        reg.set_active("ext-b", ws)

        assert reg.list_types(ws) == ["alpha", "zebra"]

    def test_inactive_workspace_not_listed(self):
        reg = TenantAwareContentTypeRegistry()
        ws = uuid4()

        reg.register("ext-a", "article", {})
        # Not activated
        assert reg.list_types(ws) == []


# ——— TenantAwareProviderRegistry ———————————————————————————————————————


class TestTenantAwareProviderRegistry:
    def test_register_and_resolve(self):
        reg = TenantAwareProviderRegistry()
        ws = uuid4()

        reg.register("core-ext", "email", lambda: "email-provider")
        reg.set_active("core-ext", ws)

        assert reg.resolve("email", ws) == "email-provider"

    def test_list_providers(self):
        reg = TenantAwareProviderRegistry()
        ws = uuid4()

        reg.register("ext-a", "email", lambda: "a")
        reg.register("ext-a", "upload", lambda: "b")
        reg.set_active("ext-a", ws)

        assert sorted(reg.list_providers(ws)) == ["email", "upload"]


# ——— TenantAwareRegistrySet ————————————————————————————————————————————


class TestTenantAwareRegistrySet:
    def test_composite_set_active_sets_all(self):
        rs = TenantAwareRegistrySet()
        ws = uuid4()

        rs.services.register("core-ext", "svc", lambda: "x")
        rs.middlewares.register("core-ext", "mw", lambda: "y")
        rs.content_types.register("core-ext", "ct", {"key": "val"})
        rs.providers.register("core-ext", "prov", lambda: "z")

        rs.set_active("core-ext", ws)

        assert rs.services.resolve("svc", ws) == "x"
        assert rs.middlewares.resolve("mw", ws) == "y"
        assert rs.content_types.resolve("ct", ws) == {"key": "val"}
        assert rs.providers.resolve("prov", ws) == "z"

    def test_composite_set_inactive_hides_all(self):
        rs = TenantAwareRegistrySet()
        ws = uuid4()

        rs.services.register("core-ext", "svc", lambda: "x")
        rs.set_active("core-ext", ws)
        rs.set_inactive("core-ext", ws)

        assert rs.services.resolve("svc", ws) is None

    def test_unregister_all_clears_all(self):
        rs = TenantAwareRegistrySet()
        ws = uuid4()

        rs.services.register("core-ext", "svc", lambda: "x")
        rs.middlewares.register("core-ext", "mw", lambda: "y")
        rs.content_types.register("core-ext", "ct", {})
        rs.providers.register("core-ext", "prov", lambda: "z")
        rs.set_active("core-ext", ws)

        rs.unregister_all("core-ext")

        assert rs.services.resolve("svc", ws) is None
        assert rs.middlewares.resolve("mw", ws) is None
        assert rs.content_types.resolve("ct", ws) is None
        assert rs.providers.resolve("prov", ws) is None

    def test_cross_workspace_isolation(self):
        """Extensions activated for ws1 must not be visible in ws2."""
        rs = TenantAwareRegistrySet()
        ws1 = uuid4()
        ws2 = uuid4()

        rs.services.register("core-ext", "svc", lambda: "shared")
        rs.set_active("core-ext", ws1)

        assert rs.services.resolve("svc", ws1) == "shared"
        assert rs.services.resolve("svc", ws2) is None
