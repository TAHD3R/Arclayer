from __future__ import annotations

import json
from pathlib import Path

from code_review_engine.cli import main


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
    assert "service.no-direct-orm" in payload["rules_applied"]
    assert payload["metadata"]["status"] == "migrated"
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
    assert exit_code == 1
    assert payload["selector"]["scope"] == "rules"
    assert payload["rules_applied"] == ["service.no-direct-orm"]
    assert payload["summary"]["blockers"] == 1


def test_cli_writes_report_output_file(capsys, tmp_path: Path) -> None:
    service = tmp_path / "apps/api/src/modules/analytics/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "class ActivityService(BaseService):\n"
        "    async def get_event(self):\n"
        "        return await AuditEvent.get_or_none(id=1)\n",
        encoding="utf-8",
    )
    output_path = tmp_path / "reports/audit-report.json"

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
    assert exit_code == 1
    assert output_path.exists()
    assert payload["summary"]["blockers"] == 1
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
    assert exit_code == 1
    assert len(artifact_lines) == 1
    artifact_path = Path(artifact_lines[0].split("Report artifact: ", 1)[1].strip())
    assert artifact_path.is_file()
    assert "/reports/code-review-engine/" in artifact_path.as_posix()
    payload = json.loads(artifact_path.read_text(encoding="utf-8"))
    assert payload["summary"]["blockers"] == 1


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
    repo_root = Path(__file__).resolve().parents[3]

    exit_code = main(["--repo-root", str(repo_root), "--scope", "changed", "--base", "HEAD", "--format", "json"])

    captured = capsys.readouterr()
    payload = json.loads(captured.out)
    changed_roots = {
        "scripts/code-review-engine/README.md",
        "scripts/code-review-engine/src/code_review_engine/engine.py",
        "scripts/code-review-engine/src/code_review_engine/rules/__init__.py",
        "scripts/code-review-engine/src/code_review_engine/migrated/",
        "scripts/code-review-engine/tests/test_cli.py",
        "scripts/code-review-engine/tests/test_rules.py",
    }
    assert exit_code == 0
    assert payload["summary"]["total_findings"] == 0
    assert all(any(finding["file"].startswith(root) for root in changed_roots) for finding in payload["findings"])


def test_cli_module_scope_accepts_clean_analytics_module(capsys) -> None:
    repo_root = Path(__file__).resolve().parents[3]

    exit_code = main(["--repo-root", str(repo_root), "--scope", "module", "--module", "analytics", "--format", "json"])

    captured = capsys.readouterr()
    payload = json.loads(captured.out)
    assert exit_code == 0
    assert payload["summary"]["total_findings"] == 0
    assert payload["findings"] == []


def test_cli_full_scope_runs_migrated_rules_and_accepts_clean_repo(capsys) -> None:
    repo_root = Path(__file__).resolve().parents[3]

    exit_code = main(["--repo-root", str(repo_root), "--scope", "full", "--format", "json"])

    captured = capsys.readouterr()
    payload = json.loads(captured.out)
    assert exit_code == 0
    assert payload["selector"]["scope"] == "full"
    assert len(payload["rules_applied"]) > 4
    assert payload["summary"]["total_findings"] == 0
    assert payload["summary"]["blockers"] == 0
