from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

from src.common.schemas import BaseSchema
from src.core.exceptions import BadRequest

_PROMPT_INJECTION_RULES: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "ignore_instructions",
        re.compile(
            r"\b(?:ignore|disregard|forget)\s+"
            r"(?:(?:(?:all|these|those)\s+(?:instructions|rules|messages|prompts))"
            r"|(?:(?:all\s+)?(?:the\s+)?(?:previous|prior|above|earlier|system|developer)\s+"
            r"(?:instructions|rules|messages|prompts)))\b",
            re.IGNORECASE,
        ),
    ),
    (
        "override_policy",
        re.compile(
            r"\boverride\s+(?:the\s+)?(?:system|developer|safety|security)\s+"
            r"(?:instructions|rules|policy|policies|prompt)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "do_not_follow_policy",
        re.compile(
            r"\bdo\s+not\s+(?:follow|obey)\s+(?:the\s+)?"
            r"(?:system|developer|previous|prior)\s+(?:instructions|rules|prompt)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "role_escalation",
        re.compile(
            r"\byou\s+are\s+now\s+(?:in\s+)?(?:developer|system|admin|sudo|root)\s+mode\b",
            re.IGNORECASE,
        ),
    ),
    (
        "prompt_exfiltration",
        re.compile(
            r"\breveal\s+(?:the\s+)?(?:system|developer)\s+(?:prompt|instructions|message)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "tool_escalation",
        re.compile(
            r"\b(?:call|invoke|use)\s+(?:the\s+)?"
            r"(?:write|update|create|delete|publish|apply)\s+(?:tool|operation|endpoint)\b",
            re.IGNORECASE,
        ),
    ),
)


class PromptInjectionFinding(BaseSchema):
    rule: str
    path: str
    excerpt: str


def assert_no_prompt_injection(value: Any, *, source: str) -> None:
    finding = detect_prompt_injection(value, source=source)
    if finding is None:
        return
    raise BadRequest(
        "Agent proposal request contains prompt-injection instructions",
        error="AGENT_PROMPT_INJECTION_BLOCKED",
        meta={
            "source": source,
            "path": finding.path,
            "rule": finding.rule,
            "excerpt": finding.excerpt,
        },
    )


def detect_prompt_injection(value: Any, *, source: str) -> PromptInjectionFinding | None:
    for path, text in _iter_strings(value, path=source):
        finding = _detect_in_text(text, path=path)
        if finding is not None:
            return finding
    return None


def _iter_strings(value: Any, *, path: str) -> Sequence[tuple[str, str]]:
    if isinstance(value, str):
        return ((path, value),)
    if isinstance(value, Mapping):
        strings: list[tuple[str, str]] = []
        for key, item in value.items():
            strings.extend(_iter_strings(item, path=f"{path}.{key}"))
        return strings
    if isinstance(value, Sequence) and not isinstance(value, bytes | bytearray):
        strings = []
        for index, item in enumerate(value):
            strings.extend(_iter_strings(item, path=f"{path}[{index}]"))
        return strings
    return ()


def _detect_in_text(text: str, *, path: str) -> PromptInjectionFinding | None:
    for rule, pattern in _PROMPT_INJECTION_RULES:
        match = pattern.search(text)
        if match is None:
            continue
        return PromptInjectionFinding(rule=rule, path=path, excerpt=_excerpt(text, match=match))
    return None


def _excerpt(text: str, *, match: re.Match[str]) -> str:
    start = max(match.start() - 32, 0)
    end = min(match.end() + 32, len(text))
    return text[start:end].strip()
