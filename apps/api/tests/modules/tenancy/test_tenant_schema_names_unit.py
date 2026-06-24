from __future__ import annotations

from uuid import UUID

import pytest

from src.modules.tenancy.schema_names import build_workspace_schema_name, validate_tenant_schema_name


def test_build_workspace_schema_name_is_deterministic() -> None:
    workspace_id = UUID("01234567-89ab-cdef-0123-456789abcdef")
    assert build_workspace_schema_name(workspace_id) == "workspace_0123456789abcdef0123"
    assert build_workspace_schema_name(workspace_id) == "workspace_0123456789abcdef0123"


@pytest.mark.parametrize(
    "workspace_hex, expected_schema",
    [
        ("00000000-0000-0000-0000-000000000000", "workspace_00000000000000000000"),
        ("ffffffff-ffff-ffff-ffff-ffffffffffff", "workspace_ffffffffffffffffffff"),
        ("00000000-0000-0000-0000-000000000001", "workspace_00000000000000000000"),
        ("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "workspace_aaaaaaaabbbbccccdddd"),
    ],
)
def test_build_workspace_schema_name_edge_cases(workspace_hex: str, expected_schema: str) -> None:
    """Schema names are derived from the first 20 hex characters of the workspace UUID."""
    assert build_workspace_schema_name(UUID(workspace_hex)) == expected_schema


def test_build_workspace_schema_name_truncation_is_documented() -> None:
    """Two UUIDs that share the same first 20 hex chars produce the same schema name.

    This is a deliberate design choice: the 20-char truncation balances
    readability with uniqueness. Full 32-char hex would be collision-safe
    but harder to read in logs and database tooling.
    """
    a = UUID("01234567-89ab-cdef-0123-456789abcdef")
    b = UUID("01234567-89ab-cdef-0123-ffffffffffff")
    assert build_workspace_schema_name(a) == build_workspace_schema_name(b)
    assert build_workspace_schema_name(a) == "workspace_0123456789abcdef0123"


def test_validate_tenant_schema_name_normalizes_case() -> None:
    assert validate_tenant_schema_name("WORKSPACE_ABCDEF1234567890ABCD") == "workspace_abcdef1234567890abcd"


@pytest.mark.parametrize(
    "schema_name",
    [
        "",
        " ",
        '"workspace_safe"',
        "workspace.safe",
        "cms ws safe",
        "workspace_safe;",
        "unsafe",
        "workspace-safe",
    ],
)
def test_validate_tenant_schema_name_rejects_hostile_input(schema_name: str) -> None:
    with pytest.raises(ValueError):
        validate_tenant_schema_name(schema_name)
