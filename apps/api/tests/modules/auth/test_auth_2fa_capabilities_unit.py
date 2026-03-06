from __future__ import annotations

import importlib
from dataclasses import dataclass

from apps.api.src.config import get_settings
from apps.api.src.modules.auth.router import router
from apps.api.src.modules.auth.two_factor import schema as two_factor_schema


@dataclass(slots=True)
class _CapabilityProbe:
    enabled: bool
    has_password: bool


def test_two_factor_capability_route_is_registered() -> None:
    paths = {route.path for route in router.routes}

    assert "/2fa/capabilities" in paths


def test_two_factor_capability_schema_fields_are_frozen() -> None:
    schema_type = getattr(two_factor_schema, "TwoFactorCapabilitiesOut", None)

    assert schema_type is not None
    assert set(schema_type.model_fields) >= {
        "enabled",
        "can_setup",
        "setup_required_reauth_methods",
        "disable_required_reauth_methods",
        "regenerate_backup_codes_required_reauth_methods",
        "has_password",
    }


def test_two_factor_capability_service_reports_password_reauth(monkeypatch) -> None:
    try:
        capability_module = importlib.import_module("apps.api.src.modules.auth.two_factor.capability_service")
    except ModuleNotFoundError:
        capability_module = None

    service_type = None if capability_module is None else getattr(capability_module, "TwoFactorCapabilityService", None)

    assert service_type is not None

    settings = get_settings()
    service = service_type(settings)

    async def _get_status(*, user_id):
        assert user_id
        return False, 0

    async def _get_user_with_credential(*_args, **_kwargs):
        return _CapabilityProbe(enabled=False, has_password=True)

    monkeypatch.setattr(service, "_get_status", _get_status)
    monkeypatch.setattr(service, "_get_user_with_credential", _get_user_with_credential)

    out = service.build_capabilities(enabled=False, has_password=True)

    assert out.can_setup is True
    assert out.setup_required_reauth_methods == ["password"]
    assert out.disable_required_reauth_methods == []
    assert out.regenerate_backup_codes_required_reauth_methods == []
