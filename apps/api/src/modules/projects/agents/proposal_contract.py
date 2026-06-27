from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

from src.common.schemas import BaseSchema
from src.core.exceptions import Conflict

_CONTROL_FIELD_KEYS = frozenset({
    "agentrunid",
    "approvalid",
    "approvalstatus",
    "approvedat",
    "appliedat",
    "dryrun",
    "expecteddraftversion",
    "expiredat",
    "impactpreviewtoken",
    "publishedat",
    "rejectedat",
    "savedat",
    "targetsnapshot",
    "willapply",
})
_STATUS_KEYS = frozenset({"applystatus", "publicationstatus", "publishstatus", "state", "status"})
_SUCCESS_STATUS_VALUES = frozenset({"applied", "approved", "migrated", "published", "saved"})
_SUCCESS_CLAIM_PATTERN = re.compile(
    r"\b(?:already|successfully|now|has\s+been|have\s+been|was|were|is)\s+"
    r"(?:saved|applied|published|approved|migrated)\b"
    r"|\b(?:saved|applied|published|approved|migrated)\s+"
    r"(?:successfully|the\s+(?:draft|content|model|schema|changes))\b",
    re.IGNORECASE,
)


class ProposalContractFinding(BaseSchema):
    rule: str
    path: str
    value: str


def assert_no_generated_success_claims(value: Any, *, source: str) -> None:
    finding = detect_generated_success_claim(value, source=source)
    if finding is None:
        return
    raise Conflict(
        "Agent proposal output must not claim a write has already been saved, approved, applied, or published",
        error="AGENT_PROPOSAL_INVALID_OUTPUT",
        meta={
            "source": source,
            "path": finding.path,
            "rule": finding.rule,
            "value": finding.value,
        },
    )


def detect_generated_success_claim(value: Any, *, source: str) -> ProposalContractFinding | None:
    return _detect_success_claim(value, path=source, inspect_control_keys=True)


def _detect_success_claim(
    value: Any,
    *,
    path: str,
    inspect_control_keys: bool = False,
) -> ProposalContractFinding | None:
    if isinstance(value, str):
        return _detect_text_success_claim(value, path=path)
    if isinstance(value, Mapping):
        for key, item in value.items():
            key_text = str(key)
            normalized_key = _normalize_key(key_text)
            child_path = f"{path}.{key_text}"
            if inspect_control_keys:
                key_finding = _detect_control_key(normalized_key, item, path=child_path)
                if key_finding is not None:
                    return key_finding
            child_finding = _detect_success_claim(item, path=child_path)
            if child_finding is not None:
                return child_finding
    if isinstance(value, Sequence) and not isinstance(value, bytes | bytearray | str):
        for index, item in enumerate(value):
            item_finding = _detect_success_claim(item, path=f"{path}[{index}]")
            if item_finding is not None:
                return item_finding
    return None


def _detect_control_key(normalized_key: str, value: Any, *, path: str) -> ProposalContractFinding | None:
    if value is None:
        return None
    if normalized_key in _CONTROL_FIELD_KEYS:
        return ProposalContractFinding(rule="control_field", path=path, value=normalized_key)
    if normalized_key not in _STATUS_KEYS or not isinstance(value, str):
        return None
    normalized_value = value.strip().lower()
    if normalized_value not in _SUCCESS_STATUS_VALUES:
        return None
    return ProposalContractFinding(rule="success_status_value", path=path, value=normalized_value)


def _detect_text_success_claim(text: str, *, path: str) -> ProposalContractFinding | None:
    if _normalize_key(path.rsplit(".", maxsplit=1)[-1]) != "changesummary":
        return None
    match = _SUCCESS_CLAIM_PATTERN.search(text)
    if match is None:
        return None
    return ProposalContractFinding(rule="success_claim_text", path=path, value=_excerpt(text, match=match))


def _normalize_key(key: str) -> str:
    return re.sub(r"[^a-z0-9]", "", key.lower())


def _excerpt(text: str, *, match: re.Match[str]) -> str:
    start = max(match.start() - 32, 0)
    end = min(match.end() + 32, len(text))
    return text[start:end].strip()
