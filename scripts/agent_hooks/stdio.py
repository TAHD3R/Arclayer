"""JSON stdin/stdout protocol rendering for project-hook adapters."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from .runtime import HookResult, HookRuntime, Platform, ResultKind


def dispatch_from_stdio(platform: Platform, project_root: Path) -> None:
    try:
        payload = _read_payload()
        result = HookRuntime(platform, project_root).handle(payload)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from exc
    if result is None:
        return
    print(json.dumps(_render_result(result), ensure_ascii=True))
    if result.kind == ResultKind.BLOCK:
        raise SystemExit(2)


def _read_payload() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        raise RuntimeError("Project hook input was empty.")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Project hook input was not valid JSON: {exc}") from exc
    if not isinstance(parsed, dict):
        raise RuntimeError("Project hook input must be a JSON object.")
    return parsed


def _render_result(result: HookResult) -> dict[str, Any]:
    if result.kind == ResultKind.UPDATED_INPUT:
        return {
            "hookSpecificOutput": {
                "hookEventName": result.event,
                "permissionDecision": "allow",
                "updatedInput": {"command": result.updated_command},
            }
        }
    if result.kind == ResultKind.CONTEXT:
        return {
            "hookSpecificOutput": {
                "hookEventName": result.event,
                "additionalContext": result.message,
            }
        }
    return {
        "decision": "block",
        "reason": result.message,
        "permissionDecision": "deny",
        "permissionDecisionReason": result.message,
        "hookSpecificOutput": {
            "hookEventName": result.event,
            "decision": "block",
            "permissionDecision": "deny",
            "additionalContext": result.message,
        },
    }
