from __future__ import annotations

import json
from pathlib import Path

import pytest
import code_review_engine.cli as cli_module
from code_review_engine.cli import main
from code_review_engine.migrated.contracts import Violation
from code_review_engine.migrated.rules.base import AuditRule
from code_review_engine.models import AuditScope, RuleMetadata, RuleStability, Severity
from code_review_engine.rules import ExecutableRule, RuleRegistry


def test_cli_json_empty_report(capsys, tmp_path: Path) -> None:
    subscribers = tmp_path / "apps/api/src/core/lifecycles/subscribers"
    subscribers.mkdir(parents=True)
    (subscribers / "audit.py").write_text("async def audit_lifecycle_events(event):\n    pass\n", encoding="utf-8")
    runtime_init = tmp_path / "apps/api/src/core/runtime_init.py"
    runtime_init.parent.mkdir(parents=True, exist_ok=True)
    runtime_init.write_text(
        "\n".join(
            [
                "async def init(lifecycle_dispatcher):",
                "    await lifecycle_dispatcher.register(action=LifecycleAction.BEFORE_CREATE, handler=handler)",
                "    await lifecycle_dispatcher.register(action=LifecycleAction.AFTER_CREATE, handler=handler)",
                "    await lifecycle_dispatcher.register(action=LifecycleAction.BEFORE_UPDATE, handler=handler)",
                "    await lifecycle_dispatcher.register(action=LifecycleAction.AFTER_UPDATE, handler=handler)",
                "    await lifecycle_dispatcher.register(action=LifecycleAction.BEFORE_DELETE, handler=handler)",
                "    await lifecycle_dispatcher.register(action=LifecycleAction.AFTER_DELETE, handler=handler)",
                "    await lifecycle_dispatcher.register(action=LifecycleAction.BEFORE_PUBLISH, handler=handler)",
                "    await lifecycle_dispatcher.register(action=LifecycleAction.AFTER_PUBLISH, handler=handler)",
                "",
            ]
        ),
        encoding="utf-8",
    )
    tests_core = tmp_path / "apps/api/tests/core"
    tests_core.mkdir(parents=True)
    (tests_core / "test_lifecycles.py").write_text("def test_lifecycles_placeholder():\n    assert True\n", encoding="utf-8")
    exit_code = main(["--repo-root", str(tmp_path), "--scope", "backend", "--format", "json"])

    captured = capsys.readouterr()
    payload = json.loads(captured.out)
    assert exit_code == 0
    assert payload["selector"]["scope"] == "backend"
    assert payload["summary"]["total_findings"] == 0
    assert payload["summary"]["blocking_findings"] == 0
    assert "service.no-direct-orm" in payload["rules_applied"]
    assert payload["metadata"]["status"] == "ok"
    assert payload["metadata"]["enforcement"] == "blocking-rule-stability"
    assert "Report artifact:" in captured.err


def test_cli_module_scope_requires_module(capsys, tmp_path: Path) -> None:
    exit_code = main(["--repo-root", str(tmp_path), "--scope", "module"])

    captured = capsys.readouterr()
    assert exit_code == 2
    assert "--scope module requires --module" in captured.err


def test_cli_rules_filter(capsys, tmp_path: Path) -> None:
    service = tmp_path / "apps/api/src/modules/analytics/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "class ActivityService(BaseService):\n"
        "    async def get_event(self):\n"
        "        return await AuditEvent.get_or_none(id=1)\n",
        encoding="utf-8",
    )

    exit_code = main(
        [
            "--repo-root",
            str(tmp_path),
            "--rules",
            "service.no-direct-orm",
            "--format",
            "json",
        ]
    )

    captured = capsys.readouterr()
    payload = json.loads(captured.out)
    assert exit_code == 0
    assert payload["selector"]["scope"] == "rules"
    assert payload["rules_applied"] == ["service.no-direct-orm"]
    assert payload["summary"]["blockers"] == 1
    assert payload["summary"]["blocking_findings"] == 0
    assert payload["summary"]["report_only_findings"] == 1
    assert payload["findings"][0]["rule_stability"] == "prototype"


def test_cli_writes_report_output_file(capsys, tmp_path: Path) -> None:
    service = tmp_path / "apps/api/src/modules/analytics/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "class ActivityService(BaseService):\n"
        "    async def get_event(self):\n"
        "        return await AuditEvent.get_or_none(id=1)\n",
        encoding="utf-8",
    )
    output_path = tmp_path / "output/code-review-engine/audit-report.json"

    exit_code = main(
        [
            "--repo-root",
            str(tmp_path),
            "--rules",
            "service.no-direct-orm",
            "--format",
            "json",
            "-o",
            str(output_path),
        ]
    )

    captured = capsys.readouterr()
    payload = json.loads(output_path.read_text(encoding="utf-8"))
    assert exit_code == 0
    assert output_path.exists()
    assert payload["summary"]["blockers"] == 1
    assert payload["summary"]["blocking_findings"] == 0
    assert f"Report artifact: {output_path}" in captured.err


def test_cli_writes_default_report_artifact(capsys, tmp_path: Path) -> None:
    service = tmp_path / "apps/api/src/modules/analytics/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "class ActivityService(BaseService):\n"
        "    async def get_event(self):\n"
        "        return await AuditEvent.get_or_none(id=1)\n",
        encoding="utf-8",
    )

    exit_code = main(
        [
            "--repo-root",
            str(tmp_path),
            "--rules",
            "service.no-direct-orm",
            "--format",
            "json",
        ]
    )

    captured = capsys.readouterr()
    artifact_lines = [line for line in captured.err.splitlines() if line.startswith("Report artifact: ")]
    assert exit_code == 0
    assert len(artifact_lines) == 1
    artifact_path = Path(artifact_lines[0].split("Report artifact: ", 1)[1].strip())
    assert artifact_path.is_file()
    assert "/output/code-review-engine/" in artifact_path.as_posix()
    payload = json.loads(artifact_path.read_text(encoding="utf-8"))
    assert payload["summary"]["blockers"] == 1
    assert payload["summary"]["blocking_findings"] == 0


def test_cli_enforces_stable_blocking_findings(capsys, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    registry = RuleRegistry(
        rules=(
            ExecutableRule(
                metadata=RuleMetadata(
                    id="custom.stable-blocker",
                    title="Stable blocker fixture",
                    category="test",
                    severity=Severity.BLOCKER,
                    supported_scopes=(AuditScope.RULES,),
                    source=("tests/test_cli.py",),
                    stability=RuleStability.BLOCKING,
                    owner="quality",
                    autofix="none",
                    dedupe_key="custom-stable-blocker",
                ),
                implementation=_StableBlockingRule(),
                symbol_driven=False,
            ),
        )
    )
    monkeypatch.setattr(cli_module, "DEFAULT_REGISTRY", registry)

    exit_code = main(
        [
            "--repo-root",
            str(tmp_path),
            "--rules",
            "custom.stable-blocker",
            "--format",
            "json",
        ]
    )

    captured = capsys.readouterr()
    payload = json.loads(captured.out)
    assert exit_code == 1
    assert payload["summary"]["blockers"] == 1
    assert payload["summary"]["blocking_findings"] == 1
    assert payload["findings"][0]["rule_stability"] == "blocking"


def test_cli_frontend_scope_reports_repo_relative_paths(capsys, tmp_path: Path) -> None:
    component = tmp_path / "apps/admin/src/pages/login/components/login-view.tsx"
    component.parent.mkdir(parents=True)
    component.write_text("export function LoginView(value: any) {\n  return value;\n}\n", encoding="utf-8")

    exit_code = main(["--repo-root", str(tmp_path), "--scope", "frontend", "--format", "json"])

    captured = capsys.readouterr()
    payload = json.loads(captured.out)
    assert exit_code == 0
    assert payload["summary"]["majors"] == 1
    assert payload["findings"][0]["file"] == "apps/admin/src/pages/login/components/login-view.tsx"


def test_cli_changed_scope_limits_findings_to_changed_files(capsys) -> None:
    import subprocess

    repo_root = Path(__file__).resolve().parents[3]

    exit_code = main(["--repo-root", str(repo_root), "--scope", "changed", "--base", "HEAD", "--format", "json"])

    captured = capsys.readouterr()
    payload = json.loads(captured.out)

    # Mirror changed-scope discovery: tracked diff plus untracked files.
    tracked_result = subprocess.run(
        ["git", "-C", str(repo_root), "diff", "--name-only", "HEAD", "--"],
        capture_output=True,
        check=True,
        text=True,
    )
    untracked_result = subprocess.run(
        ["git", "-C", str(repo_root), "ls-files", "--others", "--exclude-standard"],
        capture_output=True,
        check=True,
        text=True,
    )
    changed_files = frozenset(
        line.strip().replace("\\", "/").strip("/")
        for line in (*tracked_result.stdout.splitlines(), *untracked_result.stdout.splitlines())
        if line.strip()
    )
    # When there are no changed files, the changed scope should produce zero findings.
    if not changed_files:
        assert exit_code == 0
        assert payload["summary"]["total_findings"] == 0
        return

    def _matches_changed(file_path: str) -> bool:
        normalized = file_path.strip().replace("\\", "/").strip("/")
        if normalized in changed_files:
            return True
        prefix = normalized.rstrip("/") + "/"
        return any(cf == normalized or cf.startswith(prefix) for cf in changed_files)

    assert exit_code == 0
    assert all(_matches_changed(f["file"]) for f in payload["findings"]), (
        f"Some findings are outside changed files: "
        f"{[f['file'] for f in payload['findings'] if not _matches_changed(f['file'])]}"
    )


def test_cli_changed_scope_fails_loud_when_git_discovery_fails(capsys, tmp_path: Path) -> None:
    exit_code = main(["--repo-root", str(tmp_path), "--scope", "changed", "--base", "HEAD", "--format", "json"])

    captured = capsys.readouterr()
    assert exit_code == 2
    assert captured.out == ""
    assert "Git command failed for changed-scope discovery" in captured.err


def test_cli_module_scope_accepts_clean_analytics_module(capsys) -> None:
    repo_root = Path(__file__).resolve().parents[3]

    exit_code = main(["--repo-root", str(repo_root), "--scope", "module", "--module", "analytics", "--format", "json"])

    captured = capsys.readouterr()
    payload = json.loads(captured.out)
    assert exit_code == 0
    assert payload["summary"]["total_findings"] == 0
    assert payload["findings"] == []


def test_cli_full_scope_reports_real_repo_without_enforcing_prototype_rules(capsys) -> None:
    repo_root = Path(__file__).resolve().parents[3]

    exit_code = main(["--repo-root", str(repo_root), "--scope", "full", "--format", "json"])

    captured = capsys.readouterr()
    payload = json.loads(captured.out)
    assert exit_code == 0
    assert payload["selector"]["scope"] == "full"
    assert len(payload["rules_applied"]) > 4
    assert payload["metadata"]["enforcement"] == "blocking-rule-stability"
    assert payload["summary"]["blocking_findings"] == 0
    assert payload["summary"]["report_only_findings"] == payload["summary"]["total_findings"]


def test_cli_human_report_includes_finding_details(capsys, tmp_path: Path) -> None:
    service = tmp_path / "apps/api/src/modules/analytics/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "class ActivityService(BaseService):\n"
        "    async def get_event(self):\n"
        "        return await AuditEvent.get_or_none(id=1)\n",
        encoding="utf-8",
    )

    exit_code = main(["--repo-root", str(tmp_path), "--rules", "service.no-direct-orm", "--format", "human"])

    captured = capsys.readouterr()
    assert exit_code == 0
    assert "report-only BLOCKER/prototype service.no-direct-orm" in captured.out
    assert "apps/api/src/modules/analytics/service.py:3" in captured.out
    assert "AuditEvent.get_or_none" in captured.out


class _StableBlockingRule(AuditRule):
    rule_id = "custom.stable-blocker"
    description = "Fixture stable blocking rule."

    def check(self, symbols: list[dict]) -> list[Violation]:
        return [
            Violation(
                file="apps/api/src/modules/example/service.py",
                line=1,
                rule=self.rule_id,
                message="stable blocker",
                severity=Severity.BLOCKER,
                evidence="class ExampleService:",
            )
        ]
