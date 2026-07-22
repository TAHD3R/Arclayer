from __future__ import annotations

import hashlib
from collections.abc import Callable, Sequence
from typing import Literal
from uuid import UUID

import orjson
from pydantic import ConfigDict

from src.common.schemas import BaseSchema
from src.models.skills._enums import SkillPackageScope, SkillUpdateRisk
from src.modules.workspaces.skills.manifest import (
    SkillManifestV1,
)
from src.modules.workspaces.skills.schema import SkillResourceOut, SkillValidationFindingOut
from src.modules.workspaces.skills.update_schema import (
    SkillUpdateDataEgressChangeOut,
    SkillUpdateDiffOut,
    SkillUpdatePermissionChangeOut,
    SkillUpdateResourceChangeOut,
    SkillUpdateToolChangeOut,
)

ChangeType = Literal["added", "removed", "modified"]


class SkillUpdateTarget(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    package_scope: SkillPackageScope
    package_id: UUID
    version_id: UUID
    version_number: int
    semantic_version: str | None
    package_checksum: str
    manifest: SkillManifestV1
    resources: tuple[SkillResourceOut, ...]
    validation_policy_version: int
    validation_status: str
    validation_finding_hash: str
    validation_findings: tuple[SkillValidationFindingOut, ...]
    source_provenance: dict[str, object]


class SkillUpdateComputation(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    risk: SkillUpdateRisk
    risk_categories: tuple[SkillUpdateRisk, ...]
    diff: SkillUpdateDiffOut
    preview_hash: str


def build_skill_update_preview(
    *,
    installation_id: UUID,
    expected_revision: int,
    current: SkillUpdateTarget,
    candidate: SkillUpdateTarget,
) -> SkillUpdateComputation:
    diff = _build_diff(current=current, candidate=candidate)
    categories = _risk_categories(diff=diff, candidate=candidate)
    risk = categories[-1] if categories else SkillUpdateRisk.NONE
    evidence = {
        "installationId": str(installation_id),
        "expectedRevision": expected_revision,
        "current": current.model_dump(mode="json", by_alias=True),
        "candidate": candidate.model_dump(mode="json", by_alias=True),
        "risk": risk.value,
        "riskCategories": [item.value for item in categories],
        "diff": diff.model_dump(mode="json", by_alias=True),
    }
    return SkillUpdateComputation(
        risk=risk,
        risk_categories=categories,
        diff=diff,
        preview_hash=_sha256(evidence),
    )


def _build_diff(*, current: SkillUpdateTarget, candidate: SkillUpdateTarget) -> SkillUpdateDiffOut:
    resources = _resource_changes(current.resources, candidate.resources)
    instruction_path = candidate.manifest.instructions_entrypoint
    return SkillUpdateDiffOut(
        resource_changes=resources,
        instructions_changed=any(item.path == instruction_path for item in resources),
        compatibility_changed=current.manifest.compatibility != candidate.manifest.compatibility,
        current_compatibility=current.manifest.compatibility,
        candidate_compatibility=candidate.manifest.compatibility,
        required_tool_changes=_declaration_changes(
            current.manifest.required_tools,
            candidate.manifest.required_tools,
            identity=lambda item: item.tool_id,
            factory=lambda identity, change_type, before, after: SkillUpdateToolChangeOut(
                tool_id=identity,
                change_type=change_type,
                before=before,
                after=after,
            ),
        ),
        permission_changes=_declaration_changes(
            current.manifest.permissions,
            candidate.manifest.permissions,
            identity=lambda item: item.action,
            factory=lambda identity, change_type, before, after: SkillUpdatePermissionChangeOut(
                action=identity,
                change_type=change_type,
                before=before,
                after=after,
            ),
        ),
        data_egress_changes=_declaration_changes(
            current.manifest.data_egress,
            candidate.manifest.data_egress,
            identity=lambda item: item.destination,
            factory=lambda identity, change_type, before, after: SkillUpdateDataEgressChangeOut(
                destination=identity,
                change_type=change_type,
                before=before,
                after=after,
            ),
        ),
        capability_tags_added=tuple(
            sorted(set(candidate.manifest.capability_tags) - set(current.manifest.capability_tags))
        ),
        capability_tags_removed=tuple(
            sorted(set(current.manifest.capability_tags) - set(candidate.manifest.capability_tags))
        ),
        source_provenance_changed=_canonical(current.source_provenance) != _canonical(candidate.source_provenance),
        validation_findings_changed=_canonical_findings(current.validation_findings)
        != _canonical_findings(candidate.validation_findings),
        current_validation_findings=current.validation_findings,
        candidate_validation_findings=candidate.validation_findings,
    )


def _resource_changes(
    current: tuple[SkillResourceOut, ...],
    candidate: tuple[SkillResourceOut, ...],
) -> tuple[SkillUpdateResourceChangeOut, ...]:
    before = {item.path: item for item in current}
    after = {item.path: item for item in candidate}
    changes: list[SkillUpdateResourceChangeOut] = []
    for path in sorted(before.keys() | after.keys()):
        old = before.get(path)
        new = after.get(path)
        change_type = _change_type(old, new)
        if change_type is None:
            continue
        changes.append(
            SkillUpdateResourceChangeOut(
                path=path,
                change_type=change_type,
                before_digest=old.digest if old is not None else None,
                after_digest=new.digest if new is not None else None,
            )
        )
    return tuple(changes)


def _declaration_changes[T, R](
    current: Sequence[T],
    candidate: Sequence[T],
    *,
    identity: Callable[[T], str],
    factory: Callable[[str, ChangeType, T | None, T | None], R],
) -> tuple[R, ...]:
    before = {identity(item): item for item in current}
    after = {identity(item): item for item in candidate}
    changes: list[R] = []
    for key in sorted(before.keys() | after.keys()):
        old = before.get(key)
        new = after.get(key)
        change_type = _change_type(old, new)
        if change_type is not None:
            changes.append(factory(key, change_type, old, new))
    return tuple(changes)


def _change_type[T](before: T | None, after: T | None) -> ChangeType | None:
    if before is None:
        return "added"
    if after is None:
        return "removed"
    return "modified" if before != after else None


def _risk_categories(
    *,
    diff: SkillUpdateDiffOut,
    candidate: SkillUpdateTarget,
) -> tuple[SkillUpdateRisk, ...]:
    predicates: tuple[tuple[SkillUpdateRisk, bool], ...] = (
        (
            SkillUpdateRisk.CONTENT,
            bool(diff.resource_changes) or diff.source_provenance_changed or diff.validation_findings_changed,
        ),
        (
            SkillUpdateRisk.CAPABILITY,
            diff.compatibility_changed
            or bool(diff.required_tool_changes)
            or bool(diff.capability_tags_added)
            or bool(diff.capability_tags_removed),
        ),
        (SkillUpdateRisk.PERMISSION, bool(diff.permission_changes)),
        (SkillUpdateRisk.DATA_EGRESS, bool(diff.data_egress_changes)),
        (
            SkillUpdateRisk.INCOMPATIBLE,
            candidate.validation_status not in {"valid", "warning"},
        ),
    )
    return tuple(risk for risk, triggered in predicates if triggered)


def _canonical_findings(findings: tuple[SkillValidationFindingOut, ...]) -> bytes:
    return _canonical([item.model_dump(mode="json", by_alias=True) for item in findings])


def _canonical(value: object) -> bytes:
    return orjson.dumps(value, option=orjson.OPT_SORT_KEYS)


def _sha256(value: object) -> str:
    return f"sha256:{hashlib.sha256(_canonical(value)).hexdigest()}"


__all__ = [
    "SkillUpdateComputation",
    "SkillUpdateTarget",
    "build_skill_update_preview",
]
