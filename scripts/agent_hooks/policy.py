"""Platform-independent command, completion, and file-write policy."""

from __future__ import annotations

import re
import shlex
from collections.abc import Iterable
from pathlib import Path
from typing import Any

LONG_RUNNING_OPT_IN = "ARCLAYER_HOOK_ALLOW_LONG_RUNNING=1"
STATUS_CAPTURE_FAILURE_EXIT = 125
PNPM_OPTION_VALUES = {"-C", "--dir", "--filter", "-F", "--workspace-root"}
QUALITY_SCRIPTS = ("lint", "format", "typecheck", "test", "build")
EDIT_TOOLS = {"apply_patch", "Edit", "MultiEdit", "Write", "NotebookEdit"}

COMPLETION_RE = re.compile(
    r"\b(done|completed|implemented|fixed|resolved|passed|verified|validated|committed)\b|"
    r"已完成|完成了|已修复|修复了|已通过|测试通过|已验证|已提交",
    re.IGNORECASE,
)
OMISSION_REASON_RES = (
    re.compile(r"(?:未运行|未执行|无法运行|未能运行)[^。\n]*(?:因为|由于|原因(?:是)?|[:：])\s*\S+"),
    re.compile(
        r"(?:not run|not executed|could not run|unable to run)[^.\n]*(?:because|due to|reason\s*:)\s*\S+",
        re.IGNORECASE,
    ),
)


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


def command_with_status_capture(command: str, status_path: Path, shell: str) -> str:
    """Wrap one Codex Bash command without guessing success from raw output text."""
    quoted_command = shlex.quote(command)
    quoted_path = shlex.quote(str(status_path))
    quoted_shell = shlex.quote(shell)
    script = "\n".join((
        "umask 077",
        f"{quoted_shell} -c {quoted_command}",
        "arclayer_hook_status=$?",
        f"if ! printf '%s\\n' \"$arclayer_hook_status\" > {quoted_path}; then",
        "  printf '%s\\n' 'Arclayer Hook could not persist the command exit status.' >&2",
        f"  exit {STATUS_CAPTURE_FAILURE_EXIT}",
        "fi",
        'exit "$arclayer_hook_status"',
    ))
    return f"rtk proxy {quoted_shell} -c {shlex.quote(script)}"


def effective_tokens(command: str) -> list[str]:
    tokens = command_tokens(command)
    if not tokens or tokens[0] != "env":
        return tokens
    index = 1
    while index < len(tokens):
        token = tokens[index]
        if token == "--":
            return tokens[index + 1 :]
        if token.startswith("-") or "=" in token:
            index += 1
            continue
        return tokens[index:]
    return []


def command_violation(command: str) -> str | None:
    stripped = command.strip()
    if not stripped:
        return "Empty Bash command is not allowed."
    if not stripped.startswith("rtk "):
        return "Arclayer Bash commands must start with `rtk `."
    if re.search(r"(^|\s)\.?/?\.venv/bin/", stripped):
        return "Arclayer commands must not call `.venv/bin/*` directly. Use repo scripts through `rtk pnpm ...`."

    tokens = effective_tokens(stripped)
    effective = " ".join(tokens)
    if re.match(r"^(npm\s+(run|install|test|exec|ci)\b|yarn\b|bun\b|npx\b)", effective):
        return "Arclayer uses pnpm workspace scripts. Do not use npm/yarn/bun/npx for repo work."
    if _is_long_running(tokens) and LONG_RUNNING_OPT_IN not in command_tokens(stripped):
        return (
            "Long-lived Arclayer commands require an explicit user request. After approval, opt in for that command with "
            f"`rtk proxy env {LONG_RUNNING_OPT_IN} ...`."
        )
    return None


def _is_long_running(tokens: list[str]) -> bool:
    effective = " ".join(tokens)
    if re.search(r"\bdocker\s+compose\s+up\b|\bdocker-compose\s+up\b", effective):
        return "-d" not in tokens and "--detach" not in tokens
    if not tokens or tokens[0] != "pnpm":
        return False
    script = pnpm_script_name(tokens)
    return script in {"dev", "start", "serve", "preview"} or script.startswith("infra:")


def pnpm_script_name(tokens: list[str]) -> str:
    if not tokens or tokens[0] != "pnpm":
        return ""
    index = 1
    while index < len(tokens):
        token = tokens[index]
        if token in PNPM_OPTION_VALUES:
            index += 2
            continue
        if token.startswith(("--filter=", "--dir=")):
            index += 1
            continue
        if token.startswith("-"):
            index += 1
            continue
        return token
    return ""


def is_successful_validation_command(command: str) -> bool:
    tokens = effective_tokens(command)
    if not tokens or tokens[0] != "pnpm":
        return False
    script = pnpm_script_name(tokens)
    if script in {
        "hooks:test",
        "api:check",
        "admin:check",
        "admin:build",
        "check",
        "build",
        "cli:check",
        "sdk:check",
    }:
        return True
    if script == "code-review-engine" and "--scope" in tokens and "changed" in tokens:
        return True
    if _pnpm_directory(tokens).as_posix() == "scripts/code-review-engine" and script in {"test", "cli"}:
        return True
    return _has_filter(tokens) and script in {*QUALITY_SCRIPTS, "check"}


def _pnpm_directory(tokens: list[str]) -> Path:
    for index, token in enumerate(tokens):
        if token in {"-C", "--dir"} and index + 1 < len(tokens):
            return Path(tokens[index + 1])
        if token.startswith("--dir="):
            return Path(token.partition("=")[2])
    return Path()


def _has_filter(tokens: list[str]) -> bool:
    return any(token in {"--filter", "-F"} or token.startswith("--filter=") for token in tokens)


def claims_completion(message: str) -> bool:
    return bool(COMPLETION_RE.search(message))


def has_explicit_validation_omission_reason(message: str) -> bool:
    return any(pattern.search(message) for pattern in OMISSION_REASON_RES)


def extract_paths(data: dict[str, Any], cwd: Path) -> tuple[Path, ...]:
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
    return tuple(resolved)


def extract_written_text(data: dict[str, Any]) -> str:
    chunks: list[str] = []
    for key in ("command", "patch", "input", "content", "text", "diff", "new_string", "newString"):
        value = data.get(key)
        if isinstance(value, str):
            chunks.append(value)
    return "\n".join(chunks)


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


def generated_artifact_violation(project_root: Path, paths: Iterable[Path]) -> str | None:
    generated_markers = {
        "node_modules",
        "dist",
        "build",
        ".next",
        ".turbo",
        ".gitnexus",
        "coverage",
        "__generated__",
    }
    for path in paths:
        if not is_relative_to(path, project_root):
            continue
        rel = path.relative_to(project_root)
        rel_text = rel.as_posix()
        if rel_text == "pnpm-lock.yaml":
            return "Do not hand-edit pnpm-lock.yaml. Let the package manager update it when required."
        if set(rel.parts) & generated_markers or rel_text.endswith((".tsbuildinfo", ".map")):
            return f"Do not edit generated or cache artifact directly: {rel_text}"
    return None


def is_relative_to(path: Path, base: Path) -> bool:
    try:
        path.relative_to(base)
        return True
    except ValueError:
        return False
