"""Plugin architecture audit rules.

New architecture: core/plugin/
  - Plugin system with lifecycle integration via PluginLifecycleManager.
  - Plugins must register lifecycle subscribers for their operations.
  - Plugins with UI must provide zh-CN and en-US locale resources.
  - Plugin structure: plugins/<plugin_id>/locales/<locale>/*.json
"""

from __future__ import annotations

import pathlib

from code_review_engine.migrated.contracts import Severity, Violation
from code_review_engine.migrated.rules.base import AuditRule, v
from code_review_engine.migrated.runtime import get_repo_root_from_env


def _repo_root() -> pathlib.Path:
    env_root = get_repo_root_from_env()
    if env_root is not None:
        return env_root
    return pathlib.Path(".")


class PluginMustRegisterLifecycle(AuditRule):
    """Plugins must register lifecycle subscribers for their operations."""

    rule_id = "plugin.must-register-lifecycle"
    description = "Plugins extending EntityManager behavior must register lifecycle subscribers."

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        root = _repo_root()
        plugins_dir = root / "plugins"
        if not plugins_dir.is_dir():
            return violations

        for plugin_dir in sorted(plugins_dir.iterdir()):
            if not plugin_dir.is_dir() or plugin_dir.name.startswith("."):
                continue
            # Check plugin has lifecycle registration
            lifecycle_file = plugin_dir / "lifecycle.py"
            init_file = plugin_dir / "__init__.py"
            has_lifecycle = lifecycle_file.exists()
            has_register = False
            for f in (lifecycle_file, init_file):
                if not f.exists():
                    continue
                try:
                    content = f.read_text(encoding="utf-8")
                except (UnicodeDecodeError, OSError):
                    continue
                if "register" in content and "lifecycle" in content.lower():
                    has_register = True
                    break

            if not has_lifecycle and not has_register:
                violations.append(
                    v(
                        file=str(plugin_dir.relative_to(root)),
                        line=0,
                        rule=self.rule_id,
                        message=f"Plugin '{plugin_dir.name}' has no lifecycle registration. Register subscribers via PluginLifecycleManager.",
                        severity=Severity.MAJOR,
                        evidence="Missing lifecycle.py or lifecycle registration",
                    )
                )
        return violations


class PluginMustHaveLocales(AuditRule):
    """Plugins with UI must provide zh-CN and en-US locale resources."""

    rule_id = "plugin.must-have-locales"
    description = "Plugins must have zh-CN and en-US locale files per i18n.md sec 8."

    REQUIRED_LOCALES = frozenset({"zh-CN", "en-US"})

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        root = _repo_root()
        plugins_dir = root / "plugins"
        if not plugins_dir.is_dir():
            return violations

        for plugin_dir in sorted(plugins_dir.iterdir()):
            if not plugin_dir.is_dir() or plugin_dir.name.startswith("."):
                continue
            locales_dir = plugin_dir / "locales"
            if not locales_dir.is_dir():
                # Only flag if plugin has UI code
                has_ui = any((plugin_dir / d).exists() for d in ("components", "pages", "routes", "ui"))
                if has_ui:
                    violations.append(
                        v(
                            file=str(plugin_dir.relative_to(root)),
                            line=0,
                            rule=self.rule_id,
                            message=f"Plugin '{plugin_dir.name}' has UI but no locales/ directory. Add zh-CN + en-US locale files.",
                            severity=Severity.MINOR,
                            evidence="Missing locales/ directory",
                        )
                    )
                continue

            present = {d.name for d in locales_dir.iterdir() if d.is_dir()}
            missing = self.REQUIRED_LOCALES - present
            if missing:
                violations.append(
                    v(
                        file=str(plugin_dir.relative_to(root)),
                        line=0,
                        rule=self.rule_id,
                        message=f"Plugin '{plugin_dir.name}' missing locale(s): {sorted(missing)}.",
                        severity=Severity.MINOR,
                        evidence=f"Present: {sorted(present)}, Missing: {sorted(missing)}",
                    )
                )
        return violations
