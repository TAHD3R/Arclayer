from __future__ import annotations

from uuid import UUID, uuid4

import pytest


def test_select_org_id_prefers_header_when_member() -> None:
    from apps.api.core.organization.select import select_org_id

    org_a = uuid4()
    org_b = uuid4()
    selected = select_org_id(
        header_org_id=str(org_b),
        member_org_ids=[org_a, org_b],
    )
    assert selected == org_b


def test_select_org_id_auto_selects_single_membership() -> None:
    from apps.api.core.organization.select import select_org_id

    org = uuid4()
    selected = select_org_id(
        header_org_id=None,
        member_org_ids=[org],
    )
    assert selected == org


def test_select_org_id_errors_when_multiple_and_no_header() -> None:
    from apps.api.core.organization.select import OrgSelectionRequired, select_org_id

    org_a = uuid4()
    org_b = uuid4()
    with pytest.raises(OrgSelectionRequired) as exc:
        select_org_id(header_org_id=None, member_org_ids=[org_a, org_b])
    # Error should include candidates for UX guidance.
    assert set(exc.value.candidates) == {org_a, org_b}


def test_select_org_id_errors_when_header_not_uuid() -> None:
    from apps.api.core.organization.select import InvalidOrgHeader, select_org_id

    with pytest.raises(InvalidOrgHeader):
        select_org_id(header_org_id="not-a-uuid", member_org_ids=[])


def test_select_org_id_errors_when_header_not_member() -> None:
    from apps.api.core.organization.select import ForbiddenOrgAccess, select_org_id

    org_a = uuid4()
    org_b = uuid4()
    with pytest.raises(ForbiddenOrgAccess) as exc:
        select_org_id(header_org_id=str(org_b), member_org_ids=[org_a])
    assert exc.value.org_id == UUID(str(org_b))
