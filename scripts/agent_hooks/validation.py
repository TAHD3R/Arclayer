"""Repository-aware validation plans emitted after project edits."""

from __future__ import annotations

import json
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from .policy import QUALITY_SCRIPTS, is_relative_to

CODE_REVIEW_CHANGED_COMMAND = (
    "rtk pnpm code-review-engine --scope changed --base HEAD --format json "
    "--output reports/code-review-engine/changed.json"
)
CODE_REVIEW_TEST_COMMAND = "rtk pnpm -C scripts/code-review-engine test"
HOOKS_TEST_COMMAND = "rtk pnpm hooks:test"
API_CHECK_COMMAND = "rtk pnpm api:check"
ADMIN_CHECK_COMMAND = "rtk pnpm admin:check"
ADMIN_BUILD_COMMAND = "rtk pnpm admin:build"
CROSS_APP_CHECK_COMMAND = "rtk pnpm check"


@dataclass(frozen=True)
class ValidationPlan:
    commands: tuple[str, ...]
    notes: tuple[str, ...]

    def message(self) -> str:
        pieces: list[str] = []
        if self.commands:
            pieces.append("Suggested validation: " + ", ".join(self.commands) + ".")
        if self.notes:
            pieces.append(" ".join(self.notes))
        return " ".join(pieces)


def validation_plan(project_root: Path, paths: Iterable[Path]) -> ValidationPlan:
    commands: list[str] = []
    notes: list[str] = []
    audit_relevant = False
    for path in paths:
        if not is_relative_to(path, project_root):
            continue
        rel_text = path.relative_to(project_root).as_posix()
        if rel_text.startswith("apps/api/"):
            _append_unique(commands, API_CHECK_COMMAND)
            audit_relevant = True
        elif rel_text.startswith("apps/admin/"):
            _append_unique(commands, ADMIN_CHECK_COMMAND)
            audit_relevant = True
            if is_vite_related(rel_text):
                _append_unique(commands, ADMIN_BUILD_COMMAND)
        elif rel_text.startswith("packages/"):
            package_commands, package_note = _package_validation(project_root, path)
            for command in package_commands:
                _append_unique(commands, command)
            if package_note:
                _append_unique(notes, package_note)
            _append_unique(commands, CROSS_APP_CHECK_COMMAND)
            _append_unique(notes, "Shared package changes require a package-local gate plus an affected consumer gate.")
            audit_relevant = True
            if is_vite_related(rel_text):
                _append_unique(commands, ADMIN_BUILD_COMMAND)
        elif rel_text.startswith("plugins/"):
            _append_unique(commands, API_CHECK_COMMAND)
            _append_unique(commands, CROSS_APP_CHECK_COMMAND)
            _append_unique(notes, "Plugin changes require the API extension gate plus the cross-app consumer gate.")
            audit_relevant = True
        elif rel_text.startswith("scripts/agent_hooks/") or rel_text.startswith(".codex/hooks/"):
            _append_unique(commands, HOOKS_TEST_COMMAND)
            audit_relevant = True
        elif rel_text.startswith("scripts/code-review-engine/"):
            _append_unique(commands, CODE_REVIEW_TEST_COMMAND)
            audit_relevant = True
        elif rel_text in {"package.json", "turbo.json", "pnpm-workspace.yaml"}:
            _append_unique(commands, CROSS_APP_CHECK_COMMAND)
            audit_relevant = True
        if rel_text.startswith("docs/spec/"):
            _append_unique(notes, "docs/spec is the canonical implementation contract surface.")
            audit_relevant = True
        elif rel_text.startswith("docs/guidelines/"):
            _append_unique(notes, "docs/guidelines is non-spec guidance only.")

    if audit_relevant:
        _append_unique(commands, CODE_REVIEW_CHANGED_COMMAND)
    return ValidationPlan(tuple(commands), tuple(notes))


def _package_validation(project_root: Path, changed_path: Path) -> tuple[list[str], str]:
    manifest = _nearest_manifest(project_root / "packages", changed_path)
    if manifest is None:
        return (
            [],
            "No package.json was found for the changed shared package; a package-local gate must be defined explicitly.",
        )
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [], f"Cannot derive the package-local gate from {manifest.relative_to(project_root)}: {exc}."
    name = data.get("name")
    scripts = data.get("scripts")
    if not isinstance(name, str) or not isinstance(scripts, dict):
        return [], f"{manifest.relative_to(project_root)} declares no package-local quality scripts."
    if name == "@arclayer/cli":
        return ["rtk pnpm cli:check"], ""
    if name == "@arclayer/management-sdk":
        return ["rtk pnpm sdk:check"], ""
    if isinstance(scripts.get("check"), str):
        return [f"rtk pnpm --filter {name} check"], ""
    commands = [
        f"rtk pnpm --filter {name} {script}" for script in QUALITY_SCRIPTS if isinstance(scripts.get(script), str)
    ]
    if commands:
        return commands, ""
    return [], f"{manifest.relative_to(project_root)} declares no package-local quality scripts."


def _nearest_manifest(packages_root: Path, changed_path: Path) -> Path | None:
    current = changed_path if changed_path.is_dir() else changed_path.parent
    while is_relative_to(current, packages_root):
        manifest = current / "package.json"
        if manifest.is_file():
            return manifest
        if current == packages_root:
            break
        current = current.parent
    return None


def is_vite_related(rel_text: str) -> bool:
    name = Path(rel_text).name
    return (
        "vite.config" in name
        or rel_text.startswith("packages/internal/vite-config/")
        or rel_text.startswith("apps/admin/scripts/")
        or rel_text.startswith("apps/admin/index.html")
    )


def _append_unique(items: list[str], value: str) -> None:
    if value not in items:
        items.append(value)
