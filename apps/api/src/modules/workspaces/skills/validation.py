from __future__ import annotations

import re

import orjson
from pydantic import BaseModel, ConfigDict, ValidationError

from src.core.i18n import t
from src.models.skills._enums import SkillValidationStatus
from src.models.skills.skill_version import SkillResourceRecord, SkillVersionRecord
from src.modules.workspaces.skills.manifest import (
    SkillManifestV1,
    skill_content_digest,
    validate_skill_package_checksum,
)
from src.modules.workspaces.skills.schema import SkillValidationFindingOut

_PRIVATE_KEY_PATTERN = re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")
_TOKEN_PATTERNS = (
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{32,}\b"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{24,}\b"),
    re.compile(r"(?i)\b(?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*[\"']?[A-Za-z0-9_./+=-]{16,}"),
)


class SkillValidationOutcome(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    status: SkillValidationStatus
    findings: tuple[SkillValidationFindingOut, ...]
    finding_hash: str


def validate_persisted_skill_version(
    *,
    version: SkillVersionRecord,
    resources: tuple[SkillResourceRecord, ...],
    policy_version: int,
) -> SkillValidationOutcome:
    findings: list[SkillValidationFindingOut] = []
    manifest = _validate_manifest(version=version, findings=findings)
    if manifest is not None:
        _validate_resources(manifest=manifest, resources=resources, findings=findings)
    status = _resolve_status(findings)
    finding_hash = build_skill_validation_finding_hash(
        package_checksum=version.package_checksum,
        policy_version=policy_version,
        status=status,
        findings=tuple(findings),
    )
    return SkillValidationOutcome(
        status=status,
        findings=tuple(findings),
        finding_hash=finding_hash,
    )


def _validate_manifest(
    *,
    version: SkillVersionRecord,
    findings: list[SkillValidationFindingOut],
) -> SkillManifestV1 | None:
    try:
        manifest = SkillManifestV1.model_validate(version.manifest)
        validate_skill_package_checksum(manifest)
    except (ValidationError, ValueError, TypeError):
        findings.append(
            _finding(
                code="SKILL_CHECKSUM_MISMATCH",
            )
        )
        return None
    if manifest.checksum != version.package_checksum:
        findings.append(
            _finding(
                code="SKILL_CHECKSUM_MISMATCH",
            )
        )
    return manifest


def _validate_resources(
    *,
    manifest: SkillManifestV1,
    resources: tuple[SkillResourceRecord, ...],
    findings: list[SkillValidationFindingOut],
) -> None:
    persisted_by_path = {resource.normalized_path: resource for resource in resources}
    declared_paths = {resource.path for resource in manifest.resources}
    if len(persisted_by_path) != len(resources) or set(persisted_by_path) != declared_paths:
        findings.append(
            _finding(
                code="SKILL_RESOURCE_SET_MISMATCH",
            )
        )
        return
    for declaration in manifest.resources:
        persisted = persisted_by_path[declaration.path]
        content = persisted.inline_content
        if content is None or persisted.asset_id is not None or persisted.storage_reference:
            findings.append(
                _finding(
                    code="SKILL_RESOURCE_STORAGE_INVALID",
                    resource_path=declaration.path,
                )
            )
            continue
        encoded = content.encode("utf-8")
        if (
            len(encoded) != declaration.byte_size
            or persisted.byte_size != declaration.byte_size
            or skill_content_digest(encoded) != declaration.digest
            or persisted.content_digest != declaration.digest
        ):
            findings.append(
                _finding(
                    code="SKILL_RESOURCE_DIGEST_MISMATCH",
                    resource_path=declaration.path,
                )
            )
            continue
        if contains_skill_secret(content):
            findings.append(
                _finding(
                    code="SKILL_SECRET_DETECTED",
                    resource_path=declaration.path,
                )
            )


def contains_skill_secret(content: str) -> bool:
    return bool(_PRIVATE_KEY_PATTERN.search(content) or any(pattern.search(content) for pattern in _TOKEN_PATTERNS))


def build_skill_validation_finding_hash(
    *,
    package_checksum: str,
    policy_version: int,
    status: SkillValidationStatus,
    findings: tuple[SkillValidationFindingOut, ...],
) -> str:
    return skill_content_digest(
        orjson.dumps(
            {
                "packageChecksum": package_checksum,
                "policyVersion": policy_version,
                "status": status.value,
                "findings": [finding.model_dump(mode="json", by_alias=True) for finding in findings],
            },
            option=orjson.OPT_SORT_KEYS,
        )
    )


def _resolve_status(findings: list[SkillValidationFindingOut]) -> SkillValidationStatus:
    if any(finding.code == "SKILL_SECRET_DETECTED" for finding in findings):
        return SkillValidationStatus.QUARANTINED
    if any(finding.severity == "error" for finding in findings):
        return SkillValidationStatus.INVALID
    if findings:
        return SkillValidationStatus.WARNING
    return SkillValidationStatus.VALID


def _finding(
    *,
    code: str,
    resource_path: str | None = None,
) -> SkillValidationFindingOut:
    return SkillValidationFindingOut(
        code=code,
        severity="error",
        resource_path=resource_path,
        message_key=code,
        message=t("errors", code),
    )
