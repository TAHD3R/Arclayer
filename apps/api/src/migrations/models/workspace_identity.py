from __future__ import annotations

from enum import StrEnum


class OrganizationKind(StrEnum):
    """Frozen organization kind values required by historical migration 0001."""

    PERSONAL = "personal"
    TEAM = "team"


class WorkspaceKind(StrEnum):
    """Frozen workspace kind values required by historical migration 0001."""

    TEAM = "team"
