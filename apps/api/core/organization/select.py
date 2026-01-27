from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID


@dataclass(slots=True)
class OrgSelectionRequired(Exception):
    candidates: list[UUID]


@dataclass(slots=True)
class InvalidOrgHeader(Exception):
    raw: str


@dataclass(slots=True)
class ForbiddenOrgAccess(Exception):
    org_id: UUID


class NoOrganizationMembership(Exception):
    pass


def select_org_id(*, header_org_id: str | None, member_org_ids: list[UUID]) -> UUID:
    """
    Select current org id based on request header and the user's memberships.

    Strategy (B):
    - If header is present: must be a UUID and must be in member_org_ids.
    - If header missing:
      - if exactly one membership: auto-select it
      - if multiple: ask client to choose (OrgSelectionRequired)
      - if none: deny (NoOrganizationMembership)
    """

    if header_org_id:
        raw = header_org_id.strip()
        try:
            org_id = UUID(raw)
        except ValueError as exc:
            raise InvalidOrgHeader(raw=header_org_id) from exc

        if org_id not in set(member_org_ids):
            raise ForbiddenOrgAccess(org_id=org_id)
        return org_id

    if not member_org_ids:
        raise NoOrganizationMembership()
    if len(member_org_ids) == 1:
        return member_org_ids[0]
    raise OrgSelectionRequired(candidates=list(member_org_ids))
