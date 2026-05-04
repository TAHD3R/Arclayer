from __future__ import annotations

import os
from pathlib import Path

_ENV_REPO_ROOT = "CODE_REVIEW_ENGINE_REPO_ROOT"


def get_repo_root_from_env() -> Path | None:
    raw = os.environ.get(_ENV_REPO_ROOT)
    if not raw:
        return None
    return Path(raw).resolve()


def set_repo_root_env(repo_root: Path) -> None:
    os.environ[_ENV_REPO_ROOT] = str(repo_root.resolve())
