from __future__ import annotations

from uuid import UUID

import pytest

from src.modules.tenancy.schema_names import build_workspace_schema_name, validate_tenant_schema_name


def test_build_workspace_schema_name_is_deterministic() -> None:
    workspace_id = UUID("01234567-89ab-cdef-0123-456789abcdef")
    assert build_workspace_schema_name(workspace_id) == "cms_ws_0123456789abcdef0123"
    assert build_workspace_schema_name(workspace_id) == "cms_ws_0123456789abcdef0123"


def test_validate_tenant_schema_name_normalizes_case() -> None:
    assert validate_tenant_schema_name("CMS_WS_ABCDEF1234567890ABCD") == "cms_ws_abcdef1234567890abcd"


@pytest.mark.parametrize(
    "schema_name",
    [
        "",
        " ",
        '"cms_ws_safe"',
        "cms_ws.safe",
        "cms ws safe",
        "cms_ws_safe;",
        "unsafe",
        "cms-ws-safe",
    ],
)
def test_validate_tenant_schema_name_rejects_hostile_input(schema_name: str) -> None:
    with pytest.raises(ValueError):
        validate_tenant_schema_name(schema_name)
