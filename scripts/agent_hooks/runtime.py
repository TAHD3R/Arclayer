"""Shared event runtime for the Codex project-hook adapter."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Any

from .evidence import CommandStatusStore, EventIdentity, EvidenceStore
from .policy import (
    EDIT_TOOLS,
    claims_completion,
    command_violation,
    command_with_status_capture,
    extract_paths,
    generated_artifact_violation,
    has_explicit_validation_omission_reason,
    is_successful_validation_command,
)
from .repo_context import gitnexus_index_context, gitnexus_staleness_message
from .validation import validation_plan

STATUS_CAPTURE_OWNER = {
    "schema": 1,
    "owner": "project",
    "protocol": "codex-bash-exit-status-v1",
}


class Platform(StrEnum):
    CODEX = "codex"


class ResultKind(StrEnum):
    CONTEXT = "context"
    BLOCK = "block"
    UPDATED_INPUT = "updated_input"


@dataclass(frozen=True)
class HookResult:
    kind: ResultKind
    event: str
    message: str = ""
    updated_command: str = ""


class HookRuntime:
    def __init__(
        self,
        platform: Platform,
        project_root: Path,
        state_root: Path | None = None,
        status_root: Path | None = None,
    ) -> None:
        self.platform = platform
        self.project_root = project_root.resolve()
        self.evidence = EvidenceStore(self.project_root, state_root)
        self.command_status = CommandStatusStore(status_root)

    def handle(self, payload: dict[str, Any]) -> HookResult | None:
        event = _string_field(payload, "hook_event_name", "hookEventName")
        handlers = {
            "SessionStart": self._session_start,
            "UserPromptSubmit": self._user_prompt_submit,
            "PreToolUse": self._pre_tool_use,
            "PostToolUse": self._post_tool_use,
            "Stop": self._stop,
        }
        handler = handlers.get(event)
        return handler(payload, event) if handler else None

    def _session_start(self, payload: dict[str, Any], event: str) -> HookResult:
        self._reset_session(payload)
        self._validate_status_capture_owner()
        message = (
            "Arclayer Codex project hooks are active. Use repo scripts only (`rtk pnpm ...`), keep "
            "implementation contracts in docs/spec, validate app and shared-package changes with their matching gates, "
            "and run code-review-engine changed audits for review-sensitive edits. "
            + gitnexus_index_context(self.project_root)
        )
        return HookResult(ResultKind.CONTEXT, event, message)

    def _user_prompt_submit(self, payload: dict[str, Any], _event: str) -> None:
        self._reset_session(payload)

    def _pre_tool_use(self, payload: dict[str, Any], event: str) -> HookResult | None:
        name = _tool_name(payload)
        data = _tool_input(payload)
        if name == "Bash":
            command = str(data.get("command") or "")
            violation = command_violation(command)
            if violation:
                return HookResult(ResultKind.BLOCK, event, violation)
            try:
                self._validate_status_capture_owner()
            except RuntimeError as exc:
                return HookResult(ResultKind.BLOCK, event, str(exc))
            status_path = self.command_status.prepare(
                self._session_id(payload),
                _tool_use_id(payload),
                command,
            )
            wrapped = command_with_status_capture(command, status_path, os.environ.get("SHELL") or "/bin/sh")
            return HookResult(ResultKind.UPDATED_INPUT, event, updated_command=wrapped)
        if name in EDIT_TOOLS:
            paths = extract_paths(data, self._session_cwd(payload))
            violation = generated_artifact_violation(self.project_root, paths)
            return HookResult(ResultKind.BLOCK, event, violation) if violation else None
        return None

    def _post_tool_use(self, payload: dict[str, Any], event: str) -> HookResult | None:
        name = _tool_name(payload)
        if name == "Bash":
            command, success, missing_reason = self._bash_result(payload)
            if missing_reason:
                return HookResult(ResultKind.CONTEXT, event, missing_reason)
            if success and is_successful_validation_command(command):
                self.evidence.record_success(self._event_identity(payload), command.strip())
            if not success:
                return HookResult(
                    ResultKind.CONTEXT,
                    event,
                    "The previous shell command failed or was interrupted. Debug the surfaced error; do not treat it "
                    "as successful validation evidence.",
                )
            return self._gitnexus_staleness_after_git_mutation(command, event)
        if name in EDIT_TOOLS:
            paths = extract_paths(_tool_input(payload), self._session_cwd(payload))
            message = validation_plan(self.project_root, paths).message()
            return HookResult(ResultKind.CONTEXT, event, message) if message else None
        return None

    def _stop(self, payload: dict[str, Any], event: str) -> HookResult | None:
        if bool(payload.get("stop_hook_active") or payload.get("stopHookActive")):
            return None
        identity = self._event_identity(payload)
        message = _assistant_message(payload)
        if not message or not claims_completion(message):
            self.evidence.clear(identity)
            return None
        successful_commands = self.evidence.successful_commands(identity)
        if successful_commands and any(command in message for command in successful_commands):
            self.evidence.clear(identity)
            return None
        if has_explicit_validation_omission_reason(message):
            self.evidence.clear(identity)
            return None
        return HookResult(
            ResultKind.BLOCK,
            event,
            "The final Arclayer handoff claims completion without successful validation recorded by this turn's "
            "PostToolUse events and named in the handoff. Merely naming an unrecorded command is not evidence; run "
            "and report the relevant repo gate, or state an explicit reason it could not be run.",
        )

    def _bash_result(self, payload: dict[str, Any]) -> tuple[str, bool, str]:
        captured = self.command_status.read(self._session_id(payload), _tool_use_id(payload))
        if captured is None:
            return "", False, "Codex PostToolUse had no command metadata; validation was not recorded."
        if captured.exit_status is None:
            return (
                captured.original_command,
                False,
                "Codex PostToolUse had no captured exit status; raw tool_response text was not guessed as success.",
            )
        return captured.original_command, captured.exit_status == 0, ""

    def _reset_session(self, payload: dict[str, Any]) -> None:
        session_id = self._session_id(payload)
        self.evidence.reset_session(self.platform.value, session_id)
        self.command_status.reset_session(session_id)

    def _event_identity(self, payload: dict[str, Any]) -> EventIdentity | None:
        session_id = self._session_id(payload)
        if not session_id:
            return None
        # Codex supplies turn_id. Session fallback is cleared on UserPromptSubmit and every completed Stop.
        turn_id = _string_field(payload, "turn_id", "turnId") or "session"
        return EventIdentity(platform=self.platform.value, session_id=session_id, turn_id=turn_id)

    @staticmethod
    def _session_id(payload: dict[str, Any]) -> str:
        return _string_field(
            payload,
            "session_id",
            "sessionId",
            "conversation_id",
            "conversationId",
            "transcript_path",
            "transcriptPath",
        )

    def _session_cwd(self, payload: dict[str, Any]) -> Path:
        raw = _string_field(payload, "cwd") or str(self.project_root)
        return Path(raw).expanduser().resolve()

    def _validate_status_capture_owner(self) -> None:
        marker_path = self.project_root / ".codex" / "hooks" / "status-capture-owner.json"
        try:
            marker = json.loads(marker_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"Cannot read Codex status-capture owner marker {marker_path}: {exc}") from exc
        if marker != STATUS_CAPTURE_OWNER:
            raise RuntimeError(f"Invalid Codex status-capture owner marker: {marker_path}")

    def _gitnexus_staleness_after_git_mutation(self, command: str, event: str) -> HookResult | None:
        message = gitnexus_staleness_message(self.project_root, command)
        return HookResult(ResultKind.CONTEXT, event, message) if message else None


def _tool_name(payload: dict[str, Any]) -> str:
    return _string_field(payload, "tool_name", "toolName")


def _tool_input(payload: dict[str, Any]) -> dict[str, Any]:
    return _mapping_field(payload, "tool_input", "toolInput")


def _tool_use_id(payload: dict[str, Any]) -> str:
    return _string_field(payload, "tool_use_id", "toolUseId")


def _assistant_message(payload: dict[str, Any]) -> str:
    return _string_field(
        payload,
        "last_assistant_message",
        "lastAssistantMessage",
        "assistant_response",
        "assistantResponse",
        "final_response",
        "finalResponse",
        "response",
        "message",
    )


def _string_field(payload: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, str):
            return value
    return ""


def _mapping_field(payload: dict[str, Any], *keys: str) -> dict[str, Any]:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, dict):
            return value
    return {}
