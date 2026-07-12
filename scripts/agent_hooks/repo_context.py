"""GitNexus freshness context kept outside the event dispatcher."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

from .policy import command_tokens


def gitnexus_index_context(project_root: Path) -> str:
    gitnexus_dir = project_root / ".gitnexus"
    if not gitnexus_dir.exists():
        return (
            "No Arclayer GitNexus index is present; for medium+ tasks run "
            "`rtk gitnexus analyze . --skip-agents-md` before relying on graph context."
        )
    head, head_error = _git_head(project_root)
    indexed, index_error = _gitnexus_last_commit(gitnexus_dir)
    if head_error or index_error:
        return f"GitNexus freshness could not be determined: {head_error or index_error}"
    if head and indexed and head != indexed:
        return (
            f"GitNexus index is stale (indexed {indexed[:7]}, HEAD {head[:7]}). Run "
            "`rtk gitnexus analyze . --skip-agents-md` before relying on graph context."
        )
    return "GitNexus index is present and current; use it explicitly for medium+ discovery and impact analysis."


def gitnexus_staleness_message(project_root: Path, command: str) -> str:
    effective = " ".join(command_tokens(command))
    if not re.search(r"\bgit\s+(commit|merge|rebase|cherry-pick|pull)\b", effective):
        return ""
    gitnexus_dir = project_root / ".gitnexus"
    if not gitnexus_dir.exists():
        return ""
    head, head_error = _git_head(project_root)
    indexed, index_error = _gitnexus_last_commit(gitnexus_dir)
    if head_error or index_error:
        return f"GitNexus freshness check failed: {head_error or index_error}"
    if head and head != indexed:
        current = indexed[:7] if indexed else "never"
        return (
            f"GitNexus index is stale after git mutation (indexed {current}, HEAD {head[:7]}). Run "
            "`rtk gitnexus analyze . --skip-agents-md` before relying on graph context."
        )
    return ""


def _git_head(project_root: Path) -> tuple[str, str]:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=project_root,
            text=True,
            capture_output=True,
            timeout=3,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return "", str(exc)
    if result.returncode != 0:
        return "", (result.stderr.strip() or f"git exited {result.returncode}")
    return result.stdout.strip(), ""


def _gitnexus_last_commit(gitnexus_dir: Path) -> tuple[str, str]:
    meta_path = gitnexus_dir / "meta.json"
    if not meta_path.exists():
        return "", f"missing {meta_path}"
    try:
        data = json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return "", str(exc)
    value = data.get("lastCommit")
    if not isinstance(value, str):
        return "", f"lastCommit is missing from {meta_path}"
    return value, ""
