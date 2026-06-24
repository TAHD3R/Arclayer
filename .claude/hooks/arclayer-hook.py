#!/usr/bin/env python3
"""Arclayer project-local Claude Code hook dispatcher."""

from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path("/home/philip/Arclayer").resolve()
GITNEXUS_DIR = PROJECT_ROOT / ".gitnexus"
CODE_REVIEW_CHANGED_COMMAND = (
    "rtk pnpm -C scripts/code-review-engine cli --repo-root /home/philip/Arclayer "
    "--scope changed --base HEAD --format json -o reports/code-review-engine/changed.json"
)
CODE_REVIEW_TEST_COMMAND = "rtk pnpm -C scripts/code-review-engine test"
API_CHECK_COMMAND = "rtk pnpm api:check"
ADMIN_CHECK_COMMAND = "rtk pnpm admin:check"
ADMIN_BUILD_COMMAND = "rtk pnpm admin:build"
CROSS_APP_CHECK_COMMAND = "rtk pnpm check"

COMPLETION_RE = re.compile(
    r"\b(done|completed|implemented|fixed|resolved|passed|verified|validated|committed)\b|"
    r"已完成|完成了|已修复|修复了|已通过|测试通过|已验证|已提交"
)

ARCLAYER_EVIDENCE_RE = re.compile(
    r"\b(rtk\s+pnpm\s+(api:check|admin:check|admin:build|check|build)|"
    r"rtk\s+pnpm\s+-C\s+scripts/code-review-engine\s+(test|cli)|"
    r"rtk\s+gitnexus\s+\S+|rtk\s+claude\s+\S+|rtk\s+git\s+status|rtk\s+git\s+show|"
    r"未运行|无法运行|失败|blocked)\b|验证[:：]",
    re.IGNORECASE,
)

PNPM_OPTION_VALUES = {"-C", "--dir", "--filter", "-F", "--workspace-root"}
RG_VALUE_FLAGS = {
    "-A",
    "-B",
    "-C",
    "-g",
    "--glob",
    "-t",
    "--type",
    "--type-add",
    "--include",
    "--exclude",
    "-m",
    "--max-count",
    "--max-filesize",
    "--sort",
    "--sort-files",
}
RG_PATTERN_FLAGS = {"-e", "--regexp"}
EDIT_TOOLS = {"Edit", "MultiEdit", "Write", "NotebookEdit", "apply_patch"}


def main() -> None:
    input_data = read_input()
    event = str(input_data.get("hook_event_name") or input_data.get("hookEventName") or "")
    handlers = {
        "SessionStart": handle_session_start,
        "PreToolUse": handle_pre_tool_use,
        "PostToolUse": handle_post_tool_use,
        "PostToolUseFailure": handle_post_tool_use_failure,
        "Stop": handle_stop,
    }
    handler = handlers.get(event)
    if handler is not None:
        handler(input_data, event)


def read_input() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        fail("Claude hook input was empty.")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        fail(f"Claude hook input was not valid JSON: {exc}")
    if not isinstance(parsed, dict):
        fail("Claude hook input must be a JSON object.")
    return parsed


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(1)


def emit_context(event: str, message: str) -> None:
    print(
        json.dumps(
            {"hookSpecificOutput": {"hookEventName": event, "additionalContext": message}},
            ensure_ascii=True,
        )
    )


def block(event: str, reason: str) -> None:
    if event == "PreToolUse":
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": event,
                        "permissionDecision": "deny",
                        "permissionDecisionReason": reason,
                        "additionalContext": reason,
                    }
                },
                ensure_ascii=True,
            )
        )
        raise SystemExit(2)
    if event == "Stop":
        print(json.dumps({"decision": "block", "reason": reason}, ensure_ascii=True))
        raise SystemExit(2)
    emit_context(event, reason)
    raise SystemExit(2)


def tool_name(input_data: dict[str, Any]) -> str:
    return str(input_data.get("tool_name") or input_data.get("toolName") or "")


def tool_input(input_data: dict[str, Any]) -> dict[str, Any]:
    value = input_data.get("tool_input") or input_data.get("toolInput") or {}
    return value if isinstance(value, dict) else {}


def tool_output(input_data: dict[str, Any]) -> dict[str, Any]:
    value = input_data.get("tool_output") or input_data.get("toolOutput") or {}
    return value if isinstance(value, dict) else {}


def handle_session_start(input_data: dict[str, Any], event: str) -> None:
    emit_context(
        event,
        "Arclayer Claude hooks are active. Use `rtk pnpm ...` repo scripts, use GitNexus for discovery on "
        "medium+ tasks, and include code-review-engine changed audit evidence for review-sensitive edits. "
        + gitnexus_index_context(),
    )


def handle_pre_tool_use(input_data: dict[str, Any], event: str) -> None:
    name = tool_name(input_data)
    data = tool_input(input_data)
    if name == "Bash":
        command = str(data.get("command") or "")
        enforce_arclayer_command(command, event)
        maybe_emit_gitnexus_augment(name, command, data, event)
        return
    if name in {"Grep", "Glob"}:
        maybe_emit_gitnexus_augment(name, "", data, event)
        return
    if name in EDIT_TOOLS:
        enforce_generated_artifact_policy(data, input_data, event)


def handle_post_tool_use(input_data: dict[str, Any], event: str) -> None:
    name = tool_name(input_data)
    if name == "Bash":
        command = str(tool_input(input_data).get("command") or "")
        output = tool_output(input_data)
        exit_code = output.get("exit_code", output.get("exitCode"))
        if exit_code in (None, 0, "0"):
            maybe_emit_gitnexus_staleness(command, event)
        return
    if name in EDIT_TOOLS:
        maybe_emit_validation_hint(tool_input(input_data), input_data, event)


def handle_post_tool_use_failure(input_data: dict[str, Any], event: str) -> None:
    emit_context(event, "The tool failed. Debug from the surfaced error; do not treat the action as successful.")


def handle_stop(input_data: dict[str, Any], event: str) -> None:
    message = assistant_message(input_data)
    if not message or not COMPLETION_RE.search(message):
        return
    if ARCLAYER_EVIDENCE_RE.search(message):
        return
    block(
        event,
        "The final Arclayer handoff claims completion but lacks concrete validation evidence such as "
        "`rtk pnpm api:check`, `rtk pnpm admin:check`, `rtk pnpm check`, code-review-engine output, "
        "or an explicit reason validation could not run.",
    )


def enforce_arclayer_command(command: str, event: str) -> None:
    stripped = command.strip()
    if not stripped:
        block(event, "Empty Bash command is not allowed.")
    if not stripped.startswith("rtk "):
        block(event, "Arclayer Bash commands must start with `rtk `.")

    effective = effective_command(stripped)
    if re.search(r"(^|\s)\.?/?\.venv/bin/", stripped):
        block(event, "Arclayer commands must not call `.venv/bin/*` directly. Use repo scripts through `rtk pnpm ...`.")
    if re.match(r"^(npm\s+(run|install|test|exec|ci)\b|yarn\b|bun\b|npx\b)", effective):
        block(event, "Arclayer uses pnpm workspace scripts. Do not use npm/yarn/bun/npx for repo work.")
    if re.search(r"\bdocker\s+compose\s+up\b|\bdocker-compose\s+up\b", effective):
        block(event, "Long-lived Docker compose commands are not allowed unless the user explicitly requests a running service.")
    if effective.startswith("pnpm "):
        script = pnpm_script_name(effective)
        if script in {"dev", "start", "serve", "preview"} or script.startswith("infra:"):
            block(event, "Long-lived Arclayer runtime commands require explicit user request.")


def maybe_emit_gitnexus_augment(name: str, command: str, data: dict[str, Any], event: str) -> None:
    if not GITNEXUS_DIR.exists():
        return
    pattern = extract_search_pattern(name, command, data)
    if not pattern:
        return
    try:
        result = subprocess.run(
            ["gitnexus", "augment", "--", pattern],
            cwd=PROJECT_ROOT,
            text=True,
            capture_output=True,
            timeout=8,
            check=False,
        )
    except Exception as exc:
        emit_context(event, f"GitNexus augment failed before execution: {exc}")
        return
    output = "\n".join(part.strip() for part in (result.stdout, result.stderr) if part and part.strip())
    if result.returncode == 0 and output:
        emit_context(event, output)
    elif result.returncode != 0 and output:
        emit_context(event, f"GitNexus augment failed with exit {result.returncode}: {output[:1200]}")


def maybe_emit_gitnexus_staleness(command: str, event: str) -> None:
    if not re.search(r"\bgit\s+(commit|merge|rebase|cherry-pick|pull)\b", effective_command(command)):
        return
    if not GITNEXUS_DIR.exists():
        return
    head = git_head()
    last_commit = gitnexus_last_commit()
    if head and head != last_commit:
        indexed = last_commit[:7] if last_commit else "never"
        emit_context(
            event,
            f"GitNexus index is stale after git mutation (indexed {indexed}, HEAD {head[:7]}). "
            "Run `rtk gitnexus analyze . --skip-agents-md` before relying on graph context.",
        )


def maybe_emit_validation_hint(data: dict[str, Any], input_data: dict[str, Any], event: str) -> None:
    paths = extract_paths(data, session_cwd(input_data))
    rel_paths = [relative_to_project(path) for path in paths if is_relative_to(path, PROJECT_ROOT)]
    commands: set[str] = set()
    notes: list[str] = []
    audit_relevant = False

    for rel in rel_paths:
        rel_text = rel.as_posix()
        if rel_text.startswith("apps/api/"):
            commands.add(API_CHECK_COMMAND)
            notes.append("api:check exercises ruff, ty, and pytest through package scripts.")
            audit_relevant = True
        elif rel_text.startswith("apps/admin/"):
            commands.add(ADMIN_CHECK_COMMAND)
            notes.append("admin:check exercises oxlint, oxfmt, tsc, and vitest through package scripts.")
            audit_relevant = True
            if is_vite_related(rel_text):
                commands.add(ADMIN_BUILD_COMMAND)
                notes.append("Vite/build-surface changes also need admin:build.")
        elif rel_text.startswith(("packages/", "plugins/")):
            commands.add(CROSS_APP_CHECK_COMMAND)
            audit_relevant = True
            if is_vite_related(rel_text):
                commands.add(ADMIN_BUILD_COMMAND)
                notes.append("Shared Vite config changes also need admin:build.")
        elif rel_text.startswith("scripts/code-review-engine/"):
            commands.add(CODE_REVIEW_TEST_COMMAND)
            audit_relevant = True
        elif rel_text in {"package.json", "turbo.json", "pnpm-workspace.yaml"}:
            commands.add(CROSS_APP_CHECK_COMMAND)
            audit_relevant = True
            if rel_text == "package.json":
                commands.add(ADMIN_BUILD_COMMAND)
                notes.append("Root dependency/script changes can affect Vite build behavior; include admin:build.")

        if rel_text.startswith("docs/spec/"):
            notes.append("docs/spec is canonical implementation contract surface.")
            audit_relevant = True
        elif rel_text.startswith("docs/guidelines/"):
            notes.append("docs/guidelines is non-spec guidance only.")

    if audit_relevant:
        commands.add(CODE_REVIEW_CHANGED_COMMAND)
        notes.append("code-review-engine changed audits fail only on stable blocking rules; prototype findings remain report-only.")

    if not commands and not notes:
        return
    pieces = []
    if commands:
        pieces.append("Suggested validation: " + ", ".join(sorted(commands)) + ".")
    if notes:
        pieces.append(" ".join(sorted(set(notes))))
    emit_context(event, " ".join(pieces))


def enforce_generated_artifact_policy(data: dict[str, Any], input_data: dict[str, Any], event: str) -> None:
    for path in extract_paths(data, session_cwd(input_data)):
        if not is_relative_to(path, PROJECT_ROOT):
            continue
        rel_text = relative_to_project(path).as_posix()
        parts = set(Path(rel_text).parts)
        if rel_text == "pnpm-lock.yaml":
            block(event, "Do not hand-edit pnpm-lock.yaml. Let the package manager update it when required.")
        generated_markers = {"node_modules", "dist", "build", ".next", ".turbo", ".gitnexus", "coverage", "__generated__"}
        if parts & generated_markers or rel_text.endswith((".tsbuildinfo", ".map")):
            block(event, f"Do not edit generated or cache artifact directly: {rel_text}")


def effective_command(command: str) -> str:
    tokens = command_tokens(command)
    return " ".join(tokens) if tokens else command


def command_tokens(command: str) -> list[str]:
    try:
        tokens = shlex.split(command)
    except ValueError:
        return []
    if tokens and tokens[0] == "rtk":
        tokens = tokens[1:]
    if tokens and tokens[0] == "proxy":
        tokens = tokens[1:]
    return tokens


def pnpm_script_name(command: str) -> str:
    tokens = command_tokens(command)
    if not tokens or tokens[0] != "pnpm":
        return ""
    index = 1
    while index < len(tokens):
        token = tokens[index]
        if token in PNPM_OPTION_VALUES:
            index += 2
            continue
        if token.startswith("--filter=") or token.startswith("--dir="):
            index += 1
            continue
        if token.startswith("-"):
            index += 1
            continue
        return token
    return ""


def extract_search_pattern(name: str, command: str, data: dict[str, Any]) -> str | None:
    if name == "Grep":
        pattern = data.get("pattern")
        return pattern if isinstance(pattern, str) and len(pattern) >= 3 else None
    if name == "Glob":
        pattern = data.get("pattern")
        if not isinstance(pattern, str):
            return None
        match = re.search(r"[A-Za-z_][A-Za-z0-9_-]{2,}", pattern)
        return match.group(0) if match else None
    tokens = command_tokens(command)
    if not tokens or tokens[0] not in {"rg", "grep"}:
        return None
    index = 1
    while index < len(tokens):
        token = tokens[index]
        if token == "--":
            index += 1
            continue
        if token in RG_PATTERN_FLAGS and index + 1 < len(tokens):
            candidate = tokens[index + 1].strip("'\"")
            return candidate if len(candidate) >= 3 else None
        if token in RG_VALUE_FLAGS:
            index += 2
            continue
        if token.startswith("--glob=") or token.startswith("--type="):
            index += 1
            continue
        if token.startswith("-"):
            index += 1
            continue
        candidate = token.strip("'\"")
        return candidate if len(candidate) >= 3 else None
    return None


def is_vite_related(rel_text: str) -> bool:
    name = Path(rel_text).name
    return (
        "vite.config" in name
        or rel_text.startswith("packages/internal/vite-config/")
        or rel_text.startswith("apps/admin/scripts/")
        or rel_text.startswith("apps/admin/index.html")
    )


def extract_paths(data: dict[str, Any], cwd: Path) -> list[Path]:
    raw_paths: list[str] = []
    for key in ("file_path", "filePath", "path", "filename", "target_file", "targetFile"):
        value = data.get(key)
        if isinstance(value, str):
            raw_paths.append(value)
    edits = data.get("edits")
    if isinstance(edits, list):
        for edit in edits:
            if isinstance(edit, dict):
                value = edit.get("file_path") or edit.get("filePath") or edit.get("path")
                if isinstance(value, str):
                    raw_paths.append(value)
    raw_paths.extend(parse_patch_paths(extract_written_text(data)))
    resolved: list[Path] = []
    seen: set[Path] = set()
    for raw_path in raw_paths:
        path = Path(raw_path).expanduser()
        if not path.is_absolute():
            path = cwd / path
        path = path.resolve()
        if path not in seen:
            seen.add(path)
            resolved.append(path)
    return resolved


def parse_patch_paths(text: str) -> list[str]:
    paths: list[str] = []
    for line in text.splitlines():
        match = re.match(r"\*\*\* (?:Add|Update|Delete) File: (.+)$", line)
        if match:
            paths.append(match.group(1).strip())
            continue
        move_match = re.match(r"\*\*\* Move to: (.+)$", line)
        if move_match:
            paths.append(move_match.group(1).strip())
            continue
        diff_match = re.match(r"(?:---|\+\+\+) [ab]/(.+)$", line)
        if diff_match:
            paths.append(diff_match.group(1).strip())
    return paths


def extract_written_text(data: dict[str, Any]) -> str:
    chunks: list[str] = []
    for key in ("patch", "input", "content", "text", "diff", "new_string", "newString"):
        value = data.get(key)
        if isinstance(value, str):
            chunks.append(value)
    return "\n".join(chunks)


def session_cwd(input_data: dict[str, Any]) -> Path:
    return Path(str(input_data.get("cwd") or os.getcwd())).expanduser().resolve()


def is_relative_to(path: Path, base: Path) -> bool:
    try:
        path.relative_to(base)
        return True
    except ValueError:
        return False


def relative_to_project(path: Path) -> Path:
    return path.relative_to(PROJECT_ROOT)


def gitnexus_index_context() -> str:
    if not GITNEXUS_DIR.exists():
        return "No Arclayer GitNexus index is present; run `rtk gitnexus analyze . --skip-agents-md` before relying on graph context."
    last_commit = gitnexus_last_commit()
    head = git_head()
    if head and last_commit and head != last_commit:
        return f"GitNexus index is stale (indexed {last_commit[:7]}, HEAD {head[:7]}). Reindex before graph-dependent work."
    return "GitNexus index is present."


def git_head() -> str:
    try:
        result = subprocess.run(["git", "rev-parse", "HEAD"], cwd=PROJECT_ROOT, text=True, capture_output=True, timeout=3, check=False)
    except Exception:
        return ""
    return result.stdout.strip() if result.returncode == 0 else ""


def gitnexus_last_commit() -> str:
    meta_path = GITNEXUS_DIR / "meta.json"
    if not meta_path.exists():
        return ""
    try:
        data = json.loads(meta_path.read_text(encoding="utf-8"))
    except Exception:
        return ""
    value = data.get("lastCommit")
    return value if isinstance(value, str) else ""


def assistant_message(input_data: dict[str, Any]) -> str:
    for key in ("last_assistant_message", "lastAssistantMessage", "assistant_response", "assistantResponse", "final_response", "finalResponse", "response", "message"):
        value = input_data.get(key)
        if isinstance(value, str):
            return value
    return ""


if __name__ == "__main__":
    main()
