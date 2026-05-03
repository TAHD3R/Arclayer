from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import subprocess


@dataclass(frozen=True)
class EnginePaths:
    repo_root: Path
    scripts_root: Path


def resolve_repo_root(explicit_repo_root: str | None = None) -> Path:
    if explicit_repo_root:
        repo_root = Path(explicit_repo_root).expanduser().resolve()
    else:
        output = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
        repo_root = Path(output).resolve()

    if not repo_root.exists():
        raise FileNotFoundError(f"repo root does not exist: {repo_root}")
    return repo_root


def build_paths(explicit_repo_root: str | None = None) -> EnginePaths:
    repo_root = resolve_repo_root(explicit_repo_root)
    scripts_root = repo_root / "scripts" / "code-review-engine"
    return EnginePaths(repo_root=repo_root, scripts_root=scripts_root)
